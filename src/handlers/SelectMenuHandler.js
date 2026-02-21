const { MessageFlags } = require('discord.js');
const EmbedBuilder = require('../utils/EmbedBuilder');
const ComponentBuilder = require('../utils/ComponentBuilder');
const DatabaseService = require('../services/DatabaseService');
const audioManager = require('../core/AudioManager');
const { EMOJIS, COLORS, MESSAGES } = require('../utils/Constants');

/**
 * Handler for all select menu interactions
 */
class SelectMenuHandler {
    /**
     * Handle select menu interaction
     * @param {StringSelectMenuInteraction} interaction - Discord select menu interaction
     */
    static async handle(interaction) {
        const { customId } = interaction;

        try {
            // Route to appropriate handler based on select menu ID
            if (customId.startsWith('surah_select_')) {
                await this.handleSurahSelection(interaction);
            } else if (customId.startsWith('reciter_select_')) {
                await this.handleReciterSelection(interaction);
            } else {
                await this.handleUnknownSelectMenu(interaction, customId);
            }
        } catch (error) {
            console.error(`[SelectMenuHandler] Error handling select menu ${customId}:`, error);
            await this.handleError(interaction, error);
        }
    }

    // =============================================================================
    // SURAH SELECTION HANDLER
    // =============================================================================

