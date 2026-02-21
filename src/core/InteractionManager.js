const { MessageFlags } = require('discord.js');
const ButtonHandler = require('../handlers/ButtonHandler');
const SelectMenuHandler = require('../handlers/SelectMenuHandler');
const EmbedBuilder = require('../utils/EmbedBuilder');
const { MESSAGES } = require('../utils/Constants');

/**
 * Unified Interaction Manager - Routes all interactions to appropriate handlers
 */
class InteractionManager {
    constructor() {
        this.buttonHandler = ButtonHandler;
        this.selectMenuHandler = SelectMenuHandler;

        // Statistics tracking
        this.stats = {
            totalInteractions: 0,
            buttonInteractions: 0,
            selectMenuInteractions: 0,
            modalInteractions: 0,
            errors: 0,
            startTime: Date.now()
        };

        console.log('[InteractionManager] Interaction Manager initialized successfully');
    }

    /**
     * Handle any type of interaction
     * @param {Interaction} interaction - Discord interaction
     */
    async handleInteraction(interaction) {
        const startTime = Date.now();
        try {
            // Update statistics
            this.stats.totalInteractions++;

            // Route to appropriate handler based on interaction type
            if (interaction.isChatInputCommand()) {
                await this.handleSlashCommand(interaction);
            } else if (interaction.isButton()) {
                this.stats.buttonInteractions++;
                await this.buttonHandler.handle(interaction);
            } else if (interaction.isStringSelectMenu()) {
                this.stats.selectMenuInteractions++;
                await this.selectMenuHandler.handle(interaction);
            } else if (interaction.isModalSubmit()) {
                this.stats.modalInteractions++;
                await this.handleModalSubmit(interaction);
            } else if (interaction.isAutocomplete()) {
                await this.handleAutocomplete(interaction);
            } else {
                await this.handleUnknownInteraction(interaction);
            }

            // performance tracking
            const duration = Date.now() - startTime;
            if (duration > 1500) {
                console.warn(`[InteractionManager] Slow interaction: ${interaction.customId || interaction.commandName} took ${duration}ms`);
            }

        } catch (error) {
            this.stats.errors++;
            console.error('[InteractionManager] Error handling interaction:', error);
            await this.handleInteractionError(interaction, error);
        }
    }

    // =============================================================================
    // SLASH COMMAND HANDLING
    // =============================================================================

