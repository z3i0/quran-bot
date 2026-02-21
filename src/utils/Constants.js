/**
 * Constants and configuration for the Quran Bot
 */

module.exports = {
    // Colors for embeds
    COLORS: {
        SUCCESS: '#2ecc71',
        WARNING: '#f1c40f',
        DANGER: '#e74c3c',
        INFO: '#3498db',
        PAUSE: '#f39c12',
        PRIMARY: '#27ae60' // Refreshing Islamic Green
    },

    // Emojis used throughout the bot
    EMOJIS: {
        MOSQUE: '🕌',
        QURAN: '📖',
        RADIO: '📻',
        HELP: '❓',
        BACK: '🔙',
        PLAY: '▶️',
        PAUSE: '⏸️',
        STOP: '⏹️',
        VOLUME_UP: '🔊',
        VOLUME_DOWN: '🔉',
        INFO: 'ℹ️',
        SUCCESS: '✅',
        ERROR: '❌',
        WARNING: '⚠️',
        LOADING: '⏳',
        MUSIC: '🎵',
        SPEAKER: '🔈',
        SEARCH: '🔍'
    },

    // Radio stations configuration
    RADIO_STATIONS: {
        egypt: {
            name: 'إذاعة القرآن الكريم - مصر',
            flag: '🇪🇬',
            url: 'https://stream.radiojar.com/8s5u5tpdtwzuv',
            country: 'مصر'
        },
        saudi: {
            name: 'إذاعة القرآن الكريم - السعودية',
            flag: '🇸🇦',
            url: 'https://n0a.radiojar.com/0tpy88dtwzuv',
            country: 'السعودية'
        },
        uae: {
            name: 'إذاعة القرآن الكريم - أبوظبي',
            flag: '🇦🇪',
            url: 'https://media.adradio.ae/quran',
            country: 'الإمارات'
        }
    },

    // Audio configuration
    AUDIO_CONFIG: {
        CONNECTION_TIMEOUT: 10000,
        RETRY_DELAY: 5000,
        DEFAULT_VOLUME: 1.0,
        MAX_VOLUME: 2.0,
        MIN_VOLUME: 0.0,
        VOLUME_STEP: 0.1,
        FFMPEG_ARGS: [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-analyzeduration', '0',
            '-loglevel', 'error',
            '-c:a', 'libopus',
            '-f', 'opus',
            '-ar', '48000',
            '-ac', '2'
        ]
    },

    // Interaction types
    INTERACTION_TYPES: {
        BUTTON: 'button',
        SELECT_MENU: 'selectMenu',
        MODAL: 'modal',
        COMMAND: 'command'
    },

    // Audio player states
    PLAYER_STATES: {
        IDLE: 'idle',
        PLAYING: 'playing',
        PAUSED: 'paused',
        BUFFERING: 'buffering'
    },

    // Stream types
    STREAM_TYPES: {
        RADIO: 'radio',
        QURAN: 'quran'
    },

    // Messages
    MESSAGES: {
        ERRORS: {
            GENERIC: 'حدث خطأ غير متوقع',
            NO_VOICE_CHANNEL: 'يجب أن تكون في قناة صوتية',
            NO_AUDIO_PLAYING: 'لا يوجد صوت قيد التشغيل حالياً',
            AUDIO_LOAD_FAILED: 'فشل في تحميل الصوت',
            CONNECTION_FAILED: 'فشل في الاتصال بالقناة الصوتية',
            PERMISSION_DENIED: 'البوت لا يملك الصلاحيات المطلوبة'
        },
        SUCCESS: {
            AUDIO_STARTED: 'تم بدء تشغيل الصوت بنجاح',
            AUDIO_STOPPED: 'تم إيقاف الصوت بنجاح',
            AUDIO_PAUSED: 'تم إيقاف الصوت مؤقتاً',
            AUDIO_RESUMED: 'تم استئناف تشغيل الصوت',
            VOLUME_CHANGED: 'تم تغيير مستوى الصوت'
        },
        INFO: {
            LOADING: 'جاري التحميل...',
            CONNECTING: 'جاري الاتصال...',
            BUFFERING: 'جاري التخزين المؤقت...'
        }
    },

    // Pagination settings
    PAGINATION: {
        SURAHS_PER_MENU: 25,
        MAX_SURAHS_DISPLAY: 75
    },

    // Bot information
    BOT_INFO: {
        NAME: 'البوت الإسلامي',
        DESCRIPTION: 'بوت القرآن الكريم والإذاعات الإسلامية',
        FOOTER: 'البوت الإسلامي - خدمة القرآن الكريم',
        VERSION: '2.0.0'
    }
};
