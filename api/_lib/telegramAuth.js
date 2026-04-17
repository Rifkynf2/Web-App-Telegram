const crypto = require('crypto');
const { getMasterSupabase } = require('./masterSupabase');

/**
 * Telegram WebApp initData Validator
 * 
 * Validates data according to:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * 
 * Since master doesn't have its own bot, we lookup the bot_token
 * from the tenants table based on bot_id in the request.
 */

// In-memory cache for bot tokens (avoid DB hit on every request)
const tokenCache = new Map();
const TOKEN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get bot token from master DB (with cache)
 * @param {string|number} botId 
 * @returns {Promise<string|null>}
 */
async function getBotToken(botId) {
    const cacheKey = `token_${botId}`;
    const cached = tokenCache.get(cacheKey);
    
    if (cached && Date.now() < cached.expiry) {
        return cached.token;
    }

    try {
        const masterDb = getMasterSupabase();
        const { data, error } = await masterDb
            .from('tenants')
            .select('bot_token')
            .eq('bot_id', botId)
            .single();

        if (error || !data?.bot_token) {
            console.error(`[TelegramAuth] Bot token not found for bot_id: ${botId}`);
            return null;
        }

        // Cache the token
        tokenCache.set(cacheKey, {
            token: data.bot_token,
            expiry: Date.now() + TOKEN_CACHE_TTL
        });

        return data.bot_token;
    } catch (err) {
        console.error('[TelegramAuth] DB error:', err.message);
        return null;
    }
}

/**
 * Validate Telegram WebApp initData
 * @param {string} initData - Raw initData string from Telegram WebApp
 * @param {string|number} botId - Bot ID to lookup the correct token
 * @returns {Promise<{ valid: boolean, user?: object, error?: string }>}
 */
async function validateTelegramInitData(initData, botId) {
    if (!initData || !botId) {
        return { valid: false, error: 'initData and botId are required' };
    }

    // 1. Get the correct bot token for this tenant
    const botToken = await getBotToken(botId);
    if (!botToken) {
        return { valid: false, error: 'Bot token not found for this tenant' };
    }

    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) {
            return { valid: false, error: 'No hash in initData' };
        }

        // 2. Build data-check-string (sorted, without hash)
        params.delete('hash');
        const dataCheckString = [...params.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

        // 3. HMAC-SHA256 validation per Telegram docs
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();

        const computedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        if (computedHash !== hash) {
            return { valid: false, error: 'Invalid hash — initData tampered' };
        }

        // 4. Check auth_date freshness (max 24 hours for web app sessions)
        const authDate = parseInt(params.get('auth_date') || '0');
        const age = Date.now() / 1000 - authDate;
        if (age > 86400) { // 24 hours
            return { valid: false, error: 'initData expired (older than 24h)' };
        }

        // 5. Parse user data
        const userStr = params.get('user');
        const user = userStr ? JSON.parse(userStr) : undefined;

        return { valid: true, user };
    } catch (err) {
        return { valid: false, error: `Validation error: ${err.message}` };
    }
}

/**
 * Clear cached bot token (e.g. after token rotation)
 * @param {string|number} botId 
 */
function clearTokenCache(botId) {
    tokenCache.delete(`token_${botId}`);
}

module.exports = { validateTelegramInitData, clearTokenCache };
