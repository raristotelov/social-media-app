jest.mock('jsonwebtoken');

const JWT = require('jsonwebtoken');

const verifyJwtToken = require('./verifyJwtToken');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const buildRequest = (token) => ({ header: jest.fn().mockReturnValue(token) });

describe('verifyJwtToken', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	it('rejects a request without a token with a 401 UNAUTHENTICATED', () => {
		const next = jest.fn();

		verifyJwtToken(buildRequest(undefined), {}, next);

		const error = next.mock.calls[0][0];

		expect(error).toBeInstanceOf(AppError);
		expect(error.statusCode).toBe(401);
		expect(error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		expect(JWT.verify).not.toHaveBeenCalled();
	});

	it('rejects an invalid or expired token with a 401 UNAUTHENTICATED and keeps the cause', () => {
		const verifyError = new Error('jwt expired');
		const next = jest.fn();

		JWT.verify.mockImplementation(() => {
			throw verifyError;
		});

		verifyJwtToken(buildRequest('expired.jwt.token'), {}, next);

		const error = next.mock.calls[0][0];

		expect(error).toBeInstanceOf(AppError);
		expect(error.statusCode).toBe(401);
		expect(error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		expect(error.cause).toBe(verifyError);
	});

	it('reads the token from the X-Authorization header', () => {
		const req = buildRequest('valid.jwt.token');

		JWT.verify.mockReturnValue({ userId: 'user1' });

		verifyJwtToken(req, {}, jest.fn());

		expect(req.header).toHaveBeenCalledWith('X-Authorization');
		expect(JWT.verify).toHaveBeenCalledWith('valid.jwt.token', process.env.JWT_SECRET);
	});

	it('stores the user id on the response and continues without an error for a valid token', () => {
		const res = {};
		const next = jest.fn();

		JWT.verify.mockReturnValue({ userId: 'user1' });

		verifyJwtToken(buildRequest('valid.jwt.token'), res, next);

		expect(res.userId).toBe('user1');
		expect(next).toHaveBeenCalledWith();
	});
});
