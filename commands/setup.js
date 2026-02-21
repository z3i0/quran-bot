const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const Guild = require('../models/Guild');
const audioManager = require('../src/core/AudioManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('إعداد قناة الصوت وإعدادات التواجد')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('القناة الصوتية')
                .setRequired(true)
                .addChannelTypes(2, 13) // 2: Voice Channel, 13: Stage Channel
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('وضع التواجد')
                .setRequired(true)
                .addChoices(
                    { name: 'دخول وخروج تلقائي (Follow Mode)', value: 'follow' },
                    { name: 'بقاء دائم 24/7 (Stay Mode)', value: 'stay' }
                )),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const channel = interaction.options.getChannel('channel');
        const mode = interaction.options.getString('mode');

        if (channel.type !== 2 && channel.type !== 13) {
            return interaction.editReply({ content: '❌ يرجى اختيار قناة صوتية أو قناة Stage صالحة.' });
        }

        try {
            const is247 = mode === 'stay';

            await Guild.upsert({
                guildId: interaction.guildId,
                voiceChannelId: channel.id,
                voice24_7: is247,
                lang: 'ar',
                name: interaction.guild.name,
                icon: interaction.guild.iconURL(),
                ownerId: interaction.guild.ownerId,
                botinserver: true
            });

            // Immediately join the channel if in stay mode or if there are users
            const humanMembers = channel.members.filter(member => !member.user.bot);
            if (is247 || humanMembers.size > 0) {
                try {
                    await audioManager.joinVoiceChannel(interaction.guildId, channel.id, interaction.guild);
                    // Start default stream
                    const { RADIO_STATIONS } = require('../src/utils/Constants');
                    await audioManager.playRadio(interaction.guildId, RADIO_STATIONS.egypt.url, RADIO_STATIONS.egypt);
                } catch (audioError) {
                    console.error('[SetupCommand] Error joining voice:', audioError);
                }
            }

            const modeText = is247 ? 'وضع البقاء الدائم (24/7)' : 'وضع الدخول والخروج التلقائي';
            await interaction.editReply({
                content: `✅ تم إعداد البوت بنجاح!\n📍 القناة: ${channel.name}\n⚙️ الوضع: ${modeText}`
            });
        } catch (error) {
            console.error('Failed to save voice channel to DB:', error);
            await interaction.editReply({ content: '❌ فشل في حفظ الإعدادات في قاعدة البيانات.' });
        }
    }
}
