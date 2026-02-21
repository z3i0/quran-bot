const {
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus,
    VoiceConnectionStatus, 
    entersState, 
    getVoiceConnection
} = require('@discordjs/voice');
const { spawn } = require('child_process');

/**
 * AudioManager - Handles voice connections and audio playback for Discord bot
 */
class AudioManager {
    constructor() {
        // Core audio components
        this.connections = new Map();      // guildId -> VoiceConnection
        this.players = new Map();          // guildId -> AudioPlayer
        this.currentStreams = new Map();   // guildId -> StreamInfo
        this.volumes = new Map();          // guildId -> volume (0-2.0)
        this.ffmpegProcesses = new Map();  // guildId -> child_process
        
        // Configuration
        this.config = {
            CONNECTION_TIMEOUT: 10000,
            RETRY_DELAY: 5000,
            DEFAULT_VOLUME: 1.0,
            MAX_VOLUME: 2.0,
            MIN_VOLUME: 0.0,
            VOLUME_STEP: 0.1
        };
        
        console.log('[AudioManager] Initialized successfully');
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
        return this.volumes.get(guildId) ?? this.config.DEFAULT_VOLUME;
    }

    /**
     * Get current volume (alias for compatibility)
     * @param {string} guildId - Discord guild ID
     * @returns {number} Volume level (0-2.0)
     */
    getCurrentVolume(guildId) {
        return this.getVolume(guildId);
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
                this.config.MIN_VOLUME, 
                Math.min(this.config.MAX_VOLUME, volume)
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
        return this.setVolume(guildId, currentVolume + this.config.VOLUME_STEP);
    }

    /**
     * Decrease volume by one step
     * @param {string} guildId - Discord guild ID
     * @returns {boolean} Success status
     */
    decreaseVolume(guildId) {
        const currentVolume = this.getVolume(guildId);
        return this.setVolume(guildId, currentVolume - this.config.VOLUME_STEP);
    }

    // =============================================================================
    // FFMPEG STREAM CREATION
    // =============================================================================

    /**
     * Create FFmpeg process for streaming audio
     * @param {string} url - Audio stream URL
     * @returns {ChildProcess} FFmpeg process
     */
    createFFmpegStream(url) {
        const args = [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-i', url,
            '-analyzeduration', '0',
            '-loglevel', 'error',
            '-c:a', 'libopus',
            '-f', 'opus',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1'
        ];

        const ffmpeg = spawn('ffmpeg', args, { 
            stdio: ['ignore', 'pipe', 'pipe'] 
        });

        // Handle FFmpeg errors
        ffmpeg.on('error', (error) => {
            console.error('[AudioManager] FFmpeg process error:', error);
        });

        ffmpeg.stderr.on('data', (data) => {
            const errorMessage = data.toString().trim();
            if (errorMessage && !errorMessage.includes('deprecated')) {
                console.warn(`[AudioManager] FFmpeg warning: ${errorMessage}`);
            }
        });

        return ffmpeg;
    }

