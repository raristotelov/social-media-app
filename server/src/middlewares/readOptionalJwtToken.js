const JWT = require('jsonwebtoken');
const constants = require('../config/constants');
const { clearAuthCookie } = require('../utils/authCookie');

module.exports = (req, res, next) => {
	const jwtToken = req.cookies?.[constants.AUTH_COOKIE_NAME];

	if (jwtToken) {
		try {
			res.userId = JWT.verify(jwtToken, process.env.JWT_SECRET).userId;
		} catch {
			res.userId = undefined;

			clearAuthCookie(res);
		}
	}

	next();
};
