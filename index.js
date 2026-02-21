const { Client, GatewayIntentBits } = require('discord.js');
const { REST, Routes } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Import the new unified systems
const interactionManager = require('./src/core/InteractionManager');
const audioManager = require('./src/core/AudioManager');
const { BOT_INFO } = require('./src/utils/Constants');

// Load database models
require('./models/Guild');
require('./models/User');
require('./models/Bookmark');
require('./models/Surah');
require('./models/Reciter');
require('./models/ReciterSurahLink');

// Environment variables
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('❌ Missing required environment variables: TOKEN and CLIENT_ID');
    process.exit(1);
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// Initialize commands collection
client.commands = new Map();

// =============================================================================
// COMMAND LOADING
// =============================================================================

/**
 * Load all command files
 */
function loadCommands() {
    const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

    console.log(`📂 Loading ${commandFiles.length} command(s)...`);

    for (const file of commandFiles) {
        try {
            const command = require(`./commands/${file}`);
            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
                console.log(`✅ Loaded command: ${command.data.name}`);
            } else {
                console.warn(`⚠️ Command ${file} is missing required properties`);
            }
        } catch (error) {
            console.error(`❌ Error loading command ${file}:`, error);
        }
    }
}

/**
 * Register slash commands with Discord
 */
async function registerSlashCommands() {
    const commands = [];

    for (const command of client.commands.values()) {
        commands.push(command.data.toJSON());
    }

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('🔄 Registering slash commands...');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        console.log(`✅ Successfully registered ${commands.length} slash command(s)`);
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
        throw error;
    }
}

// =============================================================================
// EVENT LOADING
// =============================================================================

/**
 * Load all event files
 */
function loadEvents() {
    const eventFiles = fs.readdirSync('./src/events').filter(file => file.endsWith('.js'));

    console.log(`📂 Loading ${eventFiles.length} event(s)...`);

    for (const file of eventFiles) {
        try {
            const event = require(`./src/events/${file}`);

            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                client.on(event.name, (...args) => event.execute(...args));
            }

            console.log(`✅ Loaded event: ${event.name}`);
        } catch (error) {
            console.error(`❌ Error loading event ${file}:`, error);
        }
    }
}

// =============================================================================
// LEGACY INTERACTION HANDLING (for compatibility)
// =============================================================================

/**
 * Handle interactions through the new unified system
 */
// Interactions are handled by src/events/interactionCreate.js through the event loader below.

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    // Don't exit the process, just log the error
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

/**
 * Handle process termination signals
 */
process.on('SIGTERM', async () => {
    console.log('📴 Received SIGTERM, shutting down gracefully...');
    await shutdown();
});

process.on('SIGINT', async () => {
    console.log('📴 Received SIGINT, shutting down gracefully...');
    await shutdown();
});

/**
 * Graceful shutdown function
 */
async function shutdown() {
    try {
        console.log('🔄 Starting graceful shutdown...');

        // Shutdown audio manager
        await audioManager.shutdown();

        // Destroy Discord client
        client.destroy();

        console.log('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the bot
 */
async function initialize() {
    try {
        console.log(`🚀 Starting ${BOT_INFO.NAME} v${BOT_INFO.VERSION}...`);

        // Load commands and events
        loadCommands();
        loadEvents();

        // Register slash commands
        await registerSlashCommands();

        // Login to Discord
        await client.login(TOKEN);

    } catch (error) {
        console.error('💥 Failed to initialize bot:', error);
        process.exit(1);
    }
}

// Start the bot
initialize();

// Export client for potential external use
module.exports = client;