    /**
     * Handle slash command interactions
     * @param {ChatInputCommandInteraction} interaction - Slash command interaction
     */
    async handleSlashCommand(interaction) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.warn(`[InteractionManager] Unknown command: ${interaction.commandName}`);
            const embed = EmbedBuilder.createWarningEmbed(
                'أمر غير معروف',
                'هذا الأمر غير متوفر'
            );
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            console.log(`[InteractionManager] Executing command: ${interaction.commandName} by ${interaction.user.tag}`);
            await command.execute(interaction);
        } catch (error) {
            console.error(`[InteractionManager] Error executing command ${interaction.commandName}:`, error);

            const embed = EmbedBuilder.createErrorEmbed(
                'خطأ في تنفيذ الأمر',
                'حدث خطأ أثناء تنفيذ الأمر'
            );

            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    }

    // =============================================================================
    // MODAL HANDLING
    // =============================================================================

    /**
     * Handle modal submit interactions
     * @param {ModalSubmitInteraction} interaction - Modal submit interaction
     */
    async handleModalSubmit(interaction) {
        const { customId } = interaction;

        try {
            // Route to appropriate modal handler
            if (customId.startsWith('search_')) {
                await this.handleSearchModal(interaction);
            } else if (customId.startsWith('feedback_')) {
                await this.handleFeedbackModal(interaction);
            } else if (customId.startsWith('report_')) {
                await this.handleReportModal(interaction);
            } else {
                await this.handleUnknownModal(interaction, customId);
            }
        } catch (error) {
            console.error(`[InteractionManager] Error handling modal ${customId}:`, error);
            await this.handleInteractionError(interaction, error);
        }
    }

    /**
     * Handle search modal (future feature)
     * @param {ModalSubmitInteraction} interaction
     */
    async handleSearchModal(interaction) {
        const embed = EmbedBuilder.createInfoEmbed(
            'قريباً',
            'ميزة البحث ستكون متاحة قريباً'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle feedback modal (future feature)
     * @param {ModalSubmitInteraction} interaction
     */
    async handleFeedbackModal(interaction) {
        const embed = EmbedBuilder.createSuccessEmbed(
            'شكراً لك',
            'تم استلام ملاحظاتك بنجاح'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle report modal (future feature)
     * @param {ModalSubmitInteraction} interaction
     */
    async handleReportModal(interaction) {
        const embed = EmbedBuilder.createSuccessEmbed(
            'تم الإرسال',
            'تم إرسال التقرير بنجاح'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    /**
     * Handle unknown modal
     * @param {ModalSubmitInteraction} interaction
     * @param {string} customId - Modal custom ID
     */
    async handleUnknownModal(interaction, customId) {
        console.warn(`[InteractionManager] Unknown modal: ${customId}`);
        const embed = EmbedBuilder.createWarningEmbed(
            'نموذج غير معروف',
            'هذا النموذج غير متوفر'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // =============================================================================
    // AUTOCOMPLETE HANDLING
    // =============================================================================

    /**
     * Handle autocomplete interactions
     * @param {AutocompleteInteraction} interaction - Autocomplete interaction
     */
    async handleAutocomplete(interaction) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command || !command.autocomplete) {
            return;
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(`[InteractionManager] Error in autocomplete for ${interaction.commandName}:`, error);
        }
    }

    // =============================================================================
    // ERROR HANDLING
    // =============================================================================

    /**
     * Handle unknown interaction types
     * @param {Interaction} interaction - Unknown interaction
     */
    async handleUnknownInteraction(interaction) {
        console.warn(`[InteractionManager] Unknown interaction type: ${interaction.type}`);

        if (interaction.isRepliable()) {
            const embed = EmbedBuilder.createWarningEmbed(
                'تفاعل غير مدعوم',
                'نوع التفاعل هذا غير مدعوم حالياً'
            );
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }

    /**
     * Handle interaction errors
     * @param {Interaction} interaction - Failed interaction
     * @param {Error} error - Error object
     */
    async handleInteractionError(interaction, error) {
        const embed = EmbedBuilder.createErrorEmbed(
            'خطأ غير متوقع',
            error.message || MESSAGES.ERRORS.GENERIC
        );

        try {
            if (interaction.isRepliable()) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            }
        } catch (replyError) {
            console.error('[InteractionManager] Error sending error message:', replyError);
        }
    }

    // =============================================================================
    // MIDDLEWARE AND VALIDATION
    // =============================================================================

    /**
     * Validate interaction before processing
     * @param {Interaction} interaction - Discord interaction
     * @returns {boolean} Validation result
     */
    validateInteraction(interaction) {
        // Basic validation
        if (!interaction.guild) {
            console.warn('[InteractionManager] Interaction outside of guild');
            return false;
        }

        if (!interaction.member) {
            console.warn('[InteractionManager] No member information');
            return false;
        }

        return true;
    }

    /**
     * Apply rate limiting (future feature)
     * @param {Interaction} interaction - Discord interaction
     * @returns {boolean} Whether interaction should proceed
     */
    applyRateLimit(interaction) {
        // TODO: Implement rate limiting
        return true;
    }

    /**
     * Log interaction for analytics
     * @param {Interaction} interaction - Discord interaction
     */
    logInteraction(interaction) {
        const logData = {
            type: interaction.type,
            customId: interaction.customId || interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            timestamp: new Date().toISOString()
        };

        console.log(`[InteractionManager] Interaction logged:`, logData);
        // TODO: Store in database for analytics
    }

    // =============================================================================
    // STATISTICS AND MONITORING
    // =============================================================================

    /**
     * Get interaction statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        const uptime = Date.now() - this.stats.startTime;
        const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

        return {
            ...this.stats,
            uptime: {
                milliseconds: uptime,
                formatted: `${uptimeHours}h ${uptimeMinutes}m`
            },
            averageInteractionsPerHour: uptimeHours > 0 ? Math.round(this.stats.totalInteractions / uptimeHours) : 0,
            errorRate: this.stats.totalInteractions > 0 ?
                Math.round((this.stats.errors / this.stats.totalInteractions) * 100) : 0
        };
    }

    /**
     * Reset statistics
     */
    resetStatistics() {
        this.stats = {
            totalInteractions: 0,
            buttonInteractions: 0,
            selectMenuInteractions: 0,
            modalInteractions: 0,
            errors: 0,
            startTime: Date.now()
        };
        console.log('[InteractionManager] Statistics reset');
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealthStatus() {
        const stats = this.getStatistics();

        return {
            status: stats.errorRate < 5 ? 'healthy' : stats.errorRate < 15 ? 'warning' : 'critical',
            errorRate: stats.errorRate,
            totalInteractions: stats.totalInteractions,
            uptime: stats.uptime.formatted,
            lastError: this.lastError || null
        };
    }

    // =============================================================================
    // UTILITY METHODS
    // =============================================================================

    /**
     * Check if interaction is from bot owner (future feature)
     * @param {Interaction} interaction - Discord interaction
     * @returns {boolean} Whether user is bot owner
     */
    isBotOwner(interaction) {
        // TODO: Implement bot owner check
        return false;
    }

    /**
     * Check if interaction is from admin (future feature)
     * @param {Interaction} interaction - Discord interaction
     * @returns {boolean} Whether user is admin
     */
    isAdmin(interaction) {
        // TODO: Implement admin check
        return interaction.member.permissions.has('Administrator');
    }

    /**
     * Get user permissions for interaction
     * @param {Interaction} interaction - Discord interaction
     * @returns {Array} Array of permission strings
     */
    getUserPermissions(interaction) {
        if (!interaction.member) return [];

        return interaction.member.permissions.toArray();
    }
}

// Create and export singleton instance
const interactionManager = new InteractionManager();

module.exports = interactionManager;
