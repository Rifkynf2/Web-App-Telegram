/**
 * Standard API Response Helpers
 * Consistent format across all endpoints.
 */

function success(res, data = {}, statusCode = 200) {
    return res.status(statusCode).json({
        success: true,
        ...data
    });
}

function error(res, message, statusCode = 400) {
    return res.status(statusCode).json({
        success: false,
        error: message
    });
}

function unauthorized(res, message = 'Unauthorized') {
    return error(res, message, 401);
}

function forbidden(res, message = 'Forbidden') {
    return error(res, message, 403);
}

function notFound(res, message = 'Not found') {
    return error(res, message, 404);
}

function serverError(res, message = 'Internal server error') {
    return error(res, message, 500);
}

/**
 * Handle CORS preflight (OPTIONS) requests
 */
function handleCors(req, res) {
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }
    return false;
}

module.exports = { success, error, unauthorized, forbidden, notFound, serverError, handleCors };
