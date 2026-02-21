const { MessageFlags } = require('discord.js');
const EmbedBuilder = require('../utils/EmbedBuilder');
const ComponentBuilder = require('../utils/ComponentBuilder');
const DatabaseService = require('../services/DatabaseService');
const audioManager = require('../core/AudioManager');
const { EMOJIS, COLORS, MESSAGES, RADIO_STATIONS } = require('../utils/Constants');

/**
 * Handler for all button interactions
 */
class ButtonHandler {
    /**
     * Handle button interaction
     * @param {ButtonInteraction} interaction - Discord button interaction
     */
    static async handle(interaction) {
        const { customId } = interaction;

        try {
            // Route to appropriate handler based on button ID
            if (customId === 'quran_radio') {
                await this.handleQuranRadio(interaction);
            } else if (customId === 'quran_surah') {
                await this.handleQuranSurah(interaction);
            } else if (customId === 'help') {
                await this.handleHelp(interaction);
            } else if (customId === 'back_to_main') {
                await this.handleBackToMain(interaction);
            } else if (customId.startsWith('radio_')) {
                await this.handleRadioStation(interaction, customId);
            } else if (customId === 'stop_radio') {
                await this.handleStopRadio(interaction);
            } else if (customId.startsWith('volume_')) {
                await this.handleVolumeControl(interaction, customId);
            } else if (customId.includes('_audio_')) {
                await this.handleAudioControl(interaction, customId);
            } else if (customId === 'info_audio' || customId === 'info_radio') {
                await this.handleInfoRequest(interaction, customId);
            } else {
                await this.handleUnknownButton(interaction, customId);
            }
        } catch (error) {
            console.error(`[ButtonHandler] Error handling button ${customId}:`, error);
            await this.handleError(interaction, error);
        }
    }

    // =============================================================================
    // MAIN MENU HANDLERS
    // =============================================================================

    /**
     * Handle Quran radio button
     * @param {ButtonInteraction} interaction
     */
    static async handleQuranRadio(interaction) {
        const embed = EmbedBuilder.createEmbed({
            title: `${EMOJIS.RADIO} إذاعة القرآن الكريم`,
            description: 'اختر الإذاعة المفضلة:',
            color: COLORS.SUCCESS,
            fields: [
                { name: '🇪🇬 مصر', value: 'إذاعة القرآن الكريم - مصر', inline: true }
            ]
        });

        const components = [
            ComponentBuilder.createRadioStationButtons(),
            ComponentBuilder.createBackButton()
        ];

        await interaction.update({ embeds: [embed], components });
    }

    /**
     * Handle Quran surah button
     * @param {ButtonInteraction} interaction
     */
    static async handleQuranSurah(interaction) {
        try {
            const [surahs, reciters] = await Promise.all([
                DatabaseService.getAllSurahs(),
                DatabaseService.getAllReciters()
            ]);

            const embed = EmbedBuilder.createSurahSelectionEmbed(surahs.length, reciters.length);
            const components = [
                ...ComponentBuilder.createSurahSelectMenus(surahs),
                ComponentBuilder.createBackButton()
            ];

            await interaction.update({ embeds: [embed], components });
        } catch (error) {
            console.error('[ButtonHandler] Error loading surahs:', error);
            const embed = EmbedBuilder.createErrorEmbed('خطأ', 'حدث خطأ في تحميل السور');
            await interaction.update({ embeds: [embed], components: [ComponentBuilder.createBackButton()] });
        }
    }

    /**
     * Handle help button
     * @param {ButtonInteraction} interaction
     */
    static async handleHelp(interaction) {
        const embed = EmbedBuilder.createHelpEmbed();
        const components = [ComponentBuilder.createBackButton()];
        await interaction.update({ embeds: [embed], components });
    }

    /**
     * Handle back to main menu button
     * @param {ButtonInteraction} interaction
     */
    static async handleBackToMain(interaction) {
        const embed = EmbedBuilder.createMainMenuEmbed();
        const components = [ComponentBuilder.createMainMenuButtons()];
        await interaction.update({ embeds: [embed], components });
    }

    // =============================================================================
    // RADIO HANDLERS
    // =============================================================================

