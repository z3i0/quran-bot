const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const DatabaseService = require('../src/services/DatabaseService');
const CustomEmbedBuilder = require('../src/utils/EmbedBuilder');
const ComponentBuilder = require('../src/utils/ComponentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('البحث عن سورة أو قارئ')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('اسم السورة أو القارئ')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        if (!focusedValue) return interaction.respond([]);

        try {
            // Search both surahs and reciters
            const [surahs, reciters] = await Promise.all([
                DatabaseService.searchSurahs(focusedValue),
                DatabaseService.searchReciters(focusedValue)
            ]);

            const options = [];

            // Add surahs to options
            surahs.slice(0, 12).forEach(surah => {
                options.push({
                    name: `📖 سورة ${surah.name}`,
                    value: `surah_${surah.number}`
                });
            });

            // Add reciters to options
            reciters.slice(0, 13).forEach(reciter => {
                options.push({
                    name: `🎤 القارئ ${reciter.name}`,
                    value: `reciter_${reciter.id}`
                });
            });

            await interaction.respond(options.slice(0, 25));
        } catch (error) {
            console.error('[SearchCommand] Autocomplete error:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        const query = interaction.options.getString('query');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            if (query.startsWith('surah_')) {
                const surahNumber = parseInt(query.replace('surah_', ''));
                const surah = await DatabaseService.getSurahByNumber(surahNumber);
                const reciters = await DatabaseService.getRecitersForSurah(surahNumber);

                if (!surah) {
                    return interaction.editReply({ content: '❌ لم يتم العثور على السورة' });
                }

                const embed = CustomEmbedBuilder.createReciterSelectionEmbed(surah, reciters.length);
                const components = [
                    ComponentBuilder.createReciterSelectMenu(reciters, surahNumber),
                    ComponentBuilder.createBackButton()
                ];

                await interaction.editReply({ embeds: [embed], components });

            } else if (query.startsWith('reciter_')) {
                const reciterId = parseInt(query.replace('reciter_', ''));
                const reciter = await DatabaseService.getReciterById(reciterId);
                const surahs = await DatabaseService.getAllSurahs();

                if (!reciter) {
                    return interaction.editReply({ content: '❌ لم يتم العثور على القارئ' });
                }

                // Show surah selection for this specific reciter
                // This might need a new helper in ComponentBuilder or just reuse existing ones with context
                const embed = CustomEmbedBuilder.createEmbed({
                    title: `🎤 القارئ: ${reciter.name}`,
                    description: `اختر السورة التي ترغب في الاستماع إليها بصوت ${reciter.name}:`,
                    color: '#00ff00',
                    thumbnail: reciter.avatar
                });

                // For simplicity, we can reuse surah select menus but we need to handle the selection correctly
                // In a real scenario, we might want a special customId like `reciter_direct_surah_SELECT_ID`
                // But for now, let's just show the main Quran menu which is easier.

                const components = ComponentBuilder.createSurahSelectMenus(surahs);
                components.push(ComponentBuilder.createBackButton());

                await interaction.editReply({ embeds: [embed], components });

            } else {
                // Generic text search if they didn't use autocomplete
                const [surahs, reciters] = await Promise.all([
                    DatabaseService.searchSurahs(query),
                    DatabaseService.searchReciters(query)
                ]);

                if (surahs.length === 0 && reciters.length === 0) {
                    return interaction.editReply({ content: '❌ لم يتم العثور على نتائج تطابق بحثك' });
                }

                const embed = CustomEmbedBuilder.createEmbed({
                    title: '🔍 نتائج البحث',
                    description: `نتائج البحث عن: **${query}**`,
                    fields: [
                        { name: '📖 السور', value: surahs.length > 0 ? surahs.slice(0, 5).map(s => `• ${s.name}`).join('\n') : 'لا يوجد', inline: true },
                        { name: '🎤 القراء', value: reciters.length > 0 ? reciters.slice(0, 5).map(r => `• ${r.name}`).join('\n') : 'لا يوجد', inline: true }
                    ]
                });

                await interaction.editReply({ embeds: [embed], content: 'يرجى استخدام خيارات البحث (Autocomplete) للحصول على أفضل النتائج' });
            }
        } catch (error) {
            console.error('[SearchCommand] Execution error:', error);
            await interaction.editReply({ content: '❌ حدث خطأ أثناء تنفيذ البحث' });
        }
    }
};
