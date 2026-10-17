const { VALIDATION_ERROR_CODES, DUPLICATE_KEY_ERROR_CODES } = require('../config/errorCodes');
const AppError = require('./AppError');

const asFieldError = (error) => {
	if (error.name === 'ValidationError') {
		const fields = {};

		for (const [path, pathError] of Object.entries(error.errors)) {
			const code = VALIDATION_ERROR_CODES[path]?.[pathError.kind];

			if (!code) {
				return null;
			}

			fields[path] = code;
		}

		return AppError.fromFields(fields, 400, { cause: error });
	}

	if (error.code === 11000) {
		const duplicatedField = Object.keys(error.keyPattern || {})[0];
		const code = DUPLICATE_KEY_ERROR_CODES[duplicatedField];

		if (!code) {
			return null;
		}

		return AppError.fromFields({ [duplicatedField]: code }, 409, { cause: error });
	}

	return null;
};

module.exports = { asFieldError };
