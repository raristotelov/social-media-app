jest.mock('jsonwebtoken');

const JWT = require('jsonwebtoken');

const verifyJwtToken = require('./verifyJwtToken');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');
const constants = require('../config/constants');
const { clearAuthCookie } = require('../utils/authCookie');

const buildRequest = (token) => ({
	cookies: token === undefined ? {} : { [constants.AUTH_COOKIE_NAME]: token },
	header: jest.fn().mockReturnValue('header.jwt.token'),
});

describe('verifyJwtToken', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	it('rejects a request without a token cookie with a 401 UNAUTHENTICATED', () => {
		const next = jest.fn();

		verifyJwtToken(buildRequest(undefined), {}, next);

		const error = next.mock.calls[0][0];

		expect(error).toBeInstanceOf(AppError);
		expect(error.statusCode).toBe(401);
		expect(error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		expect(JWT.verify).not.toHaveBeenCalled();
	});

	it('rejects a request when cookie parsing produced no cookies object', () => {
		const next = jest.fn();

		verifyJwtToken({}, {}, next);

		const error = next.mock.calls[0][0];

		expect(error.statusCode).toBe(401);
		expect(error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
	});

	it('rejects an invalid or expired token with a 401 UNAUTHENTICATED and keeps the cause', () => {
		const verifyError = new Error('jwt expired');
		const next = jest.fn();

		JWT.verify.mockImplementation(() => {
			throw verifyError;
		});

		verifyJwtToken(buildRequest('expired.jwt.token'), { clearCookie: jest.fn() }, next);

		const error = next.mock.calls[0][0];

		expect(error).toBeInstanceOf(AppError);
		expect(error.statusCode).toBe(401);
		expect(error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		expect(error.cause).toBe(verifyError);
	});

	describe('when the cookie is present but rejected', () => {
		const rejectToken = () =>
			JWT.verify.mockImplementation(() => {
				throw new Error('jwt expired');
			});

		it('clears the session cookie with the same attributes the logout clears it with', () => {
			const res = { clearCookie: jest.fn() };
			const logoutRes = { clearCookie: jest.fn() };

			rejectToken();
			clearAuthCookie(logoutRes);

			verifyJwtToken(buildRequest('expired.jwt.token'), res, jest.fn());

			expect(res.clearCookie).toHaveBeenCalledTimes(1);
			expect(res.clearCookie.mock.calls[0]).toEqual(logoutRes.clearCookie.mock.calls[0]);
			expect(res.clearCookie.mock.calls[0][0]).toBe(constants.AUTH_COOKIE_NAME);
		});

		it('clears the cookie before passing the 401 on', () => {
			const callOrder = [];
			const res = { clearCookie: jest.fn(() => callOrder.push('clear')) };
			const next = jest.fn(() => callOrder.push('next'));

			rejectToken();

			verifyJwtToken(buildRequest('expired.jwt.token'), res, next);

			expect(callOrder).toEqual(['clear', 'next']);
		});
	});

	it('does not touch any cookie when there is no cookie to reject', () => {
		const res = { clearCookie: jest.fn() };

		verifyJwtToken(buildRequest(undefined), res, jest.fn());

		expect(res.clearCookie).not.toHaveBeenCalled();
	});

	it('does not clear the cookie for a valid token', () => {
		const res = { clearCookie: jest.fn() };

		JWT.verify.mockReturnValue({ userId: 'user1' });

		verifyJwtToken(buildRequest('valid.jwt.token'), res, jest.fn());

		expect(res.clearCookie).not.toHaveBeenCalled();
	});

	it('reads the token from the session cookie', () => {
		JWT.verify.mockReturnValue({ userId: 'user1' });

		verifyJwtToken(buildRequest('valid.jwt.token'), {}, jest.fn());

		expect(JWT.verify).toHaveBeenCalledWith('valid.jwt.token', process.env.JWT_SECRET);
	});

	it('ignores the old X-Authorization header', () => {
		const req = buildRequest(undefined);
		const next = jest.fn();

		verifyJwtToken(req, {}, next);

		expect(req.header).not.toHaveBeenCalled();
		expect(JWT.verify).not.toHaveBeenCalled();
		expect(next.mock.calls[0][0].statusCode).toBe(401);
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
