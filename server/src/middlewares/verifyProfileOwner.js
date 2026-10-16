const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

module.exports = (req, res, next) => {
	if (String(res.userId) !== req.params.userId) {
		return next(new AppError('You can only change your own profile', 403, { code: ERROR_CODES.PROFILE_FORBIDDEN }));
	}

	next();
};
