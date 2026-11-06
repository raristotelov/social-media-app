const config = require('../config/config');
const constants = require('../config/constants');

const getAuthCookieOptions = () => ({
	httpOnly: true,
	sameSite: 'lax',
	secure: config.isProduction,
});

const setAuthCookie = (res, token) => {
	res.cookie(constants.AUTH_COOKIE_NAME, token, {
		...getAuthCookieOptions(),
		maxAge: constants.JWT_EXPIRY * constants.MS_PER_SECOND,
	});
};

const clearAuthCookie = (res) => {
	res.clearCookie(constants.AUTH_COOKIE_NAME, getAuthCookieOptions());
};

module.exports = { setAuthCookie, clearAuthCookie };
