const mongoose = require('mongoose');
const JWT = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');

jest.mock('../demo/userReactions', () => ({
	reactToSignUp: jest.fn(),
	reactToUpload: jest.fn(),
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;
const JWT_SECRET = 'session-cookie-integration-test-secret';
const PASSWORD = 'a-valid-password';
const PROTECTED_PATH = '/user-posts/followed-users-posts';

jest.setTimeout(TEST_TIMEOUT_MS);

describe('the session cookie against a real database', () => {
	let mongoServer;
	let server;
	let baseUrl;
	let originalJwtSecret;

	const setCookieOf = (response) => response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${constants.AUTH_COOKIE_NAME}=`));

	const tokenOf = (cookie) => cookie.split(';')[0].slice(constants.AUTH_COOKIE_NAME.length + 1);

	const sessionCookie = (token) => ({ Cookie: `${constants.AUTH_COOKIE_NAME}=${token}` });

	const postJson = (path, body) =>
		fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

	const signUp = (username = 'newcomer') => postJson('/users/sign-up', { email: `${username}@example.com`, username, password: PASSWORD });

	const login = (username = 'newcomer') => postJson('/users/login', { email: `${username}@example.com`, password: PASSWORD });

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), UserPostModel.init()]);

		server = await new Promise((resolve) => {
			const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
		});
		baseUrl = `http://127.0.0.1:${server.address().port}`;
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		process.env.JWT_SECRET = originalJwtSecret;

		await new Promise((resolve) => server.close(resolve));
		await mongoose.disconnect();
		await mongoServer?.stop();
	});

	beforeEach(async () => {
		jest.spyOn(console, 'error').mockImplementation(() => {});
		await UserModel.deleteMany({});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('signing up', () => {
		it('sets a verifiable httpOnly cookie for the new account', async () => {
			const response = await signUp();
			const cookie = setCookieOf(response);
			const payload = JWT.verify(tokenOf(cookie), JWT_SECRET);
			const stored = await UserModel.findOne({ username: 'newcomer' });

			expect(response.status).toBe(200);
			expect(cookie).toContain('HttpOnly');
			expect(payload.userId).toBe(String(stored._id));
		});

		it('answers with the new profile and no token or password', async () => {
			const response = await signUp();
			const text = await response.text();
			const body = JSON.parse(text);

			expect(body.username).toBe('newcomer');
			expect(text).not.toContain(tokenOf(setCookieOf(response)));
			expect(text).not.toMatch(/password|"jwt"|"token"/i);
		});

		it('gives a cookie that restores the same session through /users/me', async () => {
			const response = await signUp();
			const me = await fetch(`${baseUrl}/users/me`, { headers: sessionCookie(tokenOf(setCookieOf(response))) });

			expect(me.status).toBe(200);
			await expect(me.json()).resolves.toMatchObject({ username: 'newcomer' });
		});

		it('answers with exactly what /users/me answers for the cookie it sets', async () => {
			const response = await signUp();
			const me = await fetch(`${baseUrl}/users/me`, { headers: sessionCookie(tokenOf(setCookieOf(response))) });

			await expect(response.json()).resolves.toEqual(await me.json());
		});

		it('gives a cookie that opens a protected route', async () => {
			const response = await signUp();
			const protectedResponse = await fetch(`${baseUrl}${PROTECTED_PATH}`, { headers: sessionCookie(tokenOf(setCookieOf(response))) });

			expect(protectedResponse.status).toBe(200);
		});
	});

	describe('logging in', () => {
		beforeEach(async () => {
			await signUp();
		});

		it('sets a cookie for the right account and answers with its profile', async () => {
			const response = await login();
			const body = await response.json();
			const payload = JWT.verify(tokenOf(setCookieOf(response)), JWT_SECRET);

			expect(response.status).toBe(200);
			expect(body.username).toBe('newcomer');
			expect(payload.userId).toBe(String(body._id));
		});

		it('answers with exactly what /users/me answers for the cookie it sets', async () => {
			const response = await login();
			const me = await fetch(`${baseUrl}/users/me`, { headers: sessionCookie(tokenOf(setCookieOf(response))) });

			await expect(response.json()).resolves.toEqual(await me.json());
		});

		it('sets no cookie for a wrong password', async () => {
			const response = await postJson('/users/login', { email: 'newcomer@example.com', password: 'a-wrong-password' });

			expect(response.status).toBe(401);
			expect(setCookieOf(response)).toBeUndefined();
		});
	});

	describe('the session after it was issued', () => {
		it('is rejected on a protected route once the cookie is expired', async () => {
			const stored = await UserModel.create({ email: 'e@example.com', username: 'expired', password: 'hashed-password' });
			const expired = JWT.sign({ userId: String(stored._id), username: 'expired' }, JWT_SECRET, { expiresIn: -10 });

			const response = await fetch(`${baseUrl}${PROTECTED_PATH}`, { headers: sessionCookie(expired) });

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
		});

		it('is rejected by /users/me once the cookie is expired', async () => {
			const stored = await UserModel.create({ email: 'e@example.com', username: 'expired', password: 'hashed-password' });
			const expired = JWT.sign({ userId: String(stored._id), username: 'expired' }, JWT_SECRET, { expiresIn: -10 });

			const response = await fetch(`${baseUrl}/users/me`, { headers: sessionCookie(expired) });

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
		});

		it('is rejected by /users/me with a 401, not a 404, when the account was deleted', async () => {
			const response = await signUp();
			const token = tokenOf(setCookieOf(response));

			await UserModel.deleteMany({});

			const me = await fetch(`${baseUrl}/users/me`, { headers: sessionCookie(token) });

			expect(me.status).toBe(401);
			await expect(me.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
		});

		it('clears the cookie when /users/me rejects it because the account was deleted', async () => {
			const response = await signUp();
			const token = tokenOf(setCookieOf(response));

			await UserModel.deleteMany({});

			const me = await fetch(`${baseUrl}/users/me`, { headers: sessionCookie(token) });

			expect(tokenOf(setCookieOf(me))).toBe('');
		});

		it('clears the cookie on a protected route when it has expired, and sets nothing without a cookie', async () => {
			const stored = await UserModel.create({ email: 'e@example.com', username: 'expired', password: 'hashed-password' });
			const expired = JWT.sign({ userId: String(stored._id), username: 'expired' }, JWT_SECRET, { expiresIn: -10 });

			const rejected = await fetch(`${baseUrl}${PROTECTED_PATH}`, { headers: sessionCookie(expired) });
			const anonymous = await fetch(`${baseUrl}${PROTECTED_PATH}`);

			expect(rejected.status).toBe(401);
			expect(tokenOf(setCookieOf(rejected))).toBe('');
			expect(anonymous.status).toBe(401);
			expect(setCookieOf(anonymous)).toBeUndefined();
		});

		it('is not accepted from the old X-Authorization header', async () => {
			const response = await signUp();
			const token = tokenOf(setCookieOf(response));

			const protectedResponse = await fetch(`${baseUrl}${PROTECTED_PATH}`, { headers: { 'X-Authorization': token } });

			expect(protectedResponse.status).toBe(401);
		});
	});

	describe('logging out', () => {
		it('answers with a cookie that removes the session, after which protected routes answer 401', async () => {
			const signedUp = await signUp();
			const token = tokenOf(setCookieOf(signedUp));
			const loggedOut = await fetch(`${baseUrl}/users/logout`, { method: 'POST', headers: sessionCookie(token) });
			const clearing = setCookieOf(loggedOut);

			expect(loggedOut.status).toBe(204);
			expect(tokenOf(clearing)).toBe('');

			const afterLogout = await fetch(`${baseUrl}${PROTECTED_PATH}`);

			expect(afterLogout.status).toBe(401);
		});

		it('leaves /users/me answering null for the guest that is left', async () => {
			const me = await fetch(`${baseUrl}/users/me`);

			await expect(me.json()).resolves.toBeNull();
		});
	});
});
