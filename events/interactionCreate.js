const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder 
} = require('discord.js');

// Models
const Reciter = require('../models/Reciter');
const ReciterSurahLink = require('../models/ReciterSurahLink');
const Surah = require('../models/Surah');

// Services
const audioManager = require('../audioManager');
const { getCountryName } = require('../countryMapper');

// Constants
const CONSTANTS = {
    COLORS: {
        SUCCESS: '#00ff00',
        WARNING: '#ff9900', 
        DANGER: '#ff0000',
        INFO: '#0099ff',
        PAUSE: '#ffff00'
    },
    EMOJIS: {
        MOSQUE: '🕌',
        QURAN: '📖',
        RADIO: '📻',
        HELP: '❓',
        BACK: '🔙',
        PLAY: '▶️',
        PAUSE: '⏸️',
        STOP: '⏹️',
        VOLUME_UP: '🔊',
        VOLUME_DOWN: '🔉',
        INFO: 'ℹ️',
        SUCCESS: '✅',
        ERROR: '❌',
        WARNING: '⚠️'
    },
    RADIO_STATIONS: {
        egypt: {
            name: 'إذاعة القرآن الكريم - مصر',
            flag: '🇪🇬',
            url: 'https://stream.radiojar.com/8s5u5tpdtwzuv'
        }
    }
};

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            if (interaction.isButton()) {
                await handleButtonInteraction(interaction);
            } else if (interaction.isStringSelectMenu()) {
                await handleSelectMenuInteraction(interaction);
            } else if (interaction.isModalSubmit()) {
                await handleModalSubmission(interaction);
            }
        } catch (error) {
            console.error('Error in interaction handler:', error);
            await safeReply(interaction, 'حدث خطأ غير متوقع');
        }
    }
};

// =============================================================================
// BUTTON INTERACTION HANDLERS
// =============================================================================

async function handleButtonInteraction(interaction) {
    const { customId } = interaction;
    const handlers = {
        // Main menu buttons
        'quran_radio': () => showQuranRadioOptions(interaction),
        'quran_surah': () => showSurahSelection(interaction),
        'help': () => showHelp(interaction),
        'back_to_main': () => showMainMenu(interaction),
        
        // Radio buttons
        'radio_egypt': () => playQuranRadio(interaction, 'egypt'),
        'stop_radio': () => stopRadio(interaction),
        
        // Audio control buttons (handled separately for dynamic IDs)
        default: () => handleDynamicButtons(interaction, customId)
    };

    const handler = handlers[customId] || handlers.default;
    await handler();
}

async function handleDynamicButtons(interaction, customId) {
    if (customId.startsWith('play_audio_')) {
        await notImplemented(interaction, 'تشغيل الصوت');
    } else if (customId.startsWith('volume_up') || customId.startsWith('volume_down')) {
        await handleVolumeControl(interaction, customId);
    } else if (customId.includes('_audio_')) {
        await controlQuranAudio(interaction, customId);
    } else {
        await notImplemented(interaction, 'هذه الميزة');
    }
}

// =============================================================================
// MAIN MENU
// =============================================================================

async function showMainMenu(interaction) {
    const embed = createEmbed({
        title: `${CONSTANTS.EMOJIS.MOSQUE} البوت الإسلامي - القائمة الرئيسية`,
        description: 'مرحباً بك في البوت الإسلامي! اختر الخدمة المطلوبة:',
        color: CONSTANTS.COLORS.SUCCESS,
        fields: [
            { 
                name: `${CONSTANTS.EMOJIS.QURAN} القرآن الكريم`, 
                value: 'تشغيل السور بصوت القراء المميزين', 
                inline: true 
            },
            { 
                name: `${CONSTANTS.EMOJIS.RADIO} الإذاعة المباشرة`, 
                value: 'إذاعات القرآن الكريم من مختلف البلدان', 
                inline: true 
            },
            { 
                name: `${CONSTANTS.EMOJIS.HELP} المساعدة`, 
                value: 'دليل الاستخدام والمعلومات', 
                inline: true 
            }
        ]
    });

    const buttons = new ActionRowBuilder().addComponents(
        createButton('quran_surah', `${CONSTANTS.EMOJIS.QURAN} القرآن الكريم`, ButtonStyle.Primary),
        createButton('quran_radio', `${CONSTANTS.EMOJIS.RADIO} الإذاعة المباشرة`, ButtonStyle.Success),
        createButton('help', `${CONSTANTS.EMOJIS.HELP} المساعدة`, ButtonStyle.Secondary)
    );

    await safeUpdate(interaction, { embeds: [embed], components: [buttons] });
}

