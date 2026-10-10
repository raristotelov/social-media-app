// Error for expected/handled failures. Carries an HTTP status code, a
// machine-readable `code` (see config/errorCodes.js) and a developer-facing
// message that is never shown to users. The original error (if any) is
// preserved via `cause` for server-side logging, and is never sent to the client.
// `options.fields` optionally maps form field names to their own error code, so
// the client can show the error against the input that caused it.
// Only 4xx errors are operational (expected); a 5xx AppError is an unexpected
// failure and is hidden behind a generic response by the error handler.
class AppError extends Error {
	constructor(message, statusCode = 500, options = {}) {
		super(message, options); // options.cause is retained on this.cause
		this.name = 'AppError';
		this.statusCode = statusCode;
		this.code = options.code;
		this.fields = options.fields;
		this.isOperational = statusCode < 500;

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	static fromFields(fields, statusCode, options = {}) {
		const [firstCode] = Object.values(fields);
		const message = Object.entries(fields)
			.map(([field, code]) => `${field}: ${code}`)
			.join(', ');

		return new AppError(message, statusCode, { ...options, code: firstCode, fields });
	}
}

module.exports = AppError;
