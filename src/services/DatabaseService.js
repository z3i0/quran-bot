const Reciter = require('../../models/Reciter');
const ReciterSurahLink = require('../../models/ReciterSurahLink');
const Surah = require('../../models/Surah');
const Guild = require('../../models/Guild');
const User = require('../../models/User');
const Bookmark = require('../../models/Bookmark');
const { getCountryName } = require('../../countryMapper');

/**
 * Database service for handling all database operations
 */
class DatabaseService {
    static cache = {
        surahs: null,
        reciters: null,
        lastFetch: {
            surahs: 0,
            reciters: 0
        },
        TTL: 1000 * 60 * 60 // 1 hour
    };
    /**
     * Get all surahs ordered by number
     * @returns {Promise<Array>} Array of surah objects
     */
    static async getAllSurahs() {
        try {
            const now = Date.now();
            if (this.cache.surahs && (now - this.cache.lastFetch.surahs < this.cache.TTL)) {
                return this.cache.surahs;
            }

            const surahs = await Surah.findAll({
                order: [['number', 'ASC']]
            });

            this.cache.surahs = surahs;
            this.cache.lastFetch.surahs = now;
            return surahs;
        } catch (error) {
            console.error('[DatabaseService] Error fetching surahs:', error);
            throw new Error('فشل في تحميل السور');
        }
    }

    /**
     * Get surah by number
     * @param {number} surahNumber - Surah number
     * @returns {Promise<Object|null>} Surah object or null
     */
    static async getSurahByNumber(surahNumber) {
        try {
            return await Surah.findOne({
                where: { number: surahNumber }
            });
        } catch (error) {
            console.error(`[DatabaseService] Error fetching surah ${surahNumber}:`, error);
            throw new Error('فشل في تحميل السورة');
        }
    }

    /**
     * Get all reciters ordered by name
     * @returns {Promise<Array>} Array of reciter objects
     */
    static async getAllReciters() {
        try {
            const now = Date.now();
            if (this.cache.reciters && (now - this.cache.lastFetch.reciters < this.cache.TTL)) {
                return this.cache.reciters;
            }

            const reciters = await Reciter.findAll({
                order: [['name', 'ASC']]
            });

            this.cache.reciters = reciters;
            this.cache.lastFetch.reciters = now;
            return reciters;
        } catch (error) {
            console.error('[DatabaseService] Error fetching reciters:', error);
            throw new Error('فشل في تحميل القراء');
        }
    }

    /**
     * Get reciter by ID
     * @param {number} reciterId - Reciter ID
     * @returns {Promise<Object|null>} Reciter object or null
     */
    static async getReciterById(reciterId) {
        try {
            return await Reciter.findByPk(reciterId);
        } catch (error) {
            console.error(`[DatabaseService] Error fetching reciter ${reciterId}:`, error);
            throw new Error('فشل في تحميل القارئ');
        }
    }

    /**
     * Get reciters available for a specific surah
     * @param {number} surahNumber - Surah number
     * @returns {Promise<Array>} Array of reciter objects
     */
    static async getRecitersForSurah(surahNumber) {
        try {
            const links = await ReciterSurahLink.findAll({
                where: { surah_id: surahNumber },
                include: [{
                    model: Reciter,
                    as: 'reciter'
                }]
            });

            return links.map(link => link.reciter).filter(Boolean);
        } catch (error) {
            console.error(`[DatabaseService] Error fetching reciters for surah ${surahNumber}:`, error);
            throw new Error('فشل في تحميل القراء للسورة');
        }
    }

    /**
     * Get audio link for specific reciter and surah
     * @param {number} reciterId - Reciter ID
     * @param {number} surahNumber - Surah number
     * @returns {Promise<Object|null>} ReciterSurahLink object or null
     */
    static async getAudioLink(reciterId, surahNumber) {
        try {
            return await ReciterSurahLink.findOne({
                where: {
                    reciter_id: reciterId,
                    surah_id: surahNumber
                }
            });
        } catch (error) {
            console.error(`[DatabaseService] Error fetching audio link for reciter ${reciterId}, surah ${surahNumber}:`, error);
            throw new Error('فشل في تحميل رابط الصوت');
        }
    }

