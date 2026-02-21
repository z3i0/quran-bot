const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const { EMOJIS, PAGINATION } = require('./Constants');

/**
 * Utility class for creating consistent Discord components
 */
class ComponentBuilder {
    /**
     * Create a button with consistent styling
     * @param {string} customId - Button custom ID
     * @param {string} label - Button label
     * @param {ButtonStyle} style - Button style
     * @param {string} emoji - Button emoji (optional)
     * @param {boolean} disabled - Whether button is disabled
     * @returns {ButtonBuilder} Discord button
     */
    static createButton(customId, label, style, emoji = null, disabled = false) {
        const button = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(style)
            .setDisabled(disabled);

        if (emoji) {
            button.setEmoji(emoji);
        }

        return button;
    }

    /**
     * Create main menu buttons
     * @returns {ActionRowBuilder} Main menu action row
     */
    static createMainMenuButtons() {
        return new ActionRowBuilder().addComponents(
            this.createButton('quran_surah', 'القرآن الكريم', ButtonStyle.Primary, EMOJIS.QURAN),
            this.createButton('quran_radio', 'الإذاعة المباشرة', ButtonStyle.Success, EMOJIS.RADIO),
            this.createButton('help', 'المساعدة', ButtonStyle.Secondary, EMOJIS.HELP)
        );
    }

    /**
     * Create back to main menu button
     * @returns {ActionRowBuilder} Back button action row
     */
    static createBackButton() {
        return new ActionRowBuilder().addComponents(
            this.createButton('back_to_main', 'العودة للقائمة الرئيسية', ButtonStyle.Secondary, EMOJIS.BACK)
        );
    }

    /**
     * Create audio control buttons
     * @param {string} reciterId - Reciter ID
     * @param {string} surahNumber - Surah number
     * @param {string} currentStatus - Current player status
     * @returns {Array<ActionRowBuilder>} Audio control action rows
     */
    static createAudioControlButtons(reciterId, surahNumber, currentStatus = 'playing') {
        const controlRow = new ActionRowBuilder().addComponents(
            this.createButton(
                `pause_audio_${reciterId}_${surahNumber}`,
                'إيقاف مؤقت',
                ButtonStyle.Secondary,
                EMOJIS.PAUSE,
                currentStatus !== 'playing'
            ),
            this.createButton(
                `resume_audio_${reciterId}_${surahNumber}`,
                'استئناف',
                ButtonStyle.Success,
                EMOJIS.PLAY,
                currentStatus !== 'paused'
            ),
            this.createButton(
                `stop_audio_${reciterId}_${surahNumber}`,
                'إيقاف',
                ButtonStyle.Danger,
                EMOJIS.STOP,
                currentStatus === 'idle'
            )
        );

        const volumeRow = new ActionRowBuilder().addComponents(
            this.createButton('volume_up', 'رفع الصوت', ButtonStyle.Primary, EMOJIS.VOLUME_UP),
            this.createButton('volume_down', 'خفض الصوت', ButtonStyle.Primary, EMOJIS.VOLUME_DOWN),
            this.createButton('info_audio', 'معلومات البث', ButtonStyle.Secondary, EMOJIS.INFO)
        );

        return [controlRow, volumeRow, this.createBackButton()];
    }

    /**
     * Create radio control buttons
     * @param {string} stationId - Radio station ID
     * @param {boolean} isPlaying - Whether radio is currently playing
     * @returns {Array<ActionRowBuilder>} Radio control action rows
     */
    static createRadioControlButtons(stationId, isPlaying = true) {
        const controlRow = new ActionRowBuilder().addComponents(
            this.createButton(
                'stop_radio',
                'إيقاف الإذاعة',
                ButtonStyle.Danger,
                EMOJIS.STOP,
                !isPlaying
            ),
            this.createButton(
                'info_radio',
                'معلومات الإذاعة',
                ButtonStyle.Secondary,
                EMOJIS.INFO
            )
        );

        const volumeRow = new ActionRowBuilder().addComponents(
            this.createButton('volume_up', 'رفع الصوت', ButtonStyle.Primary, EMOJIS.VOLUME_UP),
            this.createButton('volume_down', 'خفض الصوت', ButtonStyle.Primary, EMOJIS.VOLUME_DOWN)
        );

        return [controlRow, volumeRow, this.createBackButton()];
    }

    /**
     * Create radio station selection buttons
     * @returns {ActionRowBuilder} Radio station buttons
     */
    static createRadioStationButtons() {
        return new ActionRowBuilder().addComponents(
            this.createButton('radio_egypt', 'مصر', ButtonStyle.Primary, '🇪🇬'),
            this.createButton('radio_saudi', 'السعودية', ButtonStyle.Primary, '🇸🇦'),
            this.createButton('radio_uae', 'الإمارات', ButtonStyle.Primary, '🇦🇪')
        );
    }

