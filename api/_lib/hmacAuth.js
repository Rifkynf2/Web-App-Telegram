const crypto = require('crypto');

/**
 * HMAC-SHA256 Authentication for Bot Tenant → API Gateway
 *
 * Protocol:
 *   Bot signs: HMAC-SHA256(timestamp + "." + botId + "." + body, INTERNAL_API_SECRET)
 *   Headers:
 *     X-Bot-Id:    <bot_id>
 *     X-Timestamp: <unix_ms>
 *     X-Signature: <hex_signature>
 *
 * Security features:
 *   - Replay attack protection (5 minute window)
 *   - Timing-safe comparison
 *   - Shared secret between API and all bots
 *   - botId is part of the signed payload, so a request signed by one
 *     tenant's bot can't be replayed with a different X-Bot-Id to
 *     impersonate another tenant (the shared secret alone used to be
 *     enough to do this, since only timestamp+body were signed before)
 *
 * TEMPORARY ROLLOUT NOTE: also accepts the legacy pre-fix payload
 * (timestamp + "." + body, no botId) so bot instances still running the
 * old signer keep working during the deploy window. Remove the legacy
 * candidate below once every tenant bot has deployed the updated signer
 * in RNFBOT TELE's masterDbService.js (_signRequest).
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

    // botId-bound payload (current signer) tried first; legacy payload
    // (no botId — see rollout note above) accepted as a fallback only.
    const candidatePayloads = [
        `${timestamp}.${botId}.${body}`,
        `${timestamp}.${body}`,
    ];

    let sigBuf;
    try {
        sigBuf = Buffer.from(signature, 'hex');
    } catch (err) {
        return { valid: false, error: 'Invalid signature format' };
    }

    const signatureIsValid = candidatePayloads.some((payload) => {
        const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        const expBuf = Buffer.from(expected, 'hex');
        return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    });

    if (!signatureIsValid) {
        return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true, botId };
}

module.exports = { verifyHMAC };
