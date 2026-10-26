const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');

const getPasswordRuleErrorCode = (password) => {
	if (typeof password !== 'string' || !password) {
		return ERROR_CODES.PASSWORD_REQUIRED;
	}

	if (password.length < constants.MIN_PASSWORD_LENGTH) {
		return ERROR_CODES.PASSWORD_TOO_SHORT;
	}

	if (Buffer.byteLength(password, 'utf8') > constants.MAX_PASSWORD_BYTES) {
		return ERROR_CODES.PASSWORD_TOO_LONG;
	}

	return null;
};

module.exports = { getPasswordRuleErrorCode };