    /**
     * Cleanup FFmpeg process for a guild
     * @param {string} guildId - Discord guild ID
     */
    cleanupFFmpeg(guildId) {
        const ffmpeg = this.ffmpegProcesses.get(guildId);
        if (ffmpeg && !ffmpeg.killed) {
            try {
                ffmpeg.kill('SIGTERM');
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
    // VOICE CONNECTION MANAGEMENT
    // =============================================================================

    /**
     * Join a voice channel
     * @param {string} guildId - Discord guild ID
     * @param {string} channelId - Voice channel ID
     * @param {Guild} guild - Discord guild object
     * @returns {Promise<{connection: VoiceConnection, player: AudioPlayer}>}
     */
    async joinVoiceChannel(guildId, channelId, guild) {
        try {
            console.log(`[AudioManager] Joining voice channel ${channelId} in guild ${guildId}`);
            
            // Clean up existing connection
            await this.cleanupGuildResources(guildId);

            const connection = joinVoiceChannel({
                channelId,
                guildId,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true,
            });

            const player = createAudioPlayer();
            connection.subscribe(player);
            
            // Store references
            this.connections.set(guildId, connection);
            this.players.set(guildId, player);

            // Wait for connection to be ready
            await entersState(connection, VoiceConnectionStatus.Ready, this.config.CONNECTION_TIMEOUT);
            
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
     * Leave voice channel and cleanup resources
     * @param {string} guildId - Discord guild ID
     * @returns {boolean} Success status
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
        // Keep volume settings for user preference
    }

    // =============================================================================
    // EVENT LISTENERS
    // =============================================================================

    /**
     * Setup connection event listeners
     * @param {string} guildId - Discord guild ID
     * @param {VoiceConnection} connection - Voice connection
     */
    setupConnectionListeners(guildId, connection) {
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
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
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log(`[AudioManager] Voice connection destroyed in guild ${guildId}`);
            this.cleanupGuildResources(guildId);
        });
    }

    /**
     * Setup player event listeners
     * @param {string} guildId - Discord guild ID
     * @param {AudioPlayer} player - Audio player
     */
    setupPlayerListeners(guildId, player) {
        player.on(AudioPlayerStatus.Idle, () => {
            const currentStream = this.currentStreams.get(guildId);
            
            if (currentStream?.type === 'radio') {
                console.log(`[AudioManager] Radio stream ended, restarting in guild ${guildId}`);
                setTimeout(() => this.restartRadio(guildId), 1000);
            } else if (currentStream?.type === 'quran') {
                console.log(`[AudioManager] Quran playback ended: ${currentStream.surahName} by ${currentStream.reciterName} in guild ${guildId}`);
                this.currentStreams.delete(guildId);
                this.cleanupFFmpeg(guildId);
            }
        });

        player.on(AudioPlayerStatus.Playing, () => {
            const currentStream = this.currentStreams.get(guildId);
            const streamInfo = currentStream ? `${currentStream.type}: ${currentStream.surahName || 'radio'}` : 'unknown';
            console.log(`[AudioManager] Audio started playing in guild ${guildId} - ${streamInfo}`);
        });

        player.on(AudioPlayerStatus.Paused, () => {
            console.log(`[AudioManager] Audio paused in guild ${guildId}`);
        });

        player.on('error', (error) => {
            console.error(`[AudioManager] Player error in guild ${guildId}:`, error);
            const currentStream = this.currentStreams.get(guildId);
            
            if (currentStream?.type === 'radio') {
                console.log(`[AudioManager] Retrying radio after error in guild ${guildId}`);
                setTimeout(() => this.restartRadio(guildId), this.config.RETRY_DELAY);
            } else {
                this.currentStreams.delete(guildId);
                this.cleanupFFmpeg(guildId);
            }
        });
    }

    // =============================================================================
    // AUDIO PLAYBACK
    // =============================================================================

    /**
     * Play radio stream
     * @param {string} guildId - Discord guild ID
     * @param {string} streamUrl - Radio stream URL
     * @returns {Promise<boolean>} Success status
     */
    async playRadio(guildId, streamUrl) {
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
                inlineVolume: true 
            });
            resource.volume?.setVolume(this.getVolume(guildId));

            // Start playback
            player.play(resource);
            this.currentStreams.set(guildId, { 
                type: 'radio', 
                url: streamUrl,
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
     * Restart radio playback (internal method)
     * @param {string} guildId - Discord guild ID
     */
    async restartRadio(guildId) {
        const currentStream = this.currentStreams.get(guildId);
        if (currentStream?.type === 'radio') {
            try {
                await this.playRadio(guildId, currentStream.url);
            } catch (error) {
                console.error(`[AudioManager] Failed to restart radio in guild ${guildId}:`, error);
            }
        }
    }

    /**
     * Play Quran audio
     * @param {string} guildId - Discord guild ID
     * @param {string} audioUrl - Quran audio URL
     * @param {string} surahName - Name of the surah
     * @param {string} reciterName - Name of the reciter
     * @returns {Promise<boolean>} Success status
     */
    async playQuran(guildId, audioUrl, surahName, reciterName) {
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
                inlineVolume: true
            });
            resource.volume?.setVolume(this.getVolume(guildId));

            // Start playback
            player.play(resource);
            this.currentStreams.set(guildId, {
                type: 'quran',
                url: audioUrl,
                surahName,
                reciterName,
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

    // =============================================================================
    // PLAYBACK CONTROL
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
                console.log(`[AudioManager] No active player found in guild ${guildId}`);
                return false;
            }

            if (player.state.status === AudioPlayerStatus.Playing) {
                player.pause();
                console.log(`[AudioManager] Audio paused in guild ${guildId}`);
                return true;
            }

            console.log(`[AudioManager] Cannot pause - player is ${player.state.status} in guild ${guildId}`);
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
                console.log(`[AudioManager] No active player found in guild ${guildId}`);
                return false;
            }

            if (player.state.status === AudioPlayerStatus.Paused) {
                player.unpause();
                console.log(`[AudioManager] Audio resumed in guild ${guildId}`);
                return true;
            }

            console.log(`[AudioManager] Cannot resume - player is ${player.state.status} in guild ${guildId}`);
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
                console.log(`[AudioManager] No player found in guild ${guildId}`);
                return false;
            }

            const wasPlaying = player.state.status === AudioPlayerStatus.Playing || 
                             player.state.status === AudioPlayerStatus.Paused;

            if (wasPlaying) {
                this.stopCurrentPlayback(guildId);
                console.log(`[AudioManager] Audio stopped in guild ${guildId}`);
                return true;
            }

            console.log(`[AudioManager] Cannot stop - player is ${player.state.status} in guild ${guildId}`);
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
    // STATUS AND INFORMATION
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
     * Get connection status information
     * @param {string} guildId - Discord guild ID
     * @returns {Object} Status information
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
            connectionStatus: connection?.state.status || null
        };
    }

    /**
     * Get detailed stream information with Arabic translations
     * @param {string} guildId - Discord guild ID
     * @returns {Object} Detailed stream information
     */
    getDetailedStreamInfo(guildId) {
        const currentStream = this.currentStreams.get(guildId);
        const player = this.players.get(guildId);
        const connection = this.connections.get(guildId);

        if (!currentStream) {
            return {
                isPlaying: false,
                message: 'لا يوجد بث حالياً',
                hasConnection: !!connection
            };
        }

        const playerStatus = player?.state.status;
        const statusMap = {
            [AudioPlayerStatus.Playing]: { text: 'مشغل', emoji: '▶️' },
            [AudioPlayerStatus.Paused]: { text: 'متوقف مؤقتاً', emoji: '⏸️' },
            [AudioPlayerStatus.Idle]: { text: 'متوقف', emoji: '⏹️' },
            [AudioPlayerStatus.Buffering]: { text: 'تحميل', emoji: '⏳' }
        };

        const status = statusMap[playerStatus] || { text: 'غير معروف', emoji: '❓' };
        const uptime = currentStream.startTime ? Date.now() - currentStream.startTime : 0;

        return {
            isPlaying: true,
            type: currentStream.type,
            status: status.text,
            statusEmoji: status.emoji,
            volume: this.getVolume(guildId),
            hasConnection: !!connection,
            connectionStatus: connection?.state.status || 'unknown',
            streamInfo: currentStream,
            uptime: Math.floor(uptime / 1000), // seconds
            uptimeFormatted: this.formatUptime(uptime)
        };
    }

    /**
     * Format uptime for display
     * @param {number} milliseconds - Uptime in milliseconds
     * @returns {string} Formatted uptime
     */
    formatUptime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        } else if (minutes > 0) {
            return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
        } else {
            return `0:${String(seconds).padStart(2, '0')}`;
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
        
        console.log('[AudioManager] Shutdown complete');
    }
}

// Create and export singleton instance
const audioManager = new AudioManager();

// Handle process shutdown
process.on('SIGTERM', () => audioManager.shutdown());
process.on('SIGINT', () => audioManager.shutdown());

module.exports = audioManager;