    /**
     * Create surah selection menus
     * @param {Array} surahs - Array of surah objects
     * @returns {Array<ActionRowBuilder>} Surah selection menus
     */
    static createSurahSelectMenus(surahs) {
        const components = [];
        const surahsPerMenu = PAGINATION.SURAHS_PER_MENU;
        const maxSurahs = Math.min(PAGINATION.MAX_SURAHS_DISPLAY, surahs.length);

        for (let i = 0; i < maxSurahs; i += surahsPerMenu) {
            const surahBatch = surahs.slice(i, i + surahsPerMenu);
            const menuIndex = Math.floor(i / surahsPerMenu) + 1;

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`surah_select_${menuIndex}`)
                .setPlaceholder(`اختر السورة (${i + 1}-${Math.min(i + surahsPerMenu, surahs.length)})`)
                .addOptions(
                    surahBatch.map(surah =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${surah.number}. ${surah.name}`)
                            .setValue(surah.number.toString())
                            .setDescription(`${surah.numberOfAyahs} آية - ${surah.revelationType}`)
                    )
                );

            components.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        return components;
    }

    /**
     * Create reciter selection menu
     * @param {Array} reciters - Array of reciter objects
     * @param {string} surahNumber - Selected surah number
     * @returns {ActionRowBuilder} Reciter selection menu
     */
    static createReciterSelectMenu(reciters, surahNumber) {
        const { getCountryName } = require('../services/DatabaseService');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`reciter_select_${surahNumber}`)
            .setPlaceholder('اختر القارئ المفضل')
            .addOptions(
                reciters.slice(0, 25).map(reciter => // Discord limit: 25 options
                    new StringSelectMenuOptionBuilder()
                        .setLabel(reciter.name)
                        .setValue(reciter.id.toString())
                        .setDescription(getCountryName(reciter.country) || 'غير محدد')
                )
            );

        return new ActionRowBuilder().addComponents(selectMenu);
    }

    /**
     * Create volume control buttons (standalone)
     * @param {boolean} canIncrease - Whether volume can be increased
     * @param {boolean} canDecrease - Whether volume can be decreased
     * @returns {ActionRowBuilder} Volume control buttons
     */
    static createVolumeControlButtons(canIncrease = true, canDecrease = true) {
        return new ActionRowBuilder().addComponents(
            this.createButton('volume_up', 'رفع الصوت', ButtonStyle.Primary, EMOJIS.VOLUME_UP, !canIncrease),
            this.createButton('volume_down', 'خفض الصوت', ButtonStyle.Primary, EMOJIS.VOLUME_DOWN, !canDecrease),
            this.createButton('volume_info', 'معلومات الصوت', ButtonStyle.Secondary, EMOJIS.INFO)
        );
    }

    /**
     * Create loading buttons (disabled state)
     * @param {string} loadingText - Loading message
     * @returns {ActionRowBuilder} Loading buttons
     */
    static createLoadingButtons(loadingText = 'جاري التحميل...') {
        return new ActionRowBuilder().addComponents(
            this.createButton('loading', loadingText, ButtonStyle.Secondary, EMOJIS.LOADING, true)
        );
    }

    /**
     * Create error buttons
     * @param {boolean} showRetry - Whether to show retry button
     * @returns {ActionRowBuilder} Error buttons
     */
    static createErrorButtons(showRetry = true) {
        const buttons = [];

        if (showRetry) {
            buttons.push(this.createButton('retry', 'إعادة المحاولة', ButtonStyle.Primary, '🔄'));
        }

        buttons.push(this.createButton('back_to_main', 'العودة للقائمة الرئيسية', ButtonStyle.Secondary, EMOJIS.BACK));

        return new ActionRowBuilder().addComponents(buttons);
    }

    /**
     * Disable all buttons in action rows
     * @param {Array<ActionRowBuilder>} actionRows - Action rows to disable
     * @returns {Array<ActionRowBuilder>} Disabled action rows
     */
    static disableAllButtons(actionRows) {
        return actionRows.map(row => {
            const newRow = new ActionRowBuilder();
            row.components.forEach(component => {
                if (component instanceof ButtonBuilder) {
                    newRow.addComponents(
                        ButtonBuilder.from(component).setDisabled(true)
                    );
                } else {
                    newRow.addComponents(component);
                }
            });
            return newRow;
        });
    }

    /**
     * Create pagination buttons
     * @param {number} currentPage - Current page number
     * @param {number} totalPages - Total number of pages
     * @param {string} baseId - Base custom ID for pagination
     * @returns {ActionRowBuilder} Pagination buttons
     */
    static createPaginationButtons(currentPage, totalPages, baseId) {
        const buttons = [];

        if (currentPage > 1) {
            buttons.push(this.createButton(`${baseId}_prev`, 'السابق', ButtonStyle.Secondary, '⬅️'));
        }

        buttons.push(
            this.createButton(
                `${baseId}_info`,
                `${currentPage}/${totalPages}`,
                ButtonStyle.Secondary,
                null,
                true
            )
        );

        if (currentPage < totalPages) {
            buttons.push(this.createButton(`${baseId}_next`, 'التالي', ButtonStyle.Secondary, '➡️'));
        }

        return new ActionRowBuilder().addComponents(buttons);
    }
}

module.exports = ComponentBuilder;
