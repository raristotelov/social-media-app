const errorHandler = require('./errorHandler');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const INTERNAL_BODY = { code: ERROR_CODES.INTERNAL_ERROR, message: 'Something went wrong' };

const buildResponse = () => {
	const res = {};

	res.status = jest.fn().mockReturnValue(res);
	res.json = jest.fn().mockReturnValue(res);

	return res;
};

const handle = (err) => {
	const res = buildResponse();

	errorHandler(err, {}, res, jest.fn());

	return res;
};

describe('errorHandler', () => {
	let consoleErrorSpy;

	beforeEach(() => {
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('expected errors', () => {
		it('answers with the real status and the error code', () => {
			const res = handle(new AppError('Wrong email or password', 401, { code: ERROR_CODES.WRONG_CREDENTIALS }));

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ code: ERROR_CODES.WRONG_CREDENTIALS, message: 'Wrong email or password' });
		});

		it('includes the fields when the error has them', () => {
			const res = handle(AppError.fromFields({ username: ERROR_CODES.USERNAME_TAKEN }, 409));

			expect(res.status).toHaveBeenCalledWith(409);
			expect(res.json).toHaveBeenCalledWith({
				code: ERROR_CODES.USERNAME_TAKEN,
				message: 'username: USERNAME_TAKEN',
				fields: { username: ERROR_CODES.USERNAME_TAKEN },
			});
		});

		it('omits fields when the error has none', () => {
			const res = handle(new AppError('Post not found', 404, { code: ERROR_CODES.POST_NOT_FOUND }));

			expect(res.json.mock.calls[0][0]).not.toHaveProperty('fields');
		});

		it('falls back to BAD_REQUEST when an expected error has no code', () => {
			const res = handle(new AppError('Nope', 400));

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ code: ERROR_CODES.BAD_REQUEST, message: 'Nope' });
		});

		it('answers a non-AppError 4xx that is safe to expose (e.g. malformed JSON body) with BAD_REQUEST', () => {
			const parseError = Object.assign(new SyntaxError('Unexpected token } in JSON'), { statusCode: 400, expose: true });
			const res = handle(parseError);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ code: ERROR_CODES.BAD_REQUEST, message: 'Bad request' });
		});

		it('does not leak the internal text of an exposed non-AppError 4xx', () => {
			const parseError = Object.assign(new SyntaxError('Unexpected token } in JSON'), { statusCode: 400, expose: true });
			const res = handle(parseError);

			expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('Unexpected token');
		});
	});

	describe('unexpected errors', () => {
		it('answers an unknown error with the generic 500', () => {
			const res = handle(new Error('E11000 duplicate key error collection: users'));

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
		});

		it('answers a 500 AppError with the generic 500 and none of its internal text', () => {
			const res = handle(new AppError('Could not sign up', 500, { cause: new Error('connection lost') }));

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
		});

		it('answers a 502 AppError with the generic 500, not a 502', () => {
			const res = handle(new AppError('Could not delete image abc123', 502));

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
		});

		it('ignores the code and fields of a 5xx AppError', () => {
			const res = handle(new AppError('boom', 503, { code: ERROR_CODES.USERNAME_TAKEN, fields: { username: ERROR_CODES.USERNAME_TAKEN } }));

			expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
		});

		it('answers a non-AppError 4xx that is not safe to expose with the generic 500', () => {
			const res = handle(Object.assign(new Error('internal detail'), { statusCode: 400, expose: false }));

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
		});

		it('answers a non-AppError 5xx marked as exposable with the generic 500', () => {
			const res = handle(Object.assign(new Error('internal detail'), { statusCode: 503, expose: true }));

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
		});
	});

	describe('logging', () => {
		it('logs an unexpected error', () => {
			const err = new Error('boom');

			handle(err);

			expect(consoleErrorSpy).toHaveBeenCalledWith(err);
		});

		it('logs an expected 4xx error too', () => {
			const err = new AppError('Wrong email or password', 401, { code: ERROR_CODES.WRONG_CREDENTIALS });

			handle(err);

			expect(consoleErrorSpy).toHaveBeenCalledWith(err);
		});

		it('logs the preserved cause', () => {
			const cause = new Error('connection lost');
			const err = new AppError('Could not sign up', 500, { cause });

			handle(err);

			expect(consoleErrorSpy).toHaveBeenCalledWith('Caused by:', cause);
		});

		it('does not log a cause line when there is none', () => {
			handle(new AppError('Post not found', 404, { code: ERROR_CODES.POST_NOT_FOUND }));

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});
	});
});
