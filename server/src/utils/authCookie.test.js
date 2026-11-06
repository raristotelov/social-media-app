const constants = require('../config/constants');

const loadAuthCookie = (nodeEnv) => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalClientOrigin = process.env.CLIENT_ORIGIN;

	process.env.NODE_ENV = nodeEnv;
	process.env.CLIENT_ORIGIN = 'https://sharesnap.app';

	try {
		let authCookie;

		jest.isolateModules(() => {
			authCookie = require('./authCookie');
		});

		return authCookie;
	} finally {
		process.env.NODE_ENV = originalNodeEnv;

		if (originalClientOrigin === undefined) {
			delete process.env.CLIENT_ORIGIN;
		} else {
			process.env.CLIENT_ORIGIN = originalClientOrigin;
		}
	}
};

const buildResponse = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });

describe('authCookie', () => {
	describe('setAuthCookie', () => {
		it('stores the token under the session cookie name', () => {
			const { setAuthCookie } = loadAuthCookie('development');
			const res = buildResponse();

			setAuthCookie(res, 'the.jwt.token');

			expect(res.cookie).toHaveBeenCalledWith(constants.AUTH_COOKIE_NAME, 'the.jwt.token', expect.any(Object));
		});

		it('makes the cookie httpOnly so scripts cannot read it', () => {
			const { setAuthCookie } = loadAuthCookie('development');
			const res = buildResponse();

			setAuthCookie(res, 'the.jwt.token');

			expect(res.cookie.mock.calls[0][2].httpOnly).toBe(true);
		});

		it('sets sameSite to lax', () => {
			const { setAuthCookie } = loadAuthCookie('development');
			const res = buildResponse();

			setAuthCookie(res, 'the.jwt.token');

			expect(res.cookie.mock.calls[0][2].sameSite).toBe('lax');
		});

		it('sets maxAge to the token lifetime in milliseconds', () => {
			const { setAuthCookie } = loadAuthCookie('development');
			const res = buildResponse();

			setAuthCookie(res, 'the.jwt.token');

			expect(res.cookie.mock.calls[0][2].maxAge).toBe(constants.JWT_EXPIRY * constants.MS_PER_SECOND);
		});

		it('is not secure outside production, so it works over plain http locally', () => {
			const { setAuthCookie } = loadAuthCookie('development');
			const res = buildResponse();

			setAuthCookie(res, 'the.jwt.token');

			expect(res.cookie.mock.calls[0][2].secure).toBe(false);
		});

		it('is secure in production', () => {
			const { setAuthCookie } = loadAuthCookie('production');
			const res = buildResponse();

			setAuthCookie(res, 'the.jwt.token');

			expect(res.cookie.mock.calls[0][2].secure).toBe(true);
		});
	});

	describe('clearAuthCookie', () => {
		it('clears the session cookie by name', () => {
			const { clearAuthCookie } = loadAuthCookie('development');
			const res = buildResponse();

			clearAuthCookie(res);

			expect(res.clearCookie).toHaveBeenCalledWith(constants.AUTH_COOKIE_NAME, expect.any(Object));
		});

		it('clears with the same httpOnly, sameSite and secure attributes the cookie was set with, in development', () => {
			const { setAuthCookie, clearAuthCookie } = loadAuthCookie('development');
			const res = buildResponse();

			setAuthCookie(res, 'the.jwt.token');
			clearAuthCookie(res);

			const { maxAge, ...setOptions } = res.cookie.mock.calls[0][2];

			expect(maxAge).toBeDefined();
			expect(res.clearCookie.mock.calls[0][1]).toEqual(setOptions);
		});

		it('clears with the same httpOnly, sameSite and secure attributes the cookie was set with, in production', () => {
			const { setAuthCookie, clearAuthCookie } = loadAuthCookie('production');
			const res = buildResponse();

			setAuthCookie(res, 'the.jwt.token');
			clearAuthCookie(res);

			const { maxAge, ...setOptions } = res.cookie.mock.calls[0][2];

			expect(maxAge).toBeDefined();
			expect(res.clearCookie.mock.calls[0][1]).toEqual(setOptions);
			expect(res.clearCookie.mock.calls[0][1].secure).toBe(true);
		});
	});
});
