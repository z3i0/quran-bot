const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    StreamType
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const { PermissionsBitField } = require('discord.js');
const { AUDIO_CONFIG, STREAM_TYPES, PLAYER_STATES, MESSAGES } = require('../utils/Constants');

/**
 * Unified Audio Manager - Handles all voice connections and audio playback
 * Combines functionality from the old audioManager.js and voiceStateUpdate.js
 */
class AudioManager {
    constructor() {
        // Core audio components
        this.connections = new Map();      // guildId -> VoiceConnection
        this.players = new Map();          // guildId -> AudioPlayer
        this.currentStreams = new Map();   // guildId -> StreamInfo
        this.volumes = new Map();          // guildId -> volume (0-2.0)
        this.ffmpegProcesses = new Map();  // guildId -> child_process
        this.guildSettings = new Map();    // guildId -> guild settings cache

        // Event listeners storage
        this.connectionListeners = new Map(); // guildId -> cleanup functions
        this.playerListeners = new Map();     // guildId -> cleanup functions

        console.log('[AudioManager] Unified Audio Manager initialized successfully');
    }

    // =============================================================================
    // CORE CONNECTION MANAGEMENT
    // =============================================================================

    /**
     * Join a voice channel with comprehensive error handling
     * @param {string} guildId - Discord guild ID
     * @param {string} channelId - Voice channel ID
     * @param {Guild} guild - Discord guild object
     * @param {Object} options - Additional options
     * @returns {Promise<{connection: VoiceConnection, player: AudioPlayer}>}
     */
    async joinVoiceChannel(guildId, channelId, guild, options = {}) {
        try {
            console.log(`[AudioManager] Joining voice channel ${channelId} in guild ${guildId}`);

            // Validate permissions
            const channel = guild.channels.cache.get(channelId);
            if (!channel || channel.type !== 2) {
                throw new Error('القناة الصوتية غير صالحة');
            }

            const permissions = channel.permissionsFor(guild.members.me);
            if (!permissions.has(PermissionsBitField.Flags.Connect) ||
                !permissions.has(PermissionsBitField.Flags.Speak)) {
                throw new Error(MESSAGES.ERRORS.PERMISSION_DENIED);
            }

            // Check if already connected to the SAME channel and connection is healthy
            const existingConnection = this.connections.get(guildId) || getVoiceConnection(guildId);
            if (existingConnection &&
                existingConnection.joinConfig.channelId === channelId &&
                existingConnection.state.status !== VoiceConnectionStatus.Destroyed &&
                existingConnection.state.status !== VoiceConnectionStatus.Disconnected) {

                console.log(`[AudioManager] Already connected to ${channelId}, skipping join.`);

                // Ensure internally tracked if it wasn't
                if (!this.connections.has(guildId)) {
                    this.connections.set(guildId, existingConnection);
                }

                // Check if player exists, if not create one
                let player = this.players.get(guildId);
                if (!player) {
                    player = createAudioPlayer();
                    existingConnection.subscribe(player);
                    this.players.set(guildId, player);
                    this.setupPlayerListeners(guildId, player);
                }

                return { connection: existingConnection, player };
            }

            // Clean up existing connection if it's different or unhealthy
            await this.cleanupGuildResources(guildId);

            // Create new connection
            const connection = joinVoiceChannel({
                channelId,
                guildId,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true,
            });

            // Handle Stage Channel specifically
            if (channel.type === 13) {
                try {
                    // Stage channels require the bot to be set as a speaker
                    setTimeout(async () => {
                        try {
                            const me = guild.members.me;
                            if (me && me.voice) {
                                await me.voice.setSuppressed(false);
                            }
                        } catch (err) {
                            console.warn(`[AudioManager] Could not set suppressed to false in Stage Channel: ${err.message}`);
                        }
                    }, 1500);
                } catch (err) {
                    console.warn(`[AudioManager] Error in stage channel handling: ${err.message}`);
                }
            }

            const player = createAudioPlayer();
            connection.subscribe(player);

            // Store references
            this.connections.set(guildId, connection);
            this.players.set(guildId, player);

            // Wait for connection to be ready
            await entersState(connection, VoiceConnectionStatus.Ready, AUDIO_CONFIG.CONNECTION_TIMEOUT);

            // Setup event listeners
            this.setupConnectionListeners(guildId, connection);
            this.setupPlayerListeners(guildId, player);

            console.log(`[AudioManager] Successfully joined voice channel in guild ${guildId}`);
            return { connection, player };
        } catch (error) {
            console.error(`[AudioManager] Failed to join voice channel in guild ${guildId}:`, error);
            await this.cleanupGuildResources(guildId);
            throw error;
        }
    }