    /**
     * Get complete audio information (surah + reciter + link)
     * @param {number} reciterId - Reciter ID
     * @param {number} surahNumber - Surah number
     * @returns {Promise<Object>} Complete audio information
     */
    static async getCompleteAudioInfo(reciterId, surahNumber) {
        try {
            const [reciter, surah, link] = await Promise.all([
                this.getReciterById(reciterId),
                this.getSurahByNumber(surahNumber),
                this.getAudioLink(reciterId, surahNumber)
            ]);

            if (!reciter || !surah || !link) {
                throw new Error('معلومات الصوت غير مكتملة');
            }

            return {
                reciter: {
                    ...reciter.toJSON(),
                    countryName: getCountryName(reciter.country)
                },
                surah: surah.toJSON(),
                audioUrl: link.audio_url,
                link: link.toJSON()
            };
        } catch (error) {
            console.error(`[DatabaseService] Error fetching complete audio info:`, error);
            throw new Error('فشل في تحميل معلومات الصوت');
        }
    }

    /**
     * Get guild settings
     * @param {string} guildId - Discord guild ID
     * @returns {Promise<Object|null>} Guild settings or null
     */
    static async getGuildSettings(guildId) {
        try {
            return await Guild.findOne({
                where: { guildId }
            });
        } catch (error) {
            console.error(`[DatabaseService] Error fetching guild settings for ${guildId}:`, error);
            return null;
        }
    }

    /**
     * Update guild settings
     * @param {string} guildId - Discord guild ID
     * @param {Object} settings - Settings to update
     * @returns {Promise<Object>} Updated guild settings
     */
    static async updateGuildSettings(guildId, settings) {
        try {
            const [guild, created] = await Guild.findOrCreate({
                where: { guildId },
                defaults: { guildId, ...settings }
            });

            if (!created) {
                await guild.update(settings);
            }

            return guild;
        } catch (error) {
            console.error(`[DatabaseService] Error updating guild settings for ${guildId}:`, error);
            throw new Error('فشل في تحديث إعدادات الخادم');
        }
    }

    /**
     * Get all guilds with 24/7 mode enabled
     * @returns {Promise<Array>} Array of guild objects
     */
    static async get247Guilds() {
        try {
            return await Guild.findAll({
                where: { voice24_7: true }
            });
        } catch (error) {
            console.error('[DatabaseService] Error fetching 24/7 guilds:', error);
            return [];
        }
    }

    /**
     * Get user settings
     * @param {string} userId - Discord user ID
     * @returns {Promise<Object|null>} User settings or null
     */
    static async getUserSettings(userId) {
        try {
            return await User.findOne({
                where: { userId }
            });
        } catch (error) {
            console.error(`[DatabaseService] Error fetching user settings for ${userId}:`, error);
            return null;
        }
    }

    /**
     * Update user settings
     * @param {string} userId - Discord user ID
     * @param {Object} settings - Settings to update
     * @returns {Promise<Object>} Updated user settings
     */
    static async updateUserSettings(userId, settings) {
        try {
            const [user, created] = await User.findOrCreate({
                where: { userId },
                defaults: { userId, ...settings }
            });

            if (!created) {
                await user.update(settings);
            }

            return user;
        } catch (error) {
            console.error(`[DatabaseService] Error updating user settings for ${userId}:`, error);
            throw new Error('فشل في تحديث إعدادات المستخدم');
        }
    }

