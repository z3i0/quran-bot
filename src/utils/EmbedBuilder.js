const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS, BOT_INFO } = require('./Constants');

/**
 * Utility class for creating consistent embeds throughout the bot
 */
class CustomEmbedBuilder {
    /**
     * Create a basic embed with default styling
     * @param {Object} options - Embed options
     * @returns {EmbedBuilder} Discord embed
     */
    static createEmbed({ 
        title, 
        description, 
        color = COLORS.PRIMARY, 
        fields = [], 
        footer = BOT_INFO.FOOTER,
        thumbnail = null,
        image = null,
        timestamp = true 
    }) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setFooter({ text: footer });

        if (timestamp) {
            embed.setTimestamp();
        }

        if (thumbnail) {
            embed.setThumbnail(thumbnail);
        }

        if (image) {
            embed.setImage(image);
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        return embed;
    }

    /**
     * Create a success embed
     * @param {string} title - Embed title
     * @param {string} description - Embed description
     * @param {Array} fields - Additional fields
     * @returns {EmbedBuilder} Success embed
     */
    static createSuccessEmbed(title, description, fields = []) {
        return this.createEmbed({
            title: `${EMOJIS.SUCCESS} ${title}`,
            description,
            color: COLORS.SUCCESS,
            fields
        });
    }

    /**
     * Create an error embed
     * @param {string} title - Embed title
     * @param {string} description - Embed description
     * @param {Array} fields - Additional fields
     * @returns {EmbedBuilder} Error embed
     */
    static createErrorEmbed(title, description, fields = []) {
        return this.createEmbed({
            title: `${EMOJIS.ERROR} ${title}`,
            description,
            color: COLORS.DANGER,
            fields
        });
    }

    /**
     * Create a warning embed
     * @param {string} title - Embed title
     * @param {string} description - Embed description
     * @param {Array} fields - Additional fields
     * @returns {EmbedBuilder} Warning embed
     */
    static createWarningEmbed(title, description, fields = []) {
        return this.createEmbed({
            title: `${EMOJIS.WARNING} ${title}`,
            description,
            color: COLORS.WARNING,
            fields
        });
    }

    /**
     * Create an info embed
     * @param {string} title - Embed title
     * @param {string} description - Embed description
     * @param {Array} fields - Additional fields
     * @returns {EmbedBuilder} Info embed
     */
    static createInfoEmbed(title, description, fields = []) {
        return this.createEmbed({
            title: `${EMOJIS.INFO} ${title}`,
            description,
            color: COLORS.INFO,
            fields
        });
    }

    /**
     * Create main menu embed
     * @returns {EmbedBuilder} Main menu embed
     */
    static createMainMenuEmbed() {
        return this.createEmbed({
            title: `${EMOJIS.MOSQUE} ${BOT_INFO.NAME} - القائمة الرئيسية`,
            description: 'مرحباً بك في البوت الإسلامي! اختر الخدمة المطلوبة:',
            color: COLORS.SUCCESS,
            fields: [
                { 
                    name: `${EMOJIS.QURAN} القرآن الكريم`, 
                    value: 'تشغيل السور بصوت القراء المميزين', 
                    inline: true 
                },
                { 
                    name: `${EMOJIS.RADIO} الإذاعة المباشرة`, 
                    value: 'إذاعات القرآن الكريم من مختلف البلدان', 
                    inline: true 
                },
                { 
                    name: `${EMOJIS.HELP} المساعدة`, 
                    value: 'دليل الاستخدام والمعلومات', 
                    inline: true 
                }
            ]
        });
    }

    /**
     * Create audio playback embed
     * @param {Object} surah - Surah information
     * @param {Object} reciter - Reciter information
     * @param {string} status - Playback status
     * @returns {EmbedBuilder} Audio playback embed
     */
    static createAudioPlaybackEmbed(surah, reciter, status = 'تشغيل') {
        const statusEmojis = {
            'تشغيل': EMOJIS.PLAY,
            'إيقاف مؤقت': EMOJIS.PAUSE,
            'إيقاف': EMOJIS.STOP,
            'تحميل': EMOJIS.LOADING
        };

        return this.createEmbed({
            title: `${statusEmojis[status] || EMOJIS.MUSIC} ${status} القرآن الكريم`,
            description: `**${surah.name}** بصوت **${reciter.name}**`,
            color: status === 'تشغيل' ? COLORS.SUCCESS : 
                   status === 'إيقاف مؤقت' ? COLORS.PAUSE : 
                   status === 'إيقاف' ? COLORS.DANGER : COLORS.INFO,
            fields: [
                { name: '📖 السورة', value: surah.name, inline: true },
                { name: '🎤 القارئ', value: reciter.name, inline: true },
                { name: '📊 عدد الآيات', value: surah.numberOfAyahs.toString(), inline: true }
            ]
        });
    }

