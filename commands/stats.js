const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const DatabaseService = require('../src/services/DatabaseService');
const CustomEmbedBuilder = require('../src/utils/EmbedBuilder');
const interactionManager = require('../src/core/InteractionManager');
const { EMOJIS, COLORS } = require('../src/utils/Constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('عرض إحصائيات البوت'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const dbStats = await DatabaseService.getStatistics();
            const botStats = interactionManager.getStatistics();

            const embed = CustomEmbedBuilder.createEmbed({
                title: `${EMOJIS.INFO} إحصائيات ${interaction.client.user.username}`,
                description: 'إحصائيات شاملة للنظام وقاعدة البيانات',
                color: COLORS.PRIMARY,
                fields: [
                    {
                        name: '📊 إحصائيات النظام', value: [
                            `• إجمالي التفاعلات: \`${botStats.totalInteractions}\``,
                            `• تفاعلات الأزرار: \`${botStats.buttonInteractions}\``,
                            `• تفاعلات القوائم: \`${botStats.selectMenuInteractions}\``,
                            `• وقت التشغيل: \`${botStats.uptime.formatted}\``,
                            `• معدل الخطأ: \`${botStats.errorRate}%\``
                        ].join('\n'), inline: false
                    },
                    {
                        name: '📖 إحصائيات المحتوى', value: [
                            `• عدد السور: \`${dbStats.surahs}\``,
                            `• عدد القراء: \`${dbStats.reciters}\``,
                            `• الإشارات المرجعية: \`${dbStats.bookmarks}\``
                        ].join('\n'), inline: true
                    },
                    {
                        name: '🖧 الشبكة', value: [
                            `• السيرفرات: \`${dbStats.guilds}\``,
                            `• المستخدمين: \`${dbStats.users}\``
                        ].join('\n'), inline: true
                    }
                ],
                thumbnail: interaction.client.user.displayAvatarURL()
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[StatsCommand] Error:', error);
            await interaction.editReply({ content: '❌ حدث خطأ أثناء جلب الإحصائيات' });
        }
    }
};
