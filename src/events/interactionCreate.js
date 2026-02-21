const { MessageFlags } = require('discord.js');
const interactionManager = require('../core/InteractionManager');

/**
 * Handle all interaction events through the unified InteractionManager
 */
module.exports = {
    name: 'interactionCreate',

    /**
     * Execute interaction handling
     * @param {Interaction} interaction - Discord interaction
     */
    async execute(interaction) {
        try {
            // Delegate all interaction handling to the InteractionManager
            await interactionManager.handleInteraction(interaction);
        } catch (error) {
            console.error('[InteractionCreate Event] Unhandled error:', error);

            // Last resort error handling
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
                        flags: MessageFlags.Ephemeral
                    });
                } catch (replyError) {
                    console.error('[InteractionCreate Event] Error sending fallback error message:', replyError);
                }
            }
        }
    }
};
