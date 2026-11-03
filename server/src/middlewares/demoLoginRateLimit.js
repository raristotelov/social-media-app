const { rateLimit } = require('express-rate-limit');

const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');

module.exports = rateLimit({
	windowMs: constants.DEMO_LOGIN_RATE_LIMIT_WINDOW_MS,
	limit: constants.DEMO_LOGIN_RATE_LIMIT_MAX_REQUESTS,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	handler: (req, res, next) => next(new AppError('Too many demo accounts requested', 429, { code: ERROR_CODES.TOO_MANY_REQUESTS })),
});
