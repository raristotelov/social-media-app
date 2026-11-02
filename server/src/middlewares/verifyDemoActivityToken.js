const crypto = require('node:crypto');

const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const BEARER_PREFIX = 'Bearer ';

const tokensMatch = (provided, expected) => {
	const providedBuffer = Buffer.from(provided);
	const expectedBuffer = Buffer.from(expected);

	return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

module.exports = (req, res, next) => {
	const expectedToken = process.env.DEMO_ACTIVITY_TOKEN;

	if (!expectedToken) {
		return next(new AppError('Not found', 404));
	}

	const header = req.header('Authorization') || '';
	const providedToken = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : '';

	if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
		return next(new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED }));
	}

	next();
};
