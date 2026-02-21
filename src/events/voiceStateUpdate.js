const audioManager = require('../core/AudioManager');

/**
 * Handle voice state updates through the unified AudioManager
 */
module.exports = {
    name: 'voiceStateUpdate',
    
    /**
     * Execute voice state update handling
     * @param {VoiceState} oldState - Old voice state
     * @param {VoiceState} newState - New voice state
     */
    async execute(oldState, newState) {
        try {
            // Delegate all voice state handling to the AudioManager
            await audioManager.handleVoiceStateUpdate(oldState, newState);
        } catch (error) {
            console.error('[VoiceStateUpdate Event] Error handling voice state update:', error);
        }
    }
};