    /**
     * Leave voice channel and cleanup all resources
     * @param {string} guildId - Discord guild ID
     * @returns {Promise<boolean>} Success status
     */
    async leaveVoiceChannel(guildId) {
        try {
            await this.cleanupGuildResources(guildId);
            console.log(`[AudioManager] Left voice channel in guild ${guildId}`);
            return true;
        } catch (error) {
            console.error(`[AudioManager] Error leaving voice channel in guild ${guildId}:`, error);
            return false;
        }
    }

    /**
     * Clean up all resources for a guild
     * @param {string} guildId - Discord guild ID
     */
    async cleanupGuildResources(guildId) {
        // Stop FFmpeg processes
        this.cleanupFFmpeg(guildId);

        // Clean up event listeners
        this.cleanupEventListeners(guildId);

        // Destroy existing connection
        const existingConnection = this.connections.get(guildId) || getVoiceConnection(guildId);
        if (existingConnection) {
            try {
                existingConnection.destroy();
            } catch (error) {
                console.warn(`[AudioManager] Error destroying connection for guild ${guildId}:`, error);
            }
        }

        // Clear all stored data
        this.connections.delete(guildId);
        this.players.delete(guildId);
        this.currentStreams.delete(guildId);
        // Keep volume settings and guild settings for user preference
    }

    // =============================================================================
    // EVENT LISTENER MANAGEMENT
    // =============================================================================

    /**
     * Setup connection event listeners with cleanup tracking
     * @param {string} guildId - Discord guild ID
     * @param {VoiceConnection} connection - Voice connection
     */
    setupConnectionListeners(guildId, connection) {
        const listeners = [];

        const disconnectedListener = async () => {
            try {
                console.log(`[AudioManager] Voice connection disconnected in guild ${guildId}`);
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
            } catch (error) {
                console.log(`[AudioManager] Connection could not recover, cleaning up guild ${guildId}`);
                await this.cleanupGuildResources(guildId);
            }
        };

        const destroyedListener = () => {
            console.log(`[AudioManager] Voice connection destroyed in guild ${guildId}`);
            this.cleanupGuildResources(guildId);
        };

        connection.on(VoiceConnectionStatus.Disconnected, disconnectedListener);
        connection.on(VoiceConnectionStatus.Destroyed, destroyedListener);

        listeners.push(
            () => connection.off(VoiceConnectionStatus.Disconnected, disconnectedListener),
            () => connection.off(VoiceConnectionStatus.Destroyed, destroyedListener)
        );

        this.connectionListeners.set(guildId, listeners);
    }

    /**
     * Setup player event listeners with cleanup tracking
     * @param {string} guildId - Discord guild ID
     * @param {AudioPlayer} player - Audio player
     */
    setupPlayerListeners(guildId, player) {
        const listeners = [];

        const idleListener = () => {
            const currentStream = this.currentStreams.get(guildId);

            if (currentStream?.type === STREAM_TYPES.RADIO) {
                console.log(`[AudioManager] Radio stream ended, restarting in guild ${guildId}`);
                setTimeout(() => this.restartRadio(guildId), 1000);
            } else if (currentStream?.type === STREAM_TYPES.QURAN) {
                console.log(`[AudioManager] Quran playback ended: ${currentStream.surahName} by ${currentStream.reciterName} in guild ${guildId}`);
                this.currentStreams.delete(guildId);
                this.cleanupFFmpeg(guildId);
            }
        };

        const playingListener = () => {
            const currentStream = this.currentStreams.get(guildId);
            const streamInfo = currentStream ? `${currentStream.type}: ${currentStream.surahName || 'radio'}` : 'unknown';
            console.log(`[AudioManager] Audio started playing in guild ${guildId} - ${streamInfo}`);
        };

        const pausedListener = () => {
            console.log(`[AudioManager] Audio paused in guild ${guildId}`);
        };

        const errorListener = (error) => {
            console.error(`[AudioManager] Player error in guild ${guildId}:`, error);
            const currentStream = this.currentStreams.get(guildId);

            if (currentStream?.type === STREAM_TYPES.RADIO) {
                console.log(`[AudioManager] Retrying radio after error in guild ${guildId}`);
                setTimeout(() => this.restartRadio(guildId), AUDIO_CONFIG.RETRY_DELAY);
            } else {
                this.currentStreams.delete(guildId);
                this.cleanupFFmpeg(guildId);
            }
        };

        player.on(AudioPlayerStatus.Idle, idleListener);
        player.on(AudioPlayerStatus.Playing, playingListener);
        player.on(AudioPlayerStatus.Paused, pausedListener);
        player.on('error', errorListener);

        listeners.push(
            () => player.off(AudioPlayerStatus.Idle, idleListener),
            () => player.off(AudioPlayerStatus.Playing, playingListener),
            () => player.off(AudioPlayerStatus.Paused, pausedListener),
            () => player.off('error', errorListener)
        );

        this.playerListeners.set(guildId, listeners);
    }

