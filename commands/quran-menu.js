const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const EmbedBuilder = require('../src/utils/EmbedBuilder');
const ComponentBuilder = require('../src/utils/ComponentBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quran-menu')
        .setDescription('القائمة الرئيسية للقرآن الكريم'),

    async execute(interaction) {
        try {
            // Create main menu embed using the new EmbedBuilder
            const embed = EmbedBuilder.createMainMenuEmbed();

            // Create main menu buttons using the new ComponentBuilder
            const components = [ComponentBuilder.createMainMenuButtons()];

            await interaction.reply({
                embeds: [embed],
                components,
                ephemeral: false
            });

            console.log(`[QuranMenu] Main menu displayed for user ${interaction.user.tag} in guild ${interaction.guild.name}`);

        } catch (error) {
            console.error('[QuranMenu] Error displaying main menu:', error);

            // Fallback error handling
            const errorEmbed = EmbedBuilder.createErrorEmbed(
                'خطأ',
                'حدث خطأ في عرض القائمة الرئيسية'
            );

            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};
