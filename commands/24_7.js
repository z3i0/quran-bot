const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Guild = require('../models/Guild');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('24_7')
        .setDescription('Toggle the 24/7 voice feature')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Only admins can use this
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            // Find the guild data or create a new record if it doesn't exist
            let guildData = await Guild.findOne({ where: { guildId: interaction.guildId } });
            if (!guildData) {
                guildData = await Guild.create({ guildId: interaction.guildId, voice24_7: true });
                await interaction.editReply({ content: '✅ 24/7 voice mode has been **enabled** for this server.' });
                return;
            }

            // Toggle the voice24_7 setting
            guildData.voice24_7 = !guildData.voice24_7;
            await guildData.save();

            const status = guildData.voice24_7 ? '✅ enabled' : '❌ disabled';
            await interaction.editReply({ content: `24/7 voice mode has been **${status}** for this server.` });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ An error occurred while toggling 24/7 mode.' });
        }
    },
};