    /**
     * Create radio playback embed
     * @param {Object} station - Radio station information
     * @param {string} status - Playback status
     * @returns {EmbedBuilder} Radio playback embed
     */
    static createRadioPlaybackEmbed(station, status = 'تشغيل') {
        const statusEmojis = {
            'تشغيل': EMOJIS.PLAY,
            'إيقاف': EMOJIS.STOP,
            'تحميل': EMOJIS.LOADING
        };

        return this.createEmbed({
            title: `${statusEmojis[status] || EMOJIS.RADIO} ${status} ${station.name}`,
            description: `${station.flag} جاري ${status}...`,
            color: status === 'تشغيل' ? COLORS.SUCCESS : 
                   status === 'إيقاف' ? COLORS.DANGER : COLORS.INFO,
            fields: [
                { name: '📡 الحالة', value: status === 'تشغيل' ? '🟢 مشغل' : '🔴 متوقف', inline: true },
                { name: '🔊 الجودة', value: 'عالية', inline: true },
                { name: '🌍 البلد', value: station.country, inline: true }
            ]
        });
    }

    /**
     * Create volume control embed
     * @param {number} volume - Current volume (0-2.0)
     * @param {string} action - Volume action performed
     * @param {Object} streamInfo - Current stream information
     * @returns {EmbedBuilder} Volume control embed
     */
    static createVolumeControlEmbed(volume, action, streamInfo) {
        const volumePercentage = Math.round(volume * 100);
        const volumeEmoji = volume === 0 ? '🔇' : 
                           volume < 0.5 ? EMOJIS.VOLUME_DOWN : 
                           EMOJIS.VOLUME_UP;

        const streamName = streamInfo.type === 'radio' ? 
            'الإذاعة المباشرة' : 
            `${streamInfo.surahName} - ${streamInfo.reciterName}`;

        return this.createEmbed({
            title: `${volumeEmoji} تم ${action} مستوى الصوت`,
            description: `البث الحالي: **${streamName}**`,
            color: COLORS.INFO,
            fields: [
                { name: '🎵 نوع البث', value: streamInfo.type === 'radio' ? '📻 إذاعة مباشرة' : '📖 قرآن كريم', inline: true },
                { name: '🔊 مستوى الصوت', value: `${volumePercentage}%`, inline: true },
                { name: '📊 الحالة', value: '🟢 نشط', inline: true }
            ]
        });
    }

    /**
     * Create help embed
     * @returns {EmbedBuilder} Help embed
     */
    static createHelpEmbed() {
        return this.createEmbed({
            title: `${EMOJIS.HELP} المساعدة - ${BOT_INFO.NAME}`,
            description: 'دليل استخدام البوت الإسلامي:',
            color: COLORS.INFO,
            fields: [
                {
                    name: `${EMOJIS.QURAN} القرآن الكريم`,
                    value: '1. اختر "📖 القرآن الكريم"\n2. اختر السورة من القائمة\n3. اختر القارئ المفضل\n4. استمتع بالاستماع',
                    inline: false
                },
                {
                    name: '🎛️ التحكم في الصوت',
                    value: '⏸️ إيقاف مؤقت | ▶️ استئناف | ⏹️ إيقاف\n🔊 رفع الصوت | 🔉 خفض الصوت | ℹ️ معلومات البث',
                    inline: false
                },
                {
                    name: `${EMOJIS.RADIO} الإذاعة المباشرة`,
                    value: '1. اختر "📻 الإذاعة المباشرة"\n2. اختر البلد المفضل\n3. استمع للإذاعة مباشرة',
                    inline: false
                },
                {
                    name: `${EMOJIS.BACK} العودة`,
                    value: 'استخدم "🔙 العودة للقائمة الرئيسية" للرجوع في أي وقت',
                    inline: false
                }
            ]
        });
    }

    /**
     * Create surah selection embed
     * @param {number} totalSurahs - Total number of surahs
     * @param {number} totalReciters - Total number of reciters
     * @returns {EmbedBuilder} Surah selection embed
     */
    static createSurahSelectionEmbed(totalSurahs, totalReciters) {
        return this.createEmbed({
            title: `${EMOJIS.QURAN} اختيار السورة`,
            description: 'اختر السورة المطلوبة من القوائم أدناه:',
            color: COLORS.SUCCESS,
            fields: [
                { name: '📚 إجمالي السور', value: totalSurahs.toString(), inline: true },
                { name: '🎤 إجمالي القراء', value: totalReciters.toString(), inline: true },
                { name: '💡 نصيحة', value: 'استخدم القوائم المنسدلة للاختيار', inline: true }
            ]
        });
    }

    /**
     * Create reciter selection embed
     * @param {Object} surah - Selected surah information
     * @param {number} totalReciters - Total number of reciters
     * @returns {EmbedBuilder} Reciter selection embed
     */
    static createReciterSelectionEmbed(surah, totalReciters) {
        return this.createEmbed({
            title: `${EMOJIS.QURAN} ${surah.name}`,
            description: `اختر القارئ لتشغيل ${surah.name}`,
            color: COLORS.SUCCESS,
            fields: [
                { name: '📊 عدد الآيات', value: surah.numberOfAyahs.toString(), inline: true },
                { name: '🌍 نوع النزول', value: surah.revelationType, inline: true },
                { name: '🎤 القراء المتاحون', value: totalReciters.toString(), inline: true }
            ]
        });
    }
}

module.exports = CustomEmbedBuilder;
