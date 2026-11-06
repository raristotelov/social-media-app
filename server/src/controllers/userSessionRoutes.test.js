jest.mock('../services', () => ({
	userService: {
		signUp: jest.fn(),
		login: jest.fn(),
		demoLogin: jest.fn(),
		getCurrentUser: jest.fn(),
		changePassword: jest.fn(),
		getUsersProfileDataByUserIds: jest.fn(),
		updateUserProfileData: jest.fn(),
		followUser: jest.fn(),
		unfollowUser: jest.fn(),
	},
	userPostService: {},
	commentService: {},
}));

const CLIENT_ORIGIN = 'https://sharesnap.test';

process.env.CLIENT_ORIGIN = CLIENT_ORIGIN;

const JWT = require('jsonwebtoken');

const { userService } = require('../services');
const app = require('../app');
const AppError = require('../utils/AppError');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');

const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const OTHER_USER_ID = '64b7f0a1c2d3e4f5a6b7c8d2';
const JWT_SECRET = 'user-session-routes-test-secret';
const CURRENT_USER = { _id: USER_ID, username: 'realuser', posts: [] };
const REFRESHED_TOKEN = 'refreshed.jwt.token';

describe('user session routes', () => {
	let server;
	let baseUrl;
	let originalJwtSecret;
	let issuedToken;
	let consoleSpies;

	const signToken = (options = {}, secret = JWT_SECRET) => JWT.sign({ userId: USER_ID, username: 'realuser' }, secret, options);

	const sessionCookie = (token) => ({ Cookie: `${constants.AUTH_COOKIE_NAME}=${token}` });

	const setCookieOf = (response) => response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${constants.AUTH_COOKIE_NAME}=`));

	const attributesOf = (cookie) => cookie.split('; ').slice(1);

	const tokenOf = (cookie) => cookie.split(';')[0].slice(constants.AUTH_COOKIE_NAME.length + 1);

	let nextIpSuffix = 1;

	const nextIp = () => {
		nextIpSuffix += 1;

		return `203.0.113.${nextIpSuffix}`;
	};

	const postJson = (path, body = {}, headers = {}) =>
		fetch(`${baseUrl}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp(), ...headers },
			body: JSON.stringify(body),
		});

	const expectNoTokenInBody = async (response) => {
		const text = await response.text();

		expect(text).not.toContain(issuedToken);
		expect(text).not.toContain(REFRESHED_TOKEN);
		expect(text).not.toMatch(/"(jwt|token|jwtToken)"/);
	};

	const expectSessionCookieAttributes = (cookie) => {
		const attributes = attributesOf(cookie);

		expect(attributes).toContain('HttpOnly');
		expect(attributes).toContain('SameSite=Lax');
		expect(attributes).toContain(`Max-Age=${constants.JWT_EXPIRY}`);
		expect(attributes).toContain('Path=/');
		expect(attributes).not.toContain('Secure');
	};

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		server = await new Promise((resolve) => {
			const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
		});
		baseUrl = `http://127.0.0.1:${server.address().port}`;
	});

	afterAll(async () => {
		process.env.JWT_SECRET = originalJwtSecret;
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		jest.resetAllMocks();
		consoleSpies = ['error', 'warn', 'log', 'info'].map((method) => jest.spyOn(console, method).mockImplementation(() => {}));
		issuedToken = signToken();
		userService.signUp.mockResolvedValue({ user: CURRENT_USER, jwt: issuedToken });
		userService.login.mockResolvedValue({ user: CURRENT_USER, jwt: issuedToken });
		userService.demoLogin.mockResolvedValue({ user: CURRENT_USER, jwt: issuedToken });
		userService.getCurrentUser.mockResolvedValue(CURRENT_USER);
		userService.updateUserProfileData.mockResolvedValue({ user: CURRENT_USER, jwt: REFRESHED_TOKEN });
		userService.followUser.mockResolvedValue({ user: CURRENT_USER, jwt: REFRESHED_TOKEN });
		userService.unfollowUser.mockResolvedValue({ user: CURRENT_USER, jwt: REFRESHED_TOKEN });
		userService.changePassword.mockResolvedValue(undefined);
		userService.getUsersProfileDataByUserIds.mockResolvedValue([]);
	});

	afterEach(() => {
		consoleSpies.forEach((spy) => spy.mockRestore());
	});

	describe.each([
		['sign-up', '/users/sign-up', 'signUp', { email: 'a@example.com', username: 'realuser', password: 'a-valid-password' }],
		['login', '/users/login', 'login', { email: 'a@example.com', password: 'a-valid-password' }],
		['demo-login', '/users/demo-login', 'demoLogin', {}],
	])('POST %s', (_name, path, serviceMethod, payload) => {
		it('sets the session cookie to the token the service signed', async () => {
			const response = await postJson(path, payload);

			expect(response.status).toBe(200);
			expect(tokenOf(setCookieOf(response))).toBe(issuedToken);
		});

		it('sets the cookie httpOnly, sameSite lax, for the token lifetime and not secure outside production', async () => {
			const response = await postJson(path, payload);

			expectSessionCookieAttributes(setCookieOf(response));
		});

		it('answers with the user profile the service returned', async () => {
			const response = await postJson(path, payload);

			await expect(response.json()).resolves.toEqual(CURRENT_USER);
		});

		it('does not look the user up again, since the service already returned the profile', async () => {
			await postJson(path, payload);

			expect(userService.getCurrentUser).not.toHaveBeenCalled();
		});

		it('sets the cookie to the jwt exactly as the service returned it, without decoding it', async () => {
			userService[serviceMethod].mockResolvedValue({ user: CURRENT_USER, jwt: 'opaque-value-that-is-not-a-jwt' });

			const response = await postJson(path, payload);

			expect(response.status).toBe(200);
			expect(tokenOf(setCookieOf(response))).toBe('opaque-value-that-is-not-a-jwt');
		});

		it('answers with the profile only, never the { user, jwt } pair the service returned', async () => {
			const response = await postJson(path, payload);
			const body = await response.json();

			expect(body).not.toHaveProperty('jwt');
			expect(body).not.toHaveProperty('user');
		});

		it('never puts the token in the response body', async () => {
			const response = await postJson(path, payload);

			await expectNoTokenInBody(response);
		});

		it('sets no cookie when the service rejects', async () => {
			userService[serviceMethod].mockRejectedValue(new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED }));

			const response = await postJson(path, payload);

			expect(response.status).toBe(401);
			expect(setCookieOf(response)).toBeUndefined();
		});
	});

	describe('responses that renew the session', () => {
		describe('PATCH /users/update/:userId', () => {
			const patchBio = (headers) =>
				fetch(`${baseUrl}/users/update/${USER_ID}`, {
					method: 'PATCH',
					headers: { ...headers, 'Content-Type': 'application/json' },
					body: JSON.stringify({ bio: 'New bio' }),
				});

			it('re-sets the session cookie with the renewed token and the full attributes', async () => {
				const response = await patchBio(sessionCookie(issuedToken));
				const cookie = setCookieOf(response);

				expect(response.status).toBe(200);
				expect(tokenOf(cookie)).toBe(REFRESHED_TOKEN);
				expectSessionCookieAttributes(cookie);
			});

			it('answers with the user only, never the token', async () => {
				const response = await patchBio(sessionCookie(issuedToken));
				const body = await response.json();

				expect(body).toEqual({ user: CURRENT_USER });
				expect(JSON.stringify(body)).not.toContain(REFRESHED_TOKEN);
			});

			it('sets no cookie without a session', async () => {
				const response = await patchBio({});

				expect(response.status).toBe(401);
				expect(setCookieOf(response)).toBeUndefined();
			});
		});

		describe.each([
			['follow', 'followUser'],
			['unfollow', 'unfollowUser'],
		])('POST /users/:userId/%s/:targetId', (action, serviceMethod) => {
			const post = (headers) => fetch(`${baseUrl}/users/${USER_ID}/${action}/${OTHER_USER_ID}`, { method: 'POST', headers });

			it('re-sets the session cookie with the renewed token and the full attributes', async () => {
				const response = await post(sessionCookie(issuedToken));
				const cookie = setCookieOf(response);

				expect(response.status).toBe(200);
				expect(userService[serviceMethod]).toHaveBeenCalledWith(USER_ID, OTHER_USER_ID);
				expect(tokenOf(cookie)).toBe(REFRESHED_TOKEN);
				expectSessionCookieAttributes(cookie);
			});

			it('answers with the user only, never the token', async () => {
				const response = await post(sessionCookie(issuedToken));
				const body = await response.json();

				expect(body).toEqual({ user: CURRENT_USER });
				expect(JSON.stringify(body)).not.toContain(REFRESHED_TOKEN);
			});

			it('sets no cookie without a session', async () => {
				const response = await post({});

				expect(response.status).toBe(401);
				expect(setCookieOf(response)).toBeUndefined();
			});
		});
	});

	describe('POST /users/logout', () => {
		it('answers 204 with an empty body', async () => {
			const response = await fetch(`${baseUrl}/users/logout`, { method: 'POST', headers: sessionCookie(issuedToken) });

			expect(response.status).toBe(204);
			await expect(response.text()).resolves.toBe('');
		});

		it('clears the session cookie: empty value and an expiry in the past', async () => {
			const response = await fetch(`${baseUrl}/users/logout`, { method: 'POST', headers: sessionCookie(issuedToken) });
			const cookie = setCookieOf(response);

			expect(tokenOf(cookie)).toBe('');
			expect(
				new Date(
					attributesOf(cookie)
						.find((attribute) => attribute.startsWith('Expires='))
						.slice('Expires='.length),
				).getTime(),
			).toBeLessThan(Date.now());
		});

		it('clears it with the same path, httpOnly and sameSite attributes the cookie was set with', async () => {
			const response = await fetch(`${baseUrl}/users/logout`, { method: 'POST', headers: sessionCookie(issuedToken) });
			const attributes = attributesOf(setCookieOf(response));

			expect(attributes).toContain('Path=/');
			expect(attributes).toContain('HttpOnly');
			expect(attributes).toContain('SameSite=Lax');
			expect(attributes).not.toContain('Secure');
		});

		it('works without a session, so logging out twice or with an expired session never fails', async () => {
			const response = await fetch(`${baseUrl}/users/logout`, { method: 'POST' });

			expect(response.status).toBe(204);
			expect(tokenOf(setCookieOf(response))).toBe('');
		});

		it('works with an expired or invalid cookie', async () => {
			const response = await fetch(`${baseUrl}/users/logout`, { method: 'POST', headers: sessionCookie('not.a.valid.token') });

			expect(response.status).toBe(204);
		});

		it('does not call any service', async () => {
			await fetch(`${baseUrl}/users/logout`, { method: 'POST', headers: sessionCookie(issuedToken) });

			Object.values(userService).forEach((serviceMethod) => expect(serviceMethod).not.toHaveBeenCalled());
		});
	});

	describe('GET /users/me', () => {
		const getMe = (headers = {}) => fetch(`${baseUrl}/users/me`, { headers });

		const expectUnauthenticated = async (response) => {
			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
		};

		it('answers 200 with null when there is no cookie', async () => {
			const response = await getMe();

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toBeNull();
		});

		it('logs nothing and loads nothing for a guest', async () => {
			await getMe();

			consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
			expect(userService.getCurrentUser).not.toHaveBeenCalled();
		});

		it('answers the user profile for a valid cookie', async () => {
			const response = await getMe(sessionCookie(issuedToken));

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual(CURRENT_USER);
		});

		it('loads the profile of the user in the cookie', async () => {
			await getMe(sessionCookie(signToken()));

			expect(userService.getCurrentUser).toHaveBeenCalledWith(USER_ID);
		});

		it('answers 401 UNAUTHENTICATED for an expired cookie', async () => {
			const response = await getMe(sessionCookie(signToken({ expiresIn: -10 })));

			await expectUnauthenticated(response);
			expect(userService.getCurrentUser).not.toHaveBeenCalled();
		});

		it('answers 401 UNAUTHENTICATED for an invalid cookie', async () => {
			const response = await getMe(sessionCookie('not.a.valid.token'));

			await expectUnauthenticated(response);
			expect(userService.getCurrentUser).not.toHaveBeenCalled();
		});

		it('answers 401 UNAUTHENTICATED for a cookie signed with another secret', async () => {
			const response = await getMe(sessionCookie(signToken({}, 'another-secret')));

			await expectUnauthenticated(response);
		});

		it('answers 401 UNAUTHENTICATED when the user in the token no longer exists', async () => {
			userService.getCurrentUser.mockRejectedValue(new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED }));

			const response = await getMe(sessionCookie(issuedToken));

			await expectUnauthenticated(response);
		});

		it('ignores the old X-Authorization header and treats the request as a guest', async () => {
			const response = await getMe({ 'X-Authorization': issuedToken });

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toBeNull();
			expect(userService.getCurrentUser).not.toHaveBeenCalled();
		});

		it('does not renew or set any cookie', async () => {
			const response = await getMe(sessionCookie(issuedToken));

			expect(response.headers.getSetCookie()).toEqual([]);
		});
	});

	describe('clearing a cookie the server rejects', () => {
		const patchPassword = (headers = {}) =>
			fetch(`${baseUrl}/users/password`, {
				method: 'PATCH',
				headers: { ...headers, 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword: 'oldPassword1', newPassword: 'newPassword1' }),
			});

		const getProfiles = (headers = {}) => fetch(`${baseUrl}/users?userIds=${USER_ID}`, { headers });

		const getMe = (headers = {}) => fetch(`${baseUrl}/users/me`, { headers });

		const expectClearingCookie = (response) => {
			const cookie = setCookieOf(response);

			expect(cookie).toBeDefined();
			expect(tokenOf(cookie)).toBe('');

			const attributes = attributesOf(cookie);

			expect(attributes).toContain('Path=/');
			expect(attributes).toContain('HttpOnly');
			expect(attributes).toContain('SameSite=Lax');
			expect(new Date(attributes.find((attribute) => attribute.startsWith('Expires=')).slice('Expires='.length)).getTime()).toBeLessThan(
				Date.now(),
			);
		};

		it('sends a clearing Set-Cookie with the 401 for an expired cookie on a protected route', async () => {
			const response = await patchPassword(sessionCookie(signToken({ expiresIn: -10 })));

			expect(response.status).toBe(401);
			expectClearingCookie(response);
			expect(userService.changePassword).not.toHaveBeenCalled();
		});

		it('sends a clearing Set-Cookie with the 401 for an invalid cookie on a protected route', async () => {
			const response = await patchPassword(sessionCookie('not.a.valid.token'));

			expect(response.status).toBe(401);
			expectClearingCookie(response);
		});

		it('sends a clearing Set-Cookie with the 200 for an invalid cookie on an optional-auth route, answering it as a guest', async () => {
			const response = await getProfiles(sessionCookie('not.a.valid.token'));

			expect(response.status).toBe(200);
			expectClearingCookie(response);
			expect(userService.getUsersProfileDataByUserIds).toHaveBeenCalledWith({ userIds: [USER_ID], requesterId: undefined });
		});

		it('sends a clearing Set-Cookie with the 200 for an expired cookie on an optional-auth route', async () => {
			const response = await getProfiles(sessionCookie(signToken({ expiresIn: -10 })));

			expect(response.status).toBe(200);
			expectClearingCookie(response);
		});

		it('sends a clearing Set-Cookie with the 401 from /users/me for an expired cookie', async () => {
			const response = await getMe(sessionCookie(signToken({ expiresIn: -10 })));

			expect(response.status).toBe(401);
			expectClearingCookie(response);
		});

		it('sends a clearing Set-Cookie with the 401 from /users/me when the user in the token no longer exists, and keeps the error body', async () => {
			userService.getCurrentUser.mockRejectedValue(new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED }));

			const response = await getMe(sessionCookie(issuedToken));

			expect(response.status).toBe(401);
			expectClearingCookie(response);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
		});

		it('does not clear the cookie on /users/me when the lookup fails for another reason', async () => {
			userService.getCurrentUser.mockRejectedValue(new AppError('Could not load users profile data', 500));

			const response = await getMe(sessionCookie(issuedToken));

			expect(response.status).toBe(500);
			expect(setCookieOf(response)).toBeUndefined();
		});

		it('sends no Set-Cookie for a valid cookie on any of the routes', async () => {
			const responses = await Promise.all([
				patchPassword(sessionCookie(issuedToken)),
				getProfiles(sessionCookie(issuedToken)),
				getMe(sessionCookie(issuedToken)),
			]);

			responses.forEach((response) => expect(setCookieOf(response)).toBeUndefined());
		});

		it('sends no Set-Cookie when there is no cookie, on a protected route, an optional-auth route or /users/me', async () => {
			const responses = await Promise.all([patchPassword(), getProfiles(), getMe()]);

			expect(responses.map((response) => response.status)).toEqual([401, 200, 200]);
			responses.forEach((response) => expect(setCookieOf(response)).toBeUndefined());
		});

		it('sends no Set-Cookie when the request only carries the old X-Authorization header', async () => {
			const responses = await Promise.all([
				patchPassword({ 'X-Authorization': 'not.a.valid.token' }),
				getProfiles({ 'X-Authorization': 'not.a.valid.token' }),
				getMe({ 'X-Authorization': 'not.a.valid.token' }),
			]);

			responses.forEach((response) => expect(setCookieOf(response)).toBeUndefined());
		});
	});

	describe('CORS', () => {
		it('allows the configured origin with credentials', async () => {
			const response = await fetch(`${baseUrl}/users/me`, { headers: { Origin: CLIENT_ORIGIN } });

			expect(response.headers.get('access-control-allow-origin')).toBe(CLIENT_ORIGIN);
			expect(response.headers.get('access-control-allow-credentials')).toBe('true');
		});

		it('answers a preflight for the configured origin with credentials allowed', async () => {
			const response = await fetch(`${baseUrl}/users/login`, {
				method: 'OPTIONS',
				headers: {
					Origin: CLIENT_ORIGIN,
					'Access-Control-Request-Method': 'POST',
					'Access-Control-Request-Headers': 'content-type',
				},
			});

			expect(response.status).toBe(204);
			expect(response.headers.get('access-control-allow-origin')).toBe(CLIENT_ORIGIN);
			expect(response.headers.get('access-control-allow-credentials')).toBe('true');
		});

		it('never answers with a wildcard origin, which browsers refuse together with credentials', async () => {
			const response = await fetch(`${baseUrl}/users/me`, { headers: { Origin: 'https://evil.example' } });

			expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
		});

		it('does not echo back a different origin', async () => {
			const response = await fetch(`${baseUrl}/users/me`, { headers: { Origin: 'https://evil.example' } });

			expect(response.headers.get('access-control-allow-origin')).toBe(CLIENT_ORIGIN);
		});
	});
});