    /**
     * Handle surah selection from dropdown menu
     * @param {StringSelectMenuInteraction} interaction
     */
    static async handleSurahSelection(interaction) {
        try {
            const surahNumber = parseInt(interaction.values[0]);

            // Get surah and available reciters
            const [surah, reciters] = await Promise.all([
                DatabaseService.getSurahByNumber(surahNumber),
                DatabaseService.getRecitersForSurah(surahNumber)
            ]);

            if (!surah) {
                const embed = EmbedBuilder.createErrorEmbed('خطأ', 'لم يتم العثور على السورة المطلوبة');
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (reciters.length === 0) {
                const embed = EmbedBuilder.createWarningEmbed(
                    'تحذير',
                    `لا توجد تسجيلات متاحة لسورة ${surah.name} حالياً`
                );
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Create reciter selection embed and menu
            const embed = EmbedBuilder.createReciterSelectionEmbed(surah, reciters.length);
            const components = [
                ComponentBuilder.createReciterSelectMenu(reciters, surahNumber),
                ComponentBuilder.createBackButton()
            ];

            await interaction.update({ embeds: [embed], components });
        } catch (error) {
            console.error('[SelectMenuHandler] Error in surah selection:', error);
            const embed = EmbedBuilder.createErrorEmbed('خطأ', 'حدث خطأ في تحميل معلومات السورة');
            await interaction.update({
                embeds: [embed],
                components: [ComponentBuilder.createBackButton()]
            });
        }
    }

    // =============================================================================
    // RECITER SELECTION HANDLER
    // =============================================================================

    /**
     * Handle reciter selection from dropdown menu
     * @param {StringSelectMenuInteraction} interaction
     */
    static async handleReciterSelection(interaction) {
        try {
            const reciterId = parseInt(interaction.values[0]);
            const surahNumber = this.extractSurahNumberFromCustomId(interaction.customId);

            // Show loading state
            const loadingEmbed = EmbedBuilder.createEmbed({
                title: `${EMOJIS.LOADING} جاري التحميل...`,
                description: 'جاري تحميل معلومات الصوت...',
                color: COLORS.INFO
            });
            await interaction.update({ embeds: [loadingEmbed], components: [] });

            // Get complete audio information
            const audioInfo = await DatabaseService.getCompleteAudioInfo(reciterId, surahNumber);

            // Check if user is in voice channel
            const member = interaction.member;
            if (!member.voice.channel) {
                const embed = EmbedBuilder.createWarningEmbed(
                    'تحذير',
                    MESSAGES.ERRORS.NO_VOICE_CHANNEL
                );
                const components = [ComponentBuilder.createBackButton()];
                await interaction.editReply({ embeds: [embed], components });
                return;
            }

            // Start audio playback
            await this.startAudioPlayback(interaction, audioInfo);

        } catch (error) {
            console.error('[SelectMenuHandler] Error in reciter selection:', error);
            const embed = EmbedBuilder.createErrorEmbed(
                'خطأ في التشغيل',
                error.message || 'حدث خطأ في تشغيل الصوت'
            );
            const components = [ComponentBuilder.createBackButton()];
            await interaction.editReply({ embeds: [embed], components });
        }
    }

    /**
     * Start audio playback for selected reciter and surah
     * @param {StringSelectMenuInteraction} interaction
     * @param {Object} audioInfo - Complete audio information
     */
    static async startAudioPlayback(interaction, audioInfo) {
        const { reciter, surah, audioUrl } = audioInfo;
        const guildId = interaction.guild.id;
        const member = interaction.member;

        try {
            // Join voice channel if not already connected
            if (!audioManager.hasConnection(guildId)) {
                await audioManager.joinVoiceChannel(guildId, member.voice.channel.id, interaction.guild);
            }

            // Start Quran playback
            await audioManager.playQuran(guildId, audioUrl, surah.name, reciter.name, {
                surahNumber: surah.number,
                reciterId: reciter.id,
                numberOfAyahs: surah.numberOfAyahs,
                revelationType: surah.revelationType,
                reciterCountry: reciter.countryName
            });

            // Create success embed and controls
            const embed = EmbedBuilder.createAudioPlaybackEmbed(surah, reciter, 'تشغيل');
            const components = ComponentBuilder.createAudioControlButtons(
                reciter.id,
                surah.number,
                'playing'
            );

            await interaction.editReply({ embeds: [embed], components });

            // Send success notification
            await interaction.followUp({
                content: `${EMOJIS.SUCCESS} تم بدء تشغيل ${surah.name} بصوت ${reciter.name} بنجاح!`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error('[SelectMenuHandler] Error starting audio playback:', error);

            // Create error embed with retry option
            const embed = EmbedBuilder.createErrorEmbed(
                'خطأ في التشغيل',
                'حدث خطأ في تشغيل الصوت. يرجى المحاولة مرة أخرى.'
            );

            const components = [
                ComponentBuilder.createErrorButtons(true),
                ComponentBuilder.createBackButton()
            ];

            await interaction.editReply({ embeds: [embed], components });
            throw error;
        }
    }

    // =============================================================================
    // UTILITY METHODS
    // =============================================================================

    /**
     * Extract surah number from custom ID
     * @param {string} customId - Custom ID (e.g., "reciter_select_1")
     * @returns {number} Surah number
     */
    static extractSurahNumberFromCustomId(customId) {
        const parts = customId.split('_');
        return parseInt(parts[2]);
    }

    /**
     * Handle unknown select menu
     * @param {StringSelectMenuInteraction} interaction
     * @param {string} customId - Custom ID
     */
    static async handleUnknownSelectMenu(interaction, customId) {
        console.warn(`[SelectMenuHandler] Unknown select menu: ${customId}`);
        const embed = EmbedBuilder.createWarningEmbed(
            'ميزة غير متوفرة',
            'هذه الميزة غير متوفرة حالياً'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle errors
     * @param {StringSelectMenuInteraction} interaction
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
            console.error('[SelectMenuHandler] Error sending error message:', replyError);
        }
    }

    // =============================================================================
    // ADVANCED FEATURES (FOR FUTURE ENHANCEMENT)
    // =============================================================================

    /**
     * Handle bookmark selection (future feature)
     * @param {StringSelectMenuInteraction} interaction
     */
    static async handleBookmarkSelection(interaction) {
        // TODO: Implement bookmark functionality
        const embed = EmbedBuilder.createInfoEmbed(
            'قريباً',
            'ميزة الإشارات المرجعية ستكون متاحة قريباً'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle playlist selection (future feature)
     * @param {StringSelectMenuInteraction} interaction
     */
    static async handlePlaylistSelection(interaction) {
        // TODO: Implement playlist functionality
        const embed = EmbedBuilder.createInfoEmbed(
            'قريباً',
            'ميزة قوائم التشغيل ستكون متاحة قريباً'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle search results selection (future feature)
     * @param {StringSelectMenuInteraction} interaction
     */
    static async handleSearchResultsSelection(interaction) {
        // TODO: Implement search functionality
        const embed = EmbedBuilder.createInfoEmbed(
            'قريباً',
            'ميزة البحث ستكون متاحة قريباً'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Validate selection before processing
     * @param {StringSelectMenuInteraction} interaction
     * @param {string} selectionType - Type of selection
     * @returns {boolean} Validation result
     */
    static validateSelection(interaction, selectionType) {
        // Basic validation
        if (!interaction.values || interaction.values.length === 0) {
            console.warn(`[SelectMenuHandler] No values selected for ${selectionType}`);
            return false;
        }

        // Check if user has necessary permissions
        if (!interaction.member.voice.channel && selectionType === 'audio') {
            return false;
        }

        return true;
    }

    /**
     * Log selection for analytics (future feature)
     * @param {StringSelectMenuInteraction} interaction
     * @param {string} selectionType - Type of selection
     * @param {string} selectedValue - Selected value
     */
    static logSelection(interaction, selectionType, selectedValue) {
        // TODO: Implement analytics logging
        console.log(`[SelectMenuHandler] ${selectionType} selection: ${selectedValue} by user ${interaction.user.id} in guild ${interaction.guild.id}`);
    }
}

module.exports = SelectMenuHandler;
