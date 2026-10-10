const AppError = require('../utils/AppError');
const { ERROR_CODES, INTERNAL_ERROR_MESSAGE, BAD_REQUEST_MESSAGE } = require('../config/errorCodes');

const MIN_CLIENT_ERROR_STATUS = 400;
const MAX_CLIENT_ERROR_STATUS = 499;

const isClientErrorStatus = (statusCode) => statusCode >= MIN_CLIENT_ERROR_STATUS && statusCode <= MAX_CLIENT_ERROR_STATUS;

const toExpectedErrorResponse = (err) => {
	if (err instanceof AppError && err.isOperational) {
		const body = { code: err.code || ERROR_CODES.BAD_REQUEST, message: err.message };

		if (err.fields) {
			body.fields = err.fields;
		}

		return { statusCode: err.statusCode, body };
	}

	if (!(err instanceof AppError) && err.expose === true && isClientErrorStatus(err.statusCode)) {
		return { statusCode: err.statusCode, body: { code: ERROR_CODES.BAD_REQUEST, message: BAD_REQUEST_MESSAGE } };
	}

	return null;
};

// Central error handler. Every error is logged in full (including the
// preserved `cause`). Expected errors (operational AppErrors, malformed
// requests) keep their status and code; anything else is answered with a
// generic 500, so no internal text ever reaches the client.
module.exports = (err, req, res, next) => {
	console.error(err);
	if (err.cause) {
		console.error('Caused by:', err.cause);
	}

	const expectedErrorResponse = toExpectedErrorResponse(err);

	if (expectedErrorResponse) {
		return res.status(expectedErrorResponse.statusCode).json(expectedErrorResponse.body);
	}

	return res.status(500).json({ code: ERROR_CODES.INTERNAL_ERROR, message: INTERNAL_ERROR_MESSAGE });
};