// =============================================================================
// QURAN SURAH SELECTION
// =============================================================================

async function showSurahSelection(interaction) {
    try {
        const [surahs, reciters] = await Promise.all([
            Surah.findAll({ order: [['number', 'ASC']] }),
            Reciter.findAll({ order: [['name', 'ASC']] })
        ]);

        const embed = createEmbed({
            title: `${CONSTANTS.EMOJIS.QURAN} اختيار السورة`,
            description: 'اختر السورة من القوائم أدناه:',
            color: CONSTANTS.COLORS.SUCCESS,
            footer: `البوت الإسلامي - ${reciters.length} قارئ متاح`
        });

        const components = createSurahSelectMenus(surahs);
        components.push(createBackButton());

        await safeUpdate(interaction, { embeds: [embed], components });
    } catch (error) {
        console.error('Error loading surahs:', error);
        await safeReply(interaction, 'حدث خطأ في تحميل السور', true);
    }
}

function createSurahSelectMenus(surahs) {
    const components = [];
    const surahsPerMenu = 25;

    for (let i = 0; i < Math.min(75, surahs.length); i += surahsPerMenu) {
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

// =============================================================================
// SELECT MENU HANDLERS
// =============================================================================

async function handleSelectMenuInteraction(interaction) {
    const { customId } = interaction;

    if (customId.startsWith('surah_select_')) {
        await showReciterSelection(interaction);
    } else if (customId.startsWith('reciter_select_')) {
        await showQuranAudioOptions(interaction);
    }
}

async function showReciterSelection(interaction) {
    try {
        const surahNumber = interaction.values[0];
        const [surah, reciters] = await Promise.all([
            Surah.findOne({ where: { number: surahNumber } }),
            Reciter.findAll({ order: [['name', 'ASC']] })
        ]);

        if (!surah) {
            return await safeReply(interaction, 'لم يتم العثور على السورة', true);
        }

        const embed = createEmbed({
            title: `${CONSTANTS.EMOJIS.QURAN} ${surah.name}`,
            description: `اختر القارئ لتشغيل ${surah.name}`,
            color: CONSTANTS.COLORS.SUCCESS,
            fields: [
                { name: '📊 عدد الآيات', value: surah.numberOfAyahs.toString(), inline: true },
                { name: '🌍 نوع النزول', value: surah.revelationType, inline: true }
            ]
        });

        const reciterSelect = new StringSelectMenuBuilder()
            .setCustomId(`reciter_select_${surahNumber}`)
            .setPlaceholder('اختر القارئ المفضل')
            .addOptions(
                reciters.map(reciter =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(reciter.name)
                        .setValue(reciter.id.toString())
                        .setDescription(getCountryName(reciter.country))
                )
            );

        const components = [new ActionRowBuilder().addComponents(reciterSelect)];

        await safeUpdate(interaction, { embeds: [embed], components });
    } catch (error) {
        console.error('Error showing reciter selection:', error);
        await safeReply(interaction, 'حدث خطأ في عرض القراء', true);
    }
}

// =============================================================================
// AUDIO PLAYBACK
// =============================================================================

async function showQuranAudioOptions(interaction) {
    try {
        const reciterId = interaction.values[0];
        const surahNumber = extractSurahNumberFromCustomId(interaction);

        const [reciter, surah, link] = await Promise.all([
            Reciter.findByPk(reciterId),
            Surah.findOne({ where: { number: surahNumber } }),
            ReciterSurahLink.findOne({
                where: { reciter_id: reciterId, surah_id: surahNumber }
            })
        ]);

        if (!reciter || !surah || !link) {
            return await safeReply(interaction, 'لم يتم العثور على المعلومات المطلوبة', true);
        }

        const embed = createAudioPlaybackEmbed(surah, reciter);
        const components = createAudioControlComponents(reciterId, surahNumber);

        await safeUpdate(interaction, { embeds: [embed], components });
        await startAudioPlayback(interaction, link, surah, reciter);
    } catch (error) {
        console.error('Error showing Quran audio options:', error);
        await safeReply(interaction, 'حدث خطأ في عرض خيارات الصوت', true);
    }
}

function createAudioPlaybackEmbed(surah, reciter) {
    return createEmbed({
        title: '🎵 تشغيل القرآن الكريم',
        description: `جاري تشغيل **${surah.name}** بصوت **${reciter.name}**`,
        color: CONSTANTS.COLORS.SUCCESS,
        fields: [
            { name: '📖 السورة', value: surah.name, inline: true },
            { name: '🎤 القارئ', value: reciter.name, inline: true },
            { name: '🌍 البلد', value: getCountryName(reciter.country), inline: true }
        ]
    });
}

function createAudioControlComponents(interaction, reciterId, surahNumber) {
    const controlRow = new ActionRowBuilder().addComponents(
        createButton(`pause_audio_${reciterId}_${surahNumber}`, `${CONSTANTS.EMOJIS.PAUSE} إيقاف مؤقت`, ButtonStyle.Secondary),
        createButton(`stop_audio_${reciterId}_${surahNumber}`, `${CONSTANTS.EMOJIS.STOP} إيقاف`, ButtonStyle.Danger),
        createButton(`resume_audio_${reciterId}_${surahNumber}`, `${CONSTANTS.EMOJIS.PLAY} استئناف`, ButtonStyle.Success)
    );

    const volumeRow = new ActionRowBuilder().addComponents(
        createButton(`volume_up`, `${CONSTANTS.EMOJIS.VOLUME_UP} رفع الصوت`, ButtonStyle.Primary),
        createButton(`volume_down`, `${CONSTANTS.EMOJIS.VOLUME_DOWN} خفض الصوت`, ButtonStyle.Primary),
        createButton(`info_audio`, `${CONSTANTS.EMOJIS.INFO} معلومات البث`, ButtonStyle.Secondary)
    );

    return [controlRow, volumeRow, createBackButton()];
}

async function startAudioPlayback(interaction, link, surah, reciter) {
    try {
        const guild = interaction.guild;
        const member = interaction.member;

        if (!member.voice.channel) {
            return await interaction.followUp({
                content: 'يجب أن تكون في قناة صوتية لتشغيل الصوت',
                ephemeral: true
            });
        }

        if (!audioManager.hasConnection(guild.id)) {
            await audioManager.joinVoiceChannel(guild.id, member.voice.channel.id, guild);
        }

        await audioManager.playQuran(guild.id, link.audio_url, surah.name, reciter.name);
        
        await interaction.followUp({
            content: `${CONSTANTS.EMOJIS.SUCCESS} تم تشغيل ${surah.name} بصوت ${reciter.name} بنجاح!`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error playing audio:', error);
        await interaction.followUp({
            content: 'حدث خطأ في تشغيل الصوت',
            ephemeral: true
        });
    }
}

// =============================================================================
// VOLUME CONTROL
// =============================================================================

async function handleVolumeControl(interaction, customId) {
    try {
        const guildId = interaction.guild.id;
        const currentStream = audioManager.getCurrentStream(guildId);
        const playerStatus = audioManager.getPlayerStatus(guildId);

        // Check if there's any audio playing
        if (!playerStatus || !currentStream) {
            return await safeReply(interaction, 'لا يوجد صوت قيد التشغيل حالياً', true);
        }

        const isVolumeUp = customId.startsWith('volume_up');
        const action = isVolumeUp ? 'up' : 'down';
        
        let result;
        if (action === 'up') {
            result = handleVolumeUpAction(guildId);
        } else {
            result = handleVolumeDownAction(guildId);
        }

        if (result.shouldUpdate) {
            // Create appropriate embed based on stream type
            let embed;
            if (currentStream.type === 'quran') {
                // For Quran, we need to get reciter and surah info
                const reciterId = extractReciterIdFromMessage(interaction);
                const surahNumber = extractSurahNumberFromMessage(interaction);
                
                if (reciterId && surahNumber) {
                    const [reciter, surah] = await Promise.all([
                        Reciter.findByPk(reciterId),
                        Surah.findOne({ where: { number: surahNumber } })
                    ]);
                    
                    if (reciter && surah) {
                        embed = createAudioControlEmbed(interaction, result, surah, reciter);
                        const components = createAudioControlComponents(reciterId, surahNumber);
                        return await safeUpdate(interaction, { embeds: [embed], components });
                    }
                }
            }
            
            // For radio or when we can't get Quran info, create a generic volume embed
            embed = createVolumeControlEmbed(result, currentStream, guildId);
            const components = createRadioVolumeControls();
            await safeUpdate(interaction, { embeds: [embed], components });
        } else {
            await safeReply(interaction, `${CONSTANTS.EMOJIS.WARNING} ${result.message}`, true);
        }
    } catch (error) {
        console.error('Error handling volume control:', error);
        await safeReply(interaction, 'حدث خطأ في التحكم في مستوى الصوت', true);
    }
}

function createVolumeControlEmbed(result, currentStream, guildId) {
    const currentVolume = audioManager.getCurrentVolume(guildId);
    const streamName = currentStream.type === 'radio' ? 'الإذاعة المباشرة' : 
                      currentStream.surahName ? `${currentStream.surahName} - ${currentStream.reciterName}` : 'البث الحالي';
    
    return createEmbed({
        title: '🔊 تم تغيير مستوى الصوت',
        description: `تم ${result.message} للبث: **${streamName}**`,
        color: result.color || CONSTANTS.COLORS.INFO,
        fields: [
            { name: '🎵 نوع البث', value: currentStream.type === 'radio' ? '📻 إذاعة مباشرة' : '📖 قرآن كريم', inline: true },
            { name: '🔊 مستوى الصوت', value: `${Math.round(currentVolume * 100)}%`, inline: true }
        ]
    });
}

function createRadioVolumeControls() {
    const volumeRow = new ActionRowBuilder().addComponents(
        createButton('volume_up', `${CONSTANTS.EMOJIS.VOLUME_UP} رفع الصوت`, ButtonStyle.Primary),
        createButton('volume_down', `${CONSTANTS.EMOJIS.VOLUME_DOWN} خفض الصوت`, ButtonStyle.Primary),
        createButton('stop_radio', `${CONSTANTS.EMOJIS.STOP} إيقاف`, ButtonStyle.Danger)
    );

    return [volumeRow, createBackButton()];
}

function extractReciterIdFromMessage(interaction) {
    try {
        // Try to extract from button components in the message
        const components = interaction.message.components;
        for (const row of components) {
            for (const component of row.components) {
                if (component.customId && component.customId.includes('_audio_')) {
                    const parts = component.customId.split('_');
                    if (parts.length >= 3) {
                        return parts[2]; // reciterId
                    }
                }
            }
        }
    } catch (error) {
        console.warn('Could not extract reciter ID from message:', error);
    }
    return null;
}

function extractSurahNumberFromMessage(interaction) {
    try {
        // Try to extract from button components in the message
        const components = interaction.message.components;
        for (const row of components) {
            for (const component of row.components) {
                if (component.customId && component.customId.includes('_audio_')) {
                    const parts = component.customId.split('_');
                    if (parts.length >= 4) {
                        return parts[3]; // surahNumber
                    }
                }
            }
        }
    } catch (error) {
        console.warn('Could not extract surah number from message:', error);
    }
    return null;
}

// =============================================================================
// AUDIO CONTROL
// =============================================================================

async function controlQuranAudio(interaction, customId) {
    try {
        const { action, reciterId, surahNumber, guildId } = parseAudioControlId(customId, interaction);
        const [reciter, surah] = await Promise.all([
            Reciter.findByPk(reciterId),
            Surah.findOne({ where: { number: surahNumber } })
        ]);

        if (!reciter || !surah) {
            return await safeReply(interaction, 'لم يتم العثور على المعلومات المطلوبة', true);
        }

        const result = await executeAudioAction(action, guildId, surah, reciter);
        
        if (result.shouldUpdate) {
            const embed = createAudioControlEmbed(interaction, result, surah, reciter);
            const components = createAudioControlComponents(interaction, reciterId, surahNumber);
            await safeUpdate(interaction, { embeds: [embed], components });
        } else {
            await safeReply(interaction, `${CONSTANTS.EMOJIS.WARNING} ${result.message}`, true);
        }
    } catch (error) {
        console.error('Error controlling Quran audio:', error);
        await safeReply(interaction, 'حدث خطأ في التحكم في الصوت', true);
    }
}

async function executeAudioAction(action, guildId, surah, reciter) {
    const playerStatus = audioManager.getPlayerStatus(guildId);
    const currentStream = audioManager.getCurrentStream(guildId);

    // Validate stream
    if (!playerStatus || !currentStream || currentStream.type !== 'quran' || 
        currentStream.surahName !== surah.name || currentStream.reciterName !== reciter.name) {
        return {
            shouldUpdate: false,
            message: 'لا يوجد صوت قيد التشغيل لهذه السورة أو القارئ'
        };
    }

    const actions = {
        pause: () => handlePauseAction(playerStatus, guildId),
        stop: () => handleStopAction(playerStatus, guildId),
        resume: () => handleResumeAction(playerStatus, guildId),
        up: () => handleVolumeUpAction(guildId),
        down: () => handleVolumeDownAction(guildId),
        audio: () => ({ shouldUpdate: true, message: 'عرض معلومات البث', color: CONSTANTS.COLORS.INFO })
    };

    return actions[action]?.() || { shouldUpdate: false, message: 'إجراء غير معروف' };
}

function handlePauseAction(playerStatus, guildId) {
    if (playerStatus !== 'playing') {
        return { shouldUpdate: false, message: 'الصوت ليس قيد التشغيل ليتم إيقافه مؤقتاً' };
    }
    
    const success = audioManager.pauseAudio(guildId);
    return {
        shouldUpdate: success,
        message: success ? 'إيقاف مؤقت' : 'فشل في إيقاف الصوت مؤقتاً',
        color: success ? CONSTANTS.COLORS.PAUSE : CONSTANTS.COLORS.WARNING
    };
}

function handleStopAction(playerStatus, guildId) {
    if (playerStatus !== 'playing' && playerStatus !== 'paused') {
        return { shouldUpdate: false, message: 'الصوت ليس قيد التشغيل أو متوقف مؤقتاً ليتم إيقافه' };
    }
    
    const success = audioManager.stopAudio(guildId);
    return {
        shouldUpdate: success,
        message: success ? 'إيقاف' : 'فشل في إيقاف الصوت',
        color: success ? CONSTANTS.COLORS.DANGER : CONSTANTS.COLORS.WARNING
    };
}

function handleResumeAction(playerStatus, guildId) {
    if (playerStatus !== 'paused') {
        return { shouldUpdate: false, message: 'الصوت ليس متوقف مؤقتاً ليتم استئنافه' };
    }
    
    const success = audioManager.resumeAudio(guildId);
    return {
        shouldUpdate: success,
        message: success ? 'استئناف' : 'فشل في استئناف الصوت',
        color: success ? CONSTANTS.COLORS.SUCCESS : CONSTANTS.COLORS.WARNING
    };
}

function handleVolumeUpAction(guildId) {
    const currentVolume = audioManager.getCurrentVolume(guildId);
    const newVolume = Math.min(2.0, currentVolume + 0.1);
    const success = audioManager.setVolume(guildId, newVolume);
    
    return {
        shouldUpdate: success,
        message: success ? `رفع الصوت إلى ${Math.round(newVolume * 100)}%` : 'لا يمكن تغيير مستوى الصوت',
        color: success ? CONSTANTS.COLORS.INFO : CONSTANTS.COLORS.WARNING
    };
}

function handleVolumeDownAction(guildId) {
    const currentVolume = audioManager.getCurrentVolume(guildId);
    const newVolume = Math.max(0, currentVolume - 0.1);
    const success = audioManager.setVolume(guildId, newVolume);
    
    return {
        shouldUpdate: success,
        message: success ? `خفض الصوت إلى ${Math.round(newVolume * 100)}%` : 'لا يمكن تغيير مستوى الصوت',
        color: success ? CONSTANTS.COLORS.WARNING : CONSTANTS.COLORS.WARNING
    };
}

function createAudioControlEmbed(interaction, result, surah, reciter) {
    console.log(interaction)
    const currentVolume = audioManager.getCurrentVolume(interaction.guild.id);
    
    return createEmbed({
        title: result.message === 'عرض معلومات البث' ? 'ℹ️ معلومات البث الحالي' : '🎵 تم التحكم في الصوت',
        description: `تم ${result.message} تشغيل **${surah.name}** بصوت **${reciter.name}**`,
        color: result.color || CONSTANTS.COLORS.SUCCESS,
        fields: [
            { name: '🌍 البلد', value: getCountryName(reciter.country), inline: true },
            { name: '🔊 مستوى الصوت', value: `${Math.round(currentVolume * 100)}%`, inline: true }
        ]
    });
}

// =============================================================================
// RADIO FUNCTIONALITY
// =============================================================================

async function showQuranRadioOptions(interaction) {
    const embed = createEmbed({
        title: `${CONSTANTS.EMOJIS.RADIO} إذاعة القرآن الكريم`,
        description: 'اختر الإذاعة المفضلة:',
        color: CONSTANTS.COLORS.SUCCESS,
        fields: [
            { name: '🇪🇬 مصر', value: 'إذاعة القرآن الكريم - مصر', inline: true }
        ]
    });

    const radioButtons = new ActionRowBuilder().addComponents(
        createButton('radio_egypt', '🇪🇬 مصر', ButtonStyle.Primary)
    );

    const components = [radioButtons, createBackButton()];

    await safeUpdate(interaction, { embeds: [embed], components });
}

async function playQuranRadio(interaction, station) {
    try {
        const guild = interaction.guild;
        const member = interaction.member;
        const stationInfo = CONSTANTS.RADIO_STATIONS[station];

        if (!member.voice.channel) {
            return await safeReply(interaction, 'يجب أن تكون في قناة صوتية لتشغيل الإذاعة', true);
        }

        if (!audioManager.hasConnection(guild.id)) {
            await audioManager.joinVoiceChannel(guild.id, member.voice.channel.id, guild);
        }

        await audioManager.playRadio(guild.id, stationInfo.url);

        const embed = createEmbed({
            title: `${CONSTANTS.EMOJIS.RADIO} ${stationInfo.name}`,
            description: `جاري تشغيل ${stationInfo.flag}... 🔊`,
            color: CONSTANTS.COLORS.SUCCESS,
            fields: [
                { name: '📡 الحالة', value: '🟢 مشغل', inline: true },
                { name: '🔊 الجودة', value: 'عالية', inline: true },
                { name: '🌍 البلد', value: stationInfo.flag, inline: true }
            ]
        });

        const controls = new ActionRowBuilder().addComponents(
            createButton('stop_radio', `${CONSTANTS.EMOJIS.STOP} إيقاف`, ButtonStyle.Danger),
            createButton('back_to_main', `${CONSTANTS.EMOJIS.BACK} العودة للقائمة الرئيسية`, ButtonStyle.Secondary)
        );

        const volumeControls = new ActionRowBuilder().addComponents(
            createButton('volume_up', `${CONSTANTS.EMOJIS.VOLUME_UP} رفع الصوت`, ButtonStyle.Primary),
            createButton('volume_down', `${CONSTANTS.EMOJIS.VOLUME_DOWN} خفض الصوت`, ButtonStyle.Primary)
        );

        await safeUpdate(interaction, { embeds: [embed], components: [controls, volumeControls] });
    } catch (error) {
        console.error('Error playing radio:', error);
        await safeReply(interaction, 'حدث خطأ في تشغيل الإذاعة', true);
    }
}

async function stopRadio(interaction) {
    try {
        const guild = interaction.guild;
        audioManager.stopAudio(guild);

        const embed = createEmbed({
            title: `${CONSTANTS.EMOJIS.RADIO} تم إيقاف الإذاعة`,
            description: `تم إيقاف إذاعة القرآن الكريم بنجاح! ${CONSTANTS.EMOJIS.STOP}`,
            color: CONSTANTS.COLORS.DANGER
        });

        await safeUpdate(interaction, { 
            embeds: [embed], 
            components: [createBackButton()] 
        });
    } catch (error) {
        console.error('Error stopping radio:', error);
        await safeReply(interaction, 'حدث خطأ في إيقاف الإذاعة', true);
    }
}

// =============================================================================
// HELP FUNCTIONALITY
// =============================================================================

async function showHelp(interaction) {
    const embed = createEmbed({
        title: `${CONSTANTS.EMOJIS.HELP} المساعدة - البوت الإسلامي`,
        description: 'دليل استخدام البوت الإسلامي:',
        color: CONSTANTS.COLORS.INFO,
        fields: [
            {
                name: `${CONSTANTS.EMOJIS.QURAN} القرآن الكريم`,
                value: '1. اختر "📖 القرآن الكريم"\n2. اختر السورة من القائمة\n3. اختر القارئ المفضل\n4. اضغط "▶️ تشغيل الصوت"',
                inline: false
            },
            {
                name: '🎛️ التحكم في الصوت',
                value: '⏸️ إيقاف مؤقت | ▶️ استئناف | ⏹️ إيقاف\n🔊 رفع الصوت | 🔉 خفض الصوت | ℹ️ معلومات البث',
                inline: false
            },
            {
                name: `${CONSTANTS.EMOJIS.RADIO} الإذاعة المباشرة`,
                value: '1. اختر "📻 الإذاعة المباشرة"\n2. اختر البلد المفضل\n3. استمع للإذاعة مباشرة',
                inline: false
            },
            {
                name: `${CONSTANTS.EMOJIS.BACK} العودة`,
                value: 'استخدم "🔙 العودة للقائمة الرئيسية" للرجوع',
                inline: false
            }
        ]
    });

    await safeUpdate(interaction, { 
        embeds: [embed], 
        components: [createBackButton()] 
    });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function createEmbed({ title, description, color, fields = [], footer = 'البوت الإسلامي - خدمة القرآن الكريم' }) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: footer })
        .setTimestamp();

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

function createButton(customId, label, style) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style);
}

function createBackButton() {
    return new ActionRowBuilder().addComponents(
        createButton('back_to_main', `${CONSTANTS.EMOJIS.BACK} العودة للقائمة الرئيسية`, ButtonStyle.Secondary)
    );
}

function extractSurahNumberFromCustomId(interaction) {
    return interaction.message.components[0].components[0].customId.split('_')[2];
}

function parseAudioControlId(customId, interaction) {
    const parts = customId.split('_');
    return {
        action: parts[1],
        reciterId: parts[2],
        surahNumber: parts[3],
        guildId: interaction.guild.id
    };
}

async function safeReply(interaction, content, ephemeral = false) {
    try {
        await interaction.reply({ 
            content: `${CONSTANTS.EMOJIS.ERROR} ${content}`, 
            ephemeral 
        });
    } catch (error) {
        console.error('Error in safeReply:', error);
    }
}

async function safeUpdate(interaction, options) {
    try {
        await interaction.update(options);
    } catch (error) {
        console.error('Error in safeUpdate:', error);
        await safeReply(interaction, 'حدث خطأ في تحديث الواجهة', true);
    }
}

async function notImplemented(interaction, feature) {
    await safeReply(interaction, `${feature} غير متوفرة حالياً`, true);
}

// =============================================================================
// PLACEHOLDER HANDLERS FOR UNIMPLEMENTED FEATURES
// =============================================================================

async function handleModalSubmission(interaction) {
    await notImplemented(interaction, 'هذه الميزة');
}