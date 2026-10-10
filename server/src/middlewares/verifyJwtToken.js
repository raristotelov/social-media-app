const JWT = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

module.exports = (req, res, next) => {
	const jwtToken = req.header('X-Authorization');

	if (!jwtToken) {
		return next(new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED }));
	}

	try {
		const user = JWT.verify(jwtToken, process.env.JWT_SECRET);

		res.userId = user.userId;

		next();
	} catch (error) {
		next(new AppError('Invalid or expired token', 401, { code: ERROR_CODES.UNAUTHENTICATED, cause: error }));
	}
};