    /**
     * Get user bookmarks
     * @param {string} userId - Discord user ID
     * @returns {Promise<Array>} Array of bookmark objects
     */
    static async getUserBookmarks(userId) {
        try {
            return await Bookmark.findAll({
                where: { userId },
                include: [
                    { model: Surah, as: 'surah' },
                    { model: Reciter, as: 'reciter' }
                ],
                order: [['createdAt', 'DESC']]
            });
        } catch (error) {
            console.error(`[DatabaseService] Error fetching bookmarks for ${userId}:`, error);
            return [];
        }
    }

    /**
     * Add bookmark for user
     * @param {string} userId - Discord user ID
     * @param {number} surahId - Surah ID
     * @param {number} reciterId - Reciter ID
     * @returns {Promise<Object>} Created bookmark
     */
    static async addBookmark(userId, surahId, reciterId) {
        try {
            // Check if bookmark already exists
            const existing = await Bookmark.findOne({
                where: { userId, surahId, reciterId }
            });

            if (existing) {
                throw new Error('الإشارة المرجعية موجودة بالفعل');
            }

            return await Bookmark.create({
                userId,
                surahId,
                reciterId
            });
        } catch (error) {
            console.error(`[DatabaseService] Error adding bookmark:`, error);
            throw new Error('فشل في إضافة الإشارة المرجعية');
        }
    }

    /**
     * Remove bookmark for user
     * @param {string} userId - Discord user ID
     * @param {number} surahId - Surah ID
     * @param {number} reciterId - Reciter ID
     * @returns {Promise<boolean>} Success status
     */
    static async removeBookmark(userId, surahId, reciterId) {
        try {
            const deleted = await Bookmark.destroy({
                where: { userId, surahId, reciterId }
            });

            return deleted > 0;
        } catch (error) {
            console.error(`[DatabaseService] Error removing bookmark:`, error);
            throw new Error('فشل في حذف الإشارة المرجعية');
        }
    }

    /**
     * Get statistics
     * @returns {Promise<Object>} Database statistics
     */
    static async getStatistics() {
        try {
            const [surahCount, reciterCount, guildCount, userCount, bookmarkCount] = await Promise.all([
                Surah.count(),
                Reciter.count(),
                Guild.count(),
                User.count(),
                Bookmark.count()
            ]);

            return {
                surahs: surahCount,
                reciters: reciterCount,
                guilds: guildCount,
                users: userCount,
                bookmarks: bookmarkCount
            };
        } catch (error) {
            console.error('[DatabaseService] Error fetching statistics:', error);
            return {
                surahs: 0,
                reciters: 0,
                guilds: 0,
                users: 0,
                bookmarks: 0
            };
        }
    }

    /**
     * Search surahs by name
     * @param {string} query - Search query
     * @returns {Promise<Array>} Array of matching surahs
     */
    static async searchSurahs(query) {
        try {
            const { Op } = require('sequelize');
            return await Surah.findAll({
                where: {
                    [Op.or]: [
                        { name: { [Op.like]: `%${query}%` } },
                        { englishName: { [Op.like]: `%${query}%` } },
                        { englishNameTranslation: { [Op.like]: `%${query}%` } }
                    ]
                },
                order: [['number', 'ASC']]
            });
        } catch (error) {
            console.error(`[DatabaseService] Error searching surahs with query "${query}":`, error);
            return [];
        }
    }

    /**
     * Search reciters by name
     * @param {string} query - Search query
     * @returns {Promise<Array>} Array of matching reciters
     */
    static async searchReciters(query) {
        try {
            const { Op } = require('sequelize');
            return await Reciter.findAll({
                where: {
                    name: { [Op.like]: `%${query}%` }
                },
                order: [['name', 'ASC']]
            });
        } catch (error) {
            console.error(`[DatabaseService] Error searching reciters with query "${query}":`, error);
            return [];
        }
    }

    /**
     * Get country name helper (re-export from countryMapper)
     * @param {string} countryCode - Country code
     * @returns {string} Country name in Arabic
     */
    static getCountryName(countryCode) {
        return getCountryName(countryCode);
    }
}

module.exports = DatabaseService;
