const { connectDB } = require('../../db');
const DatabaseService = require('../services/DatabaseService');
const audioManager = require('../core/AudioManager');
const { BOT_INFO } = require('../utils/Constants');

/**
 * Handle bot ready event
 */
module.exports = {
    name: 'clientReady',
    once: true,

    /**
     * Execute ready event handling
     * @param {Client} client - Discord client
     */
    async execute(client) {
        try {
            console.log(`✅ ${BOT_INFO.NAME} logged in as ${client.user.tag}`);
            console.log(`📊 Serving ${client.guilds.cache.size} guilds with ${client.users.cache.size} users`);

            // Connect to database
            await connectDB();
            console.log('✅ Database connected successfully');

            // Load database statistics
            const stats = await DatabaseService.getStatistics();
            console.log(`📚 Database loaded: ${stats.surahs} surahs, ${stats.reciters} reciters, ${stats.guilds} guilds`);

            // Set bot activity
            client.user.setActivity(`${BOT_INFO.NAME} v${BOT_INFO.VERSION}`, { type: 'LISTENING' });

            // Initialize 24/7 voice connections
            await this.initialize247Connections(client);

            console.log(`🎉 ${BOT_INFO.NAME} is fully ready and operational!`);

        } catch (error) {
            console.error('❌ Error during bot initialization:', error);
        }
    },

    /**
     * Initialize 24/7 voice connections for guilds that have it enabled
     * @param {Client} client - Discord client
     */
    async initialize247Connections(client) {
        try {
            console.log('🔄 Initializing 24/7 voice connections...');

            const guilds247 = await DatabaseService.get247Guilds();
            console.log(`📡 Found ${guilds247.length} guilds with 24/7 mode enabled`);

            let successCount = 0;
            let failCount = 0;

            for (const guildData of guilds247) {
                try {
                    const guild = client.guilds.cache.get(guildData.guildId);
                    if (!guild) {
                        console.warn(`⚠️ Guild ${guildData.guildId} not found in cache`);
                        failCount++;
                        continue;
                    }

                    const channel = guild.channels.cache.get(guildData.voiceChannelId);
                    if (!channel || channel.type !== 2) {
                        console.warn(`⚠️ Voice channel ${guildData.voiceChannelId} not found or invalid in guild ${guild.name}`);
                        failCount++;
                        continue;
                    }

                    // Check if there are human members in the channel
                    const humanMembers = channel.members.filter(member => !member.user.bot);
                    if (humanMembers.size === 0) {
                        console.log(`ℹ️ Skipping empty voice channel in guild ${guild.name}`);
                        continue;
                    }

                    // Join voice channel and start default stream
                    await audioManager.joinVoiceChannel(guildData.guildId, guildData.voiceChannelId, guild);

                    // Start default radio stream
                    const { RADIO_STATIONS } = require('../utils/Constants');
                    await audioManager.playRadio(guildData.guildId, RADIO_STATIONS.egypt.url, RADIO_STATIONS.egypt);

                    console.log(`✅ Successfully connected to voice channel in guild: ${guild.name}`);
                    successCount++;

                    // Add delay between connections to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    console.error(`❌ Failed to connect to guild ${guildData.guildId}:`, error);
                    failCount++;
                }
            }

            console.log(`📊 24/7 initialization complete: ${successCount} successful, ${failCount} failed`);

        } catch (error) {
            console.error('❌ Error initializing 24/7 connections:', error);
        }
    }
};
