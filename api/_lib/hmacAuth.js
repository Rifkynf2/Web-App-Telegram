const crypto = require('crypto');

/**
 * HMAC-SHA256 Authentication for Bot Tenant → API Gateway
 * 
 * Protocol:
 *   Bot signs: HMAC-SHA256(timestamp + "." + body, INTERNAL_API_SECRET)
 *   Headers:
 *     X-Bot-Id:    <bot_id>
 *     X-Timestamp: <unix_ms>
 *     X-Signature: <hex_signature>
 * 
 * Security features:
 *   - Replay attack protection (5 minute window)
 *   - Timing-safe comparison
 *   - Shared secret between API and all bots
 */

/**
 * Verify HMAC signature from tenant bot request
 * @param {object} headers - Request headers (lowercased keys)
 * @param {string} body - Raw request body as string
 * @returns {{ valid: boolean, botId?: string, error?: string }}
 */
function verifyHMAC(headers, body) {
    const botId = headers['x-bot-id'];
    const timestamp = headers['x-timestamp'];
    const signature = headers['x-signature'];
    const secret = process.env.INTERNAL_API_SECRET;

    if (!secret) {
        return { valid: false, error: 'Server misconfigured: missing INTERNAL_API_SECRET' };
    }

    if (!botId || !timestamp || !signature) {
        return { valid: false, error: 'Missing required auth headers: X-Bot-Id, X-Timestamp, X-Signature' };
    }

    // Prevent replay attacks (5 minute window)
    const now = Date.now();
    const ts = parseInt(timestamp);
    if (isNaN(ts) || Math.abs(now - ts) > 5 * 60 * 1000) {
        return { valid: false, error: 'Request expired or invalid timestamp' };
    }

    // Compute expected signature
    const payload = `${timestamp}.${body}`;
    const expected = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
        const sigBuf = Buffer.from(signature, 'hex');
        const expBuf = Buffer.from(expected, 'hex');
        
        if (sigBuf.length !== expBuf.length) {
            return { valid: false, error: 'Invalid signature' };
        }

        const isValid = crypto.timingSafeEqual(sigBuf, expBuf);
        if (!isValid) {
            return { valid: false, error: 'Invalid signature' };
        }
    } catch (err) {
        return { valid: false, error: 'Invalid signature format' };
    }

    return { valid: true, botId };
}

module.exports = { verifyHMAC };