    /**
     * Handle radio station selection
     * @param {ButtonInteraction} interaction
     * @param {string} customId - Button custom ID
     */
    static async handleRadioStation(interaction, customId) {
        const stationId = customId.replace('radio_', '');
        const station = RADIO_STATIONS[stationId];

        if (!station) {
            await this.handleError(interaction, new Error('محطة إذاعية غير معروفة'));
            return;
        }

        const member = interaction.member;
        if (!member.voice.channel) {
            const embed = EmbedBuilder.createWarningEmbed(
                'تحذير',
                MESSAGES.ERRORS.NO_VOICE_CHANNEL
            );
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            // Show loading state
            const loadingEmbed = EmbedBuilder.createEmbed({
                title: `${EMOJIS.LOADING} جاري الاتصال...`,
                description: `جاري الاتصال بـ ${station.name}`,
                color: COLORS.INFO
            });
            await interaction.update({ embeds: [loadingEmbed], components: [] });

            // Join voice channel if not already connected
            const guildId = interaction.guild.id;
            if (!audioManager.hasConnection(guildId)) {
                await audioManager.joinVoiceChannel(guildId, member.voice.channel.id, interaction.guild);
            }

            // Start radio playback
            await audioManager.playRadio(guildId, station.url, station);

            // Update with success message and controls
            const embed = EmbedBuilder.createRadioPlaybackEmbed(station, 'تشغيل');
            const components = ComponentBuilder.createRadioControlButtons(stationId, true);

            await interaction.editReply({ embeds: [embed], components });

            // Send success message
            await interaction.followUp({
                content: `${EMOJIS.SUCCESS} تم تشغيل ${station.name} بنجاح!`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('[ButtonHandler] Error playing radio:', error);
            const embed = EmbedBuilder.createErrorEmbed(
                'خطأ في التشغيل',
                'حدث خطأ في تشغيل الإذاعة'
            );
            await interaction.editReply({ embeds: [embed], components: [ComponentBuilder.createBackButton()] });
        }
    }

    /**
     * Handle stop radio button
     * @param {ButtonInteraction} interaction
     */
    static async handleStopRadio(interaction) {
        try {
            const guildId = interaction.guild.id;
            const success = audioManager.stopAudio(guildId);

            if (success) {
                const embed = EmbedBuilder.createEmbed({
                    title: `${EMOJIS.STOP} تم إيقاف الإذاعة`,
                    description: 'تم إيقاف إذاعة القرآن الكريم بنجاح!',
                    color: COLORS.DANGER
                });
                await interaction.update({ embeds: [embed], components: [ComponentBuilder.createBackButton()] });
            } else {
                const embed = EmbedBuilder.createWarningEmbed(
                    'تحذير',
                    'لا يوجد صوت قيد التشغيل حالياً'
                );
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            console.error('[ButtonHandler] Error stopping radio:', error);
            await this.handleError(interaction, error);
        }
    }

    // =============================================================================
    // VOLUME CONTROL HANDLERS
    // =============================================================================

    /**
     * Handle volume control buttons
     * @param {ButtonInteraction} interaction
     * @param {string} customId - Button custom ID
     */
    static async handleVolumeControl(interaction, customId) {
        const guildId = interaction.guild.id;
        const currentStream = audioManager.getCurrentStream(guildId);
        const playerStatus = audioManager.getPlayerStatus(guildId);

        // Check if there's any audio playing
        if (!playerStatus || !currentStream) {
            const embed = EmbedBuilder.createWarningEmbed(
                'تحذير',
                MESSAGES.ERRORS.NO_AUDIO_PLAYING
            );
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            const isVolumeUp = customId === 'volume_up';
            const currentVolume = audioManager.getVolume(guildId);

            let success = false;
            let newVolume = currentVolume;
            let action = '';

            if (isVolumeUp) {
                success = audioManager.increaseVolume(guildId);
                newVolume = audioManager.getVolume(guildId);
                action = 'رفع الصوت';
            } else {
                success = audioManager.decreaseVolume(guildId);
                newVolume = audioManager.getVolume(guildId);
                action = 'خفض الصوت';
            }

            if (success && newVolume !== currentVolume) {
                const embed = EmbedBuilder.createVolumeControlEmbed(newVolume, action, currentStream);

                // Create appropriate components based on stream type
                let components;
                if (currentStream.type === 'radio') {
                    components = ComponentBuilder.createRadioControlButtons('egypt', true);
                } else {
                    // For Quran, we need to extract reciter and surah info
                    const reciterId = this.extractReciterIdFromMessage(interaction);
                    const surahNumber = this.extractSurahNumberFromMessage(interaction);
                    if (reciterId && surahNumber) {
                        components = ComponentBuilder.createAudioControlButtons(reciterId, surahNumber, playerStatus);
                    } else {
                        components = [ComponentBuilder.createVolumeControlButtons(), ComponentBuilder.createBackButton()];
                    }
                }

                await interaction.update({ embeds: [embed], components });
            } else {
                const message = newVolume === currentVolume ?
                    (isVolumeUp ? 'الصوت في أعلى مستوى' : 'الصوت في أدنى مستوى') :
                    'فشل في تغيير مستوى الصوت';

                const embed = EmbedBuilder.createWarningEmbed('تحذير', message);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            console.error('[ButtonHandler] Error handling volume control:', error);
            await this.handleError(interaction, error);
        }
    }

    // =============================================================================
    // AUDIO CONTROL HANDLERS
    // =============================================================================

    /**
     * Handle audio control buttons (pause, resume, stop)
     * @param {ButtonInteraction} interaction
     * @param {string} customId - Button custom ID
     */
    static async handleAudioControl(interaction, customId) {
        try {
            const { action, reciterId, surahNumber, guildId } = this.parseAudioControlId(customId, interaction);

            // Get audio information
            const [reciter, surah] = await Promise.all([
                DatabaseService.getReciterById(reciterId),
                DatabaseService.getSurahByNumber(surahNumber)
            ]);

            if (!reciter || !surah) {
                const embed = EmbedBuilder.createErrorEmbed('خطأ', 'لم يتم العثور على المعلومات المطلوبة');
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            const result = await this.executeAudioAction(action, guildId, surah, reciter);

            if (result.success) {
                const embed = EmbedBuilder.createAudioPlaybackEmbed(surah, reciter, result.status);
                const components = ComponentBuilder.createAudioControlButtons(reciterId, surahNumber, result.playerStatus);
                await interaction.update({ embeds: [embed], components });
            } else {
                const embed = EmbedBuilder.createWarningEmbed('تحذير', result.message);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            console.error('[ButtonHandler] Error controlling audio:', error);
            await this.handleError(interaction, error);
        }
    }

    /**
     * Execute audio action (pause, resume, stop)
     * @param {string} action - Action to execute
     * @param {string} guildId - Guild ID
     * @param {Object} surah - Surah information
     * @param {Object} reciter - Reciter information
     * @returns {Object} Action result
     */
    static async executeAudioAction(action, guildId, surah, reciter) {
        const playerStatus = audioManager.getPlayerStatus(guildId);
        const currentStream = audioManager.getCurrentStream(guildId);

        // Validate stream
        if (!playerStatus || !currentStream || currentStream.type !== 'quran' ||
            currentStream.surahName !== surah.name || currentStream.reciterName !== reciter.name) {
            return {
                success: false,
                message: 'لا يوجد صوت قيد التشغيل لهذه السورة أو القارئ'
            };
        }

        switch (action) {
            case 'pause':
                if (playerStatus !== 'playing') {
                    return { success: false, message: 'الصوت ليس قيد التشغيل ليتم إيقافه مؤقتاً' };
                }
                const pauseSuccess = audioManager.pauseAudio(guildId);
                return {
                    success: pauseSuccess,
                    message: pauseSuccess ? 'تم إيقاف الصوت مؤقتاً' : 'فشل في إيقاف الصوت مؤقتاً',
                    status: 'إيقاف مؤقت',
                    playerStatus: 'paused'
                };

            case 'resume':
                if (playerStatus !== 'paused') {
                    return { success: false, message: 'الصوت ليس متوقف مؤقتاً ليتم استئنافه' };
                }
                const resumeSuccess = audioManager.resumeAudio(guildId);
                return {
                    success: resumeSuccess,
                    message: resumeSuccess ? 'تم استئناف تشغيل الصوت' : 'فشل في استئناف الصوت',
                    status: 'تشغيل',
                    playerStatus: 'playing'
                };

            case 'stop':
                if (playerStatus !== 'playing' && playerStatus !== 'paused') {
                    return { success: false, message: 'الصوت ليس قيد التشغيل أو متوقف مؤقتاً ليتم إيقافه' };
                }
                const stopSuccess = audioManager.stopAudio(guildId);
                return {
                    success: stopSuccess,
                    message: stopSuccess ? 'تم إيقاف الصوت' : 'فشل في إيقاف الصوت',
                    status: 'إيقاف',
                    playerStatus: 'idle'
                };

            default:
                return { success: false, message: 'إجراء غير معروف' };
        }
    }

    // =============================================================================
    // INFO HANDLERS
    // =============================================================================

    /**
     * Handle info request buttons
     * @param {ButtonInteraction} interaction
     * @param {string} customId - Button custom ID
     */
    static async handleInfoRequest(interaction, customId) {
        const guildId = interaction.guild.id;
        const status = audioManager.getConnectionStatus(guildId);

        if (!status.currentStream) {
            const embed = EmbedBuilder.createWarningEmbed(
                'معلومات البث',
                'لا يوجد بث حالياً'
            );
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        const stream = status.currentStream;
        const uptimeSeconds = Math.floor(status.uptime / 1000);
        const uptimeFormatted = this.formatUptime(status.uptime);

        let embed;
        if (stream.type === 'radio') {
            embed = EmbedBuilder.createEmbed({
                title: `${EMOJIS.INFO} معلومات الإذاعة`,
                description: `**${stream.stationInfo?.name || 'إذاعة القرآن الكريم'}**`,
                color: COLORS.INFO,
                fields: [
                    { name: '📡 نوع البث', value: 'إذاعة مباشرة', inline: true },
                    { name: '🌍 البلد', value: stream.stationInfo?.country || 'غير محدد', inline: true },
                    { name: '🔊 مستوى الصوت', value: `${Math.round(status.volume * 100)}%`, inline: true },
                    { name: '⏱️ مدة التشغيل', value: uptimeFormatted, inline: true },
                    { name: '📊 الحالة', value: status.playerStatus === 'playing' ? '🟢 يعمل' : '🔴 متوقف', inline: true }
                ]
            });
        } else {
            embed = EmbedBuilder.createEmbed({
                title: `${EMOJIS.INFO} معلومات القرآن الكريم`,
                description: `**${stream.surahName}** بصوت **${stream.reciterName}**`,
                color: COLORS.INFO,
                fields: [
                    { name: '📖 السورة', value: stream.surahName, inline: true },
                    { name: '🎤 القارئ', value: stream.reciterName, inline: true },
                    { name: '🔊 مستوى الصوت', value: `${Math.round(status.volume * 100)}%`, inline: true },
                    { name: '⏱️ مدة التشغيل', value: uptimeFormatted, inline: true },
                    { name: '📊 الحالة', value: status.playerStatus === 'playing' ? '🟢 يعمل' : status.playerStatus === 'paused' ? '⏸️ متوقف مؤقتاً' : '🔴 متوقف', inline: true }
                ]
            });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // =============================================================================
    // UTILITY METHODS
    // =============================================================================

    /**
     * Handle unknown button
     * @param {ButtonInteraction} interaction
     * @param {string} customId - Button custom ID
     */
    static async handleUnknownButton(interaction, customId) {
        console.warn(`[ButtonHandler] Unknown button: ${customId}`);
        const embed = EmbedBuilder.createWarningEmbed(
            'ميزة غير متوفرة',
            'هذه الميزة غير متوفرة حالياً'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle errors
     * @param {ButtonInteraction} interaction
     * @param {Error} error - Error object
     */
    static async handleError(interaction, error) {
        const embed = EmbedBuilder.createErrorEmbed(
            'خطأ',
            error.message || MESSAGES.ERRORS.GENERIC
        );

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        } catch (replyError) {
            console.error('[ButtonHandler] Error sending error message:', replyError);
        }
    }

    /**
     * Parse audio control ID
     * @param {string} customId - Custom ID
     * @param {ButtonInteraction} interaction - Interaction
     * @returns {Object} Parsed information
     */
    static parseAudioControlId(customId, interaction) {
        const parts = customId.split('_');
        return {
            action: parts[0], // pause, resume, stop
            reciterId: parts[2],
            surahNumber: parts[3],
            guildId: interaction.guild.id
        };
    }

    /**
     * Extract reciter ID from message components
     * @param {ButtonInteraction} interaction
     * @returns {string|null} Reciter ID
     */
    static extractReciterIdFromMessage(interaction) {
        try {
            const components = interaction.message.components;
            for (const row of components) {
                for (const component of row.components) {
                    if (component.customId && component.customId.includes('_audio_')) {
                        const parts = component.customId.split('_');
                        if (parts.length >= 3) {
                            return parts[2];
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('[ButtonHandler] Could not extract reciter ID:', error);
        }
        return null;
    }

    /**
     * Extract surah number from message components
     * @param {ButtonInteraction} interaction
     * @returns {string|null} Surah number
     */
    static extractSurahNumberFromMessage(interaction) {
        try {
            const components = interaction.message.components;
            for (const row of components) {
                for (const component of row.components) {
                    if (component.customId && component.customId.includes('_audio_')) {
                        const parts = component.customId.split('_');
                        if (parts.length >= 4) {
                            return parts[3];
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('[ButtonHandler] Could not extract surah number:', error);
        }
        return null;
    }

    /**
     * Format uptime for display
     * @param {number} milliseconds - Uptime in milliseconds
     * @returns {string} Formatted uptime
     */
    static formatUptime(milliseconds) {
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
}

module.exports = ButtonHandler;
