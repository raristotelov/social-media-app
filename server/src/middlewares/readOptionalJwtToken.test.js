jest.mock('jsonwebtoken');

const JWT = require('jsonwebtoken');

const readOptionalJwtToken = require('./readOptionalJwtToken');
const constants = require('../config/constants');
const { clearAuthCookie } = require('../utils/authCookie');

const buildRequest = (token) => ({
	cookies: token === undefined ? {} : { [constants.AUTH_COOKIE_NAME]: token },
	header: jest.fn().mockReturnValue('header.jwt.token'),
});

describe('readOptionalJwtToken', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	it('reads the token from the session cookie', () => {
		JWT.verify.mockReturnValue({ userId: 'user1' });

		readOptionalJwtToken(buildRequest('valid.jwt.token'), {}, jest.fn());

		expect(JWT.verify).toHaveBeenCalledWith('valid.jwt.token', process.env.JWT_SECRET);
	});

	it('stores the user id on the response and continues without an error for a valid token', () => {
		const res = {};
		const next = jest.fn();

		JWT.verify.mockReturnValue({ userId: 'user1' });

		readOptionalJwtToken(buildRequest('valid.jwt.token'), res, next);

		expect(res.userId).toBe('user1');
		expect(next).toHaveBeenCalledWith();
	});

	it('treats a request without a token as a guest and continues without an error', () => {
		const res = {};
		const next = jest.fn();

		readOptionalJwtToken(buildRequest(undefined), res, next);

		expect(res.userId).toBeUndefined();
		expect(JWT.verify).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledWith();
	});

	it('treats a request with no cookies object as a guest', () => {
		const res = {};
		const next = jest.fn();

		readOptionalJwtToken({}, res, next);

		expect(res.userId).toBeUndefined();
		expect(next).toHaveBeenCalledWith();
	});

	it('ignores the old X-Authorization header', () => {
		const req = buildRequest(undefined);
		const res = {};

		readOptionalJwtToken(req, res, jest.fn());

		expect(req.header).not.toHaveBeenCalled();
		expect(JWT.verify).not.toHaveBeenCalled();
		expect(res.userId).toBeUndefined();
	});

	it('clears the session cookie with the same attributes the logout clears it with when it ignores a bad cookie', () => {
		const res = { clearCookie: jest.fn() };
		const logoutRes = { clearCookie: jest.fn() };

		JWT.verify.mockImplementation(() => {
			throw new Error('jwt malformed');
		});
		clearAuthCookie(logoutRes);

		readOptionalJwtToken(buildRequest('bad.jwt.token'), res, jest.fn());

		expect(res.clearCookie).toHaveBeenCalledTimes(1);
		expect(res.clearCookie.mock.calls[0]).toEqual(logoutRes.clearCookie.mock.calls[0]);
		expect(res.clearCookie.mock.calls[0][0]).toBe(constants.AUTH_COOKIE_NAME);
	});

	it('does not clear the cookie when there is none', () => {
		const res = { clearCookie: jest.fn() };

		readOptionalJwtToken(buildRequest(undefined), res, jest.fn());

		expect(res.clearCookie).not.toHaveBeenCalled();
	});

	it('does not clear the cookie for a valid token', () => {
		const res = { clearCookie: jest.fn() };

		JWT.verify.mockReturnValue({ userId: 'user1' });

		readOptionalJwtToken(buildRequest('valid.jwt.token'), res, jest.fn());

		expect(res.clearCookie).not.toHaveBeenCalled();
	});

	it('treats an invalid or expired token as a guest and continues without an error', () => {
		const res = { clearCookie: jest.fn() };
		const next = jest.fn();

		JWT.verify.mockImplementation(() => {
			throw new Error('jwt expired');
		});

		readOptionalJwtToken(buildRequest('expired.jwt.token'), res, next);

		expect(res.userId).toBeUndefined();
		expect(next).toHaveBeenCalledWith();
	});
});