    /**
     * Clean up event listeners for a guild
     * @param {string} guildId - Discord guild ID
     */
    cleanupEventListeners(guildId) {
        // Clean up connection listeners
        const connectionCleanup = this.connectionListeners.get(guildId);
        if (connectionCleanup) {
            connectionCleanup.forEach(cleanup => cleanup());
            this.connectionListeners.delete(guildId);
        }

        // Clean up player listeners
        const playerCleanup = this.playerListeners.get(guildId);
        if (playerCleanup) {
            playerCleanup.forEach(cleanup => cleanup());
            this.playerListeners.delete(guildId);
        }
    }

    // =============================================================================
    // FFMPEG STREAM MANAGEMENT
    // =============================================================================

    /**
     * Create FFmpeg process for streaming audio with enhanced error handling
     * @param {string} url - Audio stream URL
     * @returns {ChildProcess} FFmpeg process
     */
    createFFmpegStream(url) {
        const inputArgs = [
            '-loglevel', 'error',
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-analyzeduration', '0',
            '-i', url
        ];
        const outputArgs = [
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1'
        ];
        const args = [...inputArgs, ...outputArgs];

        const ffmpeg = spawn('ffmpeg', args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Enhanced error handling
        ffmpeg.on('error', (error) => {
            console.error('[AudioManager] FFmpeg process error:', error);
        });

        ffmpeg.on('exit', (code, signal) => {
            if (code !== null && code !== 0) {
                console.warn(`[AudioManager] FFmpeg exited with code ${code}`);
            }
            if (signal) {
                console.warn(`[AudioManager] FFmpeg killed with signal ${signal}`);
            }
        });

        ffmpeg.stderr.on('data', (data) => {
            const errorMessage = data.toString().trim();
            if (errorMessage && !errorMessage.includes('deprecated') && !errorMessage.includes('bitrate')) {
                console.warn(`[AudioManager] FFmpeg warning: ${errorMessage}`);
            }
        });

        return ffmpeg;
    }

    /**
     * Cleanup FFmpeg process for a guild with enhanced cleanup
     * @param {string} guildId - Discord guild ID
     */
    cleanupFFmpeg(guildId) {
        const ffmpeg = this.ffmpegProcesses.get(guildId);
        if (ffmpeg && !ffmpeg.killed) {
            try {
                // Try graceful termination first
                ffmpeg.kill('SIGTERM');

                // Force kill after timeout
                setTimeout(() => {
                    if (!ffmpeg.killed) {
                        ffmpeg.kill('SIGKILL');
                    }
                }, 2000);
            } catch (error) {
                console.error(`[AudioManager] Error killing FFmpeg process for guild ${guildId}:`, error);
            }
        }
        this.ffmpegProcesses.delete(guildId);
    }

    // =============================================================================
    // AUDIO PLAYBACK METHODS
    // =============================================================================

    /**
     * Play radio stream with enhanced error handling
     * @param {string} guildId - Discord guild ID
     * @param {string} streamUrl - Radio stream URL
     * @param {Object} stationInfo - Station information
     * @returns {Promise<boolean>} Success status
     */
    async playRadio(guildId, streamUrl, stationInfo = {}) {
        try {
            const player = this.players.get(guildId);
            if (!player) {
                throw new Error(`No player found for guild ${guildId}`);
            }

            // Stop current playback
            this.stopCurrentPlayback(guildId);

            // Create FFmpeg stream
            const ffmpeg = this.createFFmpegStream(streamUrl);
            this.ffmpegProcesses.set(guildId, ffmpeg);

            // Create audio resource
            const resource = createAudioResource(ffmpeg.stdout, {
                inlineVolume: true,
                inputType: StreamType.Raw
            });
            resource.volume?.setVolume(this.getVolume(guildId));

            // Start playback
            player.play(resource);
            this.currentStreams.set(guildId, {
                type: STREAM_TYPES.RADIO,
                url: streamUrl,
                stationInfo,
                startTime: Date.now()
            });

            console.log(`[AudioManager] Radio playback started in guild ${guildId}`);
            return true;
        } catch (error) {
            console.error(`[AudioManager] Error playing radio in guild ${guildId}:`, error);
            this.cleanupFFmpeg(guildId);
            throw error;
        }
    }

    /**
     * Play Quran audio with enhanced metadata
     * @param {string} guildId - Discord guild ID
     * @param {string} audioUrl - Quran audio URL
     * @param {string} surahName - Name of the surah
     * @param {string} reciterName - Name of the reciter
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<boolean>} Success status
     */
    async playQuran(guildId, audioUrl, surahName, reciterName, metadata = {}) {
        try {
            const player = this.players.get(guildId);
            if (!player) {
                throw new Error(`No player found for guild ${guildId}`);
            }

            // Stop current playback
            this.stopCurrentPlayback(guildId);

            // Create FFmpeg stream
            const ffmpeg = this.createFFmpegStream(audioUrl);
            this.ffmpegProcesses.set(guildId, ffmpeg);

            // Create audio resource
            const resource = createAudioResource(ffmpeg.stdout, {
                inlineVolume: true,
                inputType: StreamType.Raw
            });
            resource.volume?.setVolume(this.getVolume(guildId));

            // Start playback
            player.play(resource);
            this.currentStreams.set(guildId, {
                type: STREAM_TYPES.QURAN,
                url: audioUrl,
                surahName,
                reciterName,
                metadata,
                startTime: Date.now()
            });

            console.log(`[AudioManager] Quran playback started: ${surahName} by ${reciterName} in guild ${guildId}`);
            return true;
        } catch (error) {
            console.error(`[AudioManager] Error playing Quran in guild ${guildId}:`, error);
            this.cleanupFFmpeg(guildId);
            throw error;
        }
    }

    /**
     * Restart radio playback (internal method)
     * @param {string} guildId - Discord guild ID
     */
    async restartRadio(guildId) {
        const currentStream = this.currentStreams.get(guildId);
        if (currentStream?.type === STREAM_TYPES.RADIO) {
            try {
                await this.playRadio(guildId, currentStream.url, currentStream.stationInfo);
            } catch (error) {
                console.error(`[AudioManager] Failed to restart radio in guild ${guildId}:`, error);
            }
        }
    }

    // =============================================================================
    // PLAYBACK CONTROL METHODS
    // =============================================================================

    /**
     * Pause audio playback
     * @param {string} guildId - Discord guild ID
     * @returns {boolean} Success status
     */
    pauseAudio(guildId) {
        try {
            const player = this.players.get(guildId);
            if (!this.isPlayerReady(player)) {
                return false;
            }

            if (player.state.status === AudioPlayerStatus.Playing) {
                player.pause();
                console.log(`[AudioManager] Audio paused in guild ${guildId}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`[AudioManager] Error pausing audio in guild ${guildId}:`, error);
            return false;
        }
    }

    /**
     * Resume audio playback
     * @param {string} guildId - Discord guild ID
     * @returns {boolean} Success status
     */
    resumeAudio(guildId) {
        try {
            const player = this.players.get(guildId);
            if (!this.isPlayerReady(player)) {
                return false;
            }

            if (player.state.status === AudioPlayerStatus.Paused) {
                player.unpause();
                console.log(`[AudioManager] Audio resumed in guild ${guildId}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`[AudioManager] Error resuming audio in guild ${guildId}:`, error);
            return false;
        }
    }

    /**
     * Stop audio playback
     * @param {string} guildId - Discord guild ID
     * @returns {boolean} Success status
     */
    stopAudio(guildId) {
        try {
            const player = this.players.get(guildId);
            if (!player) {
                return false;
            }

            const wasPlaying = player.state.status === AudioPlayerStatus.Playing ||
                player.state.status === AudioPlayerStatus.Paused;

            if (wasPlaying) {
                this.stopCurrentPlayback(guildId);
                console.log(`[AudioManager] Audio stopped in guild ${guildId}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`[AudioManager] Error stopping audio in guild ${guildId}:`, error);
            return false;
        }
    }

    /**
     * Stop current playback and cleanup (internal method)
     * @param {string} guildId - Discord guild ID
     */
    stopCurrentPlayback(guildId) {
        const player = this.players.get(guildId);
        if (player) {
            player.stop();
        }
        this.currentStreams.delete(guildId);
        this.cleanupFFmpeg(guildId);
    }

    // =============================================================================
    // VOLUME MANAGEMENT
    // =============================================================================

    /**
     * Get current volume for a guild
     * @param {string} guildId - Discord guild ID
     * @returns {number} Volume level (0-2.0)
     */
    getVolume(guildId) {
        return this.volumes.get(guildId) ?? AUDIO_CONFIG.DEFAULT_VOLUME;
    }

    /**
     * Set volume for a guild
     * @param {string} guildId - Discord guild ID
     * @param {number} volume - Volume level (0-2.0)
     * @returns {boolean} Success status
     */
    setVolume(guildId, volume) {
        try {
            // Clamp volume to valid range
            const clampedVolume = Math.max(
                AUDIO_CONFIG.MIN_VOLUME,
                Math.min(AUDIO_CONFIG.MAX_VOLUME, volume)
            );

            this.volumes.set(guildId, clampedVolume);

            const player = this.players.get(guildId);
            if (this.isPlayerReady(player)) {
                const resource = player.state.resource;
                if (resource?.volume) {
                    resource.volume.setVolume(clampedVolume);
                    console.log(`[AudioManager] Volume set to ${Math.round(clampedVolume * 100)}% in guild ${guildId}`);
                }
            }

            return true;
        } catch (error) {
            console.error(`[AudioManager] Error setting volume in guild ${guildId}:`, error);
            return false;
        }
    }

    /**
     * Increase volume by one step
     * @param {string} guildId - Discord guild ID
     * @returns {boolean} Success status
     */
    increaseVolume(guildId) {
        const currentVolume = this.getVolume(guildId);
        return this.setVolume(guildId, currentVolume + AUDIO_CONFIG.VOLUME_STEP);
    }

    /**
     * Decrease volume by one step
     * @param {string} guildId - Discord guild ID
     * @returns {boolean} Success status
     */
    decreaseVolume(guildId) {
        const currentVolume = this.getVolume(guildId);
        return this.setVolume(guildId, currentVolume - AUDIO_CONFIG.VOLUME_STEP);
    }

    // =============================================================================
    // STATUS AND INFORMATION METHODS
    // =============================================================================

    /**
     * Check if player is ready for operations
     * @param {AudioPlayer} player - Audio player
     * @returns {boolean} Ready status
     */
    isPlayerReady(player) {
        return player &&
            player.state.status !== AudioPlayerStatus.Idle &&
            player.state.resource;
    }

    /**
     * Check if guild has active connection
     * @param {string} guildId - Discord guild ID
     * @returns {boolean} Connection status
     */
    hasConnection(guildId) {
        return this.connections.has(guildId);
    }

    /**
     * Get audio player for guild
     * @param {string} guildId - Discord guild ID
     * @returns {AudioPlayer|undefined} Audio player
     */
    getPlayer(guildId) {
        return this.players.get(guildId);
    }

    /**
     * Get current stream information
     * @param {string} guildId - Discord guild ID
     * @returns {Object|undefined} Stream information
     */
    getCurrentStream(guildId) {
        return this.currentStreams.get(guildId);
    }

    /**
     * Get player status
     * @param {string} guildId - Discord guild ID
     * @returns {string|null} Player status
     */
    getPlayerStatus(guildId) {
        const player = this.players.get(guildId);
        return player?.state.status || null;
    }

    /**
     * Get comprehensive connection status
     * @param {string} guildId - Discord guild ID
     * @returns {Object} Detailed status information
     */
    getConnectionStatus(guildId) {
        const connection = this.connections.get(guildId);
        const player = this.players.get(guildId);
        const currentStream = this.currentStreams.get(guildId);

        return {
            hasConnection: !!connection,
            hasPlayer: !!player,
            currentStream,
            volume: this.getVolume(guildId),
            playerStatus: player?.state.status || null,
            connectionStatus: connection?.state.status || null,
            uptime: currentStream ? Date.now() - currentStream.startTime : 0
        };
    }

    // =============================================================================
    // 24/7 MODE INTEGRATION
    // =============================================================================

    /**
     * Handle voice state updates for 24/7 functionality
     * @param {VoiceState} oldState - Old voice state
     * @param {VoiceState} newState - New voice state
     */
    async handleVoiceStateUpdate(oldState, newState) {
        try {
            // Handle bot being kicked from voice channel
            if (oldState.member.user.bot && oldState.channelId && !newState.channelId) {
                await this.handleBotKicked(oldState);
                return;
            }

            // Handle normal voice state updates (non-bot users)
            if (!newState.channelId && !oldState.channelId) return;
            if (newState.member.user.bot) return;

            await this.handleUserVoiceUpdate(oldState, newState);
        } catch (error) {
            console.error('[AudioManager] Error handling voice state update:', error);
        }
    }

    /**
     * Handle bot being kicked from voice channel
     * @param {VoiceState} oldState - Old voice state
     */
    async handleBotKicked(oldState) {
        const DatabaseService = require('../services/DatabaseService');
        const guildSettings = await DatabaseService.getGuildSettings(oldState.guild.id);

        if (!guildSettings || !guildSettings.voice24_7) return;

        const channel = oldState.guild.channels.cache.get(guildSettings.voiceChannelId);
        if (!channel) return;

        const humanMembers = channel.members.filter(member => !member.user.bot);

        if (guildSettings.voice24_7 || humanMembers.size > 0) {
            console.log(`[AudioManager] Bot was disconnected from voice channel. Rejoining due to 24/7 mode or active members.`);

            // Don't schedule rejoin if already connected
            if (this.connections.has(oldState.guild.id)) {
                return;
            }

            // Wait a bit before rejoining to avoid rate limits
            setTimeout(async () => {
                try {
                    // Check again inside timeout to avoid race conditions
                    const currentConnection = getVoiceConnection(oldState.guild.id);
                    if (currentConnection && currentConnection.state.status !== VoiceConnectionStatus.Destroyed) {
                        return;
                    }

                    await this.joinVoiceChannel(oldState.guild.id, guildSettings.voiceChannelId, oldState.guild);
                    // Restore previous stream if any
                    await this.restoreStream(oldState.guild.id);
                } catch (error) {
                    console.error('[AudioManager] Error rejoining voice channel:', error);
                }
            }, 3000);
        }
    }

    /**
     * Handle user voice state updates
     * @param {VoiceState} oldState - Old voice state
     * @param {VoiceState} newState - New voice state
     */
    async handleUserVoiceUpdate(oldState, newState) {
        const DatabaseService = require('../services/DatabaseService');
        const guildSettings = await DatabaseService.getGuildSettings(newState.guild.id);

        if (!guildSettings) return;

        const channel = newState.guild.channels.cache.get(guildSettings.voiceChannelId);
        if (!channel) return;

        const connection = getVoiceConnection(newState.guild.id);
        const humanMembers = channel.members.filter(member => !member.user.bot);

        if (humanMembers.size > 0 && !connection) {
            // Always join when someone enters, regardless of 24/7 mode
            await this.joinVoiceChannel(newState.guild.id, guildSettings.voiceChannelId, newState.guild);
            await this.restoreStream(newState.guild.id);
        }

        if (!guildSettings.voice24_7) {
            if (humanMembers.size === 0 && connection) {
                await this.leaveVoiceChannel(newState.guild.id);
            }
        }
    }

    /**
     * Restore previous stream (for 24/7 mode)
     * @param {string} guildId - Discord guild ID
     */
    async restoreStream(guildId) {
        // For now, just start the default radio stream
        // This could be enhanced to remember the last played stream
        const { RADIO_STATIONS } = require('../utils/Constants');
        try {
            await this.playRadio(guildId, RADIO_STATIONS.egypt.url, RADIO_STATIONS.egypt);
        } catch (error) {
            console.error(`[AudioManager] Error restoring stream for guild ${guildId}:`, error);
        }
    }

    // =============================================================================
    // CLEANUP AND SHUTDOWN
    // =============================================================================

    /**
     * Cleanup all resources (call on bot shutdown)
     */
    async shutdown() {
        console.log('[AudioManager] Shutting down...');

        const cleanupPromises = [];
        for (const guildId of this.connections.keys()) {
            cleanupPromises.push(this.cleanupGuildResources(guildId));
        }

        await Promise.allSettled(cleanupPromises);

        this.connections.clear();
        this.players.clear();
        this.currentStreams.clear();
        this.ffmpegProcesses.clear();
        this.volumes.clear();
        this.guildSettings.clear();
        this.connectionListeners.clear();
        this.playerListeners.clear();

        console.log('[AudioManager] Shutdown complete');
    }
}

// Create and export singleton instance
const audioManager = new AudioManager();

// Handle process shutdown
process.on('SIGTERM', () => audioManager.shutdown());
process.on('SIGINT', () => audioManager.shutdown());

module.exports = audioManager;
