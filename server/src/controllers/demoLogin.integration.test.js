const mongoose = require('mongoose');
const JWT = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const { cloudinary } = require('../config/cloudinary');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { loadVisitorData } = require('../demo/loadDemoData');
const { scheduleReactions } = require('../demo/reactionDelivery');
const { userService } = require('../services');
const AppError = require('../utils/AppError');
const { loadFixture, seedDatabase } = require('../demo/demoTestSupport');

jest.mock('../config/cloudinary', () => ({
	cloudinary: { uploader: { upload: jest.fn(), destroy: jest.fn() } },
	isConfigured: jest.fn(() => true),
	getUploadFolder: jest.fn(() => 'user-images'),
}));

jest.mock('../demo/loadDemoData', () => ({
	loadDemoData: jest.fn(),
	loadVisitorData: jest.fn(),
	loadGenericComments: jest.fn(),
}));

jest.mock('../demo/reactionDelivery', () => ({
	...jest.requireActual('../demo/reactionDelivery'),
	scheduleReactions: jest.fn(),
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 120 * 1000;
const JWT_SECRET = 'demo-login-integration-test-secret';
const SEED_NOW = new Date('2026-11-03T08:00:00.000Z');
const COPY_FOLDER = 'demo-users/visitor-post-copies';
const GENERIC_COMMENTS = Array.from({ length: 30 }, (value, index) => `Generic comment ${index + 1}`);
const RATE_LIMIT = constants.DEMO_LOGIN_RATE_LIMIT_MAX_REQUESTS;

jest.setTimeout(TEST_TIMEOUT_MS);

const fixture = loadFixture();

const buildVisitorData = () => ({
	postPhotos: Array.from({ length: 31 }, (value, index) => ({
		source: `visitor-posts/group/${index + 1}.jpg`,
		imageIdentifier: `demo-users/visitor-posts/group/${index + 1}`,
		imageUrl: `https://cdn.example.com/demo-users/visitor-posts/group/${index + 1}.jpg`,
		imageWidth: 800,
		imageHeight: 600,
	})),
	avatarPhotos: Array.from({ length: 20 }, (value, index) => ({
		source: `visitor-avatars/group/${index + 1}.jpg`,
		imageIdentifier: `demo-users/visitor-avatars/avatar-${index + 1}`,
		imageUrl: `https://cdn.example.com/demo-users/visitor-avatars/avatar-${index + 1}.jpg`,
		imageWidth: 400,
		imageHeight: 400,
	})),
	genericComments: GENERIC_COMMENTS,
});

const readSessionCookie = (response) => response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${constants.AUTH_COOKIE_NAME}=`));

const readSessionToken = (response) => readSessionCookie(response)?.split(';')[0].split('=')[1];

const authHeaders = (token) => ({ Cookie: `${constants.AUTH_COOKIE_NAME}=${token}` });

let nextIpSuffix = 1;

const nextIp = () => {
	nextIpSuffix += 1;

	return `203.0.113.${nextIpSuffix}`;
};

describe('POST /users/demo-login against a real database', () => {
	let mongoServer;
	let server;
	let baseUrl;
	let originalJwtSecret;

	const demoLogin = (ip = nextIp()) => fetch(`${baseUrl}/users/demo-login`, { method: 'POST', headers: { 'X-Forwarded-For': ip } });

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

	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('entering the app as a visitor', () => {
		let firstToken;
		let secondToken;
		let firstResponse;
		let firstBody;

		beforeAll(async () => {
			await seedDatabase(fixture, SEED_NOW);

			let uploads = 0;

			cloudinary.uploader.upload.mockImplementation(async () => {
				uploads += 1;

				return {
					public_id: `${COPY_FOLDER}/copy-${uploads}`,
					secure_url: `https://cdn.example.com/${COPY_FOLDER}/copy-${uploads}.jpg`,
					width: 800,
					height: 600,
				};
			});
			loadVisitorData.mockResolvedValue(buildVisitorData());
			scheduleReactions.mockReset();

			firstResponse = await demoLogin();
			firstBody = await firstResponse.clone().json();
			firstToken = readSessionToken(firstResponse);
			secondToken = readSessionToken(await demoLogin());
		});

		it('should answer 200 without any form, credentials or body', () => {
			expect(firstResponse.status).toBe(200);
		});

		it('should hand the token over only in the session cookie', () => {
			expect(typeof firstToken).toBe('string');
			expect(firstToken.split('.')).toHaveLength(3);
		});

		it('should set the session cookie httpOnly, same-site lax and for the token lifetime', () => {
			const cookie = readSessionCookie(firstResponse);

			expect(cookie).toContain('HttpOnly');
			expect(cookie).toContain('SameSite=Lax');
			expect(cookie).toContain(`Max-Age=${constants.JWT_EXPIRY}`);
			expect(cookie).not.toContain('Secure');
		});

		it('should answer with the visitor profile and no token', () => {
			expect(firstBody.accountType).toBe('demo');
			expect(JSON.stringify(firstBody)).not.toContain(firstToken);
			expect(firstBody).not.toHaveProperty('jwt');
		});

		it('should sign the token the same way a login does, for the new account', async () => {
			const payload = JWT.verify(firstToken, JWT_SECRET);
			const visitor = await UserModel.findById(payload.userId).lean();

			expect(visitor.accountType).toBe('demo');
			expect(visitor.username).toBe(payload.username);
			expect(payload.exp - payload.iat).toBe(constants.JWT_EXPIRY);
		});

		it('should name the account <username>@visitor.demo.invalid', async () => {
			const payload = JWT.verify(firstToken, JWT_SECRET);
			const visitor = await UserModel.findById(payload.userId).lean();

			expect(visitor.email).toBe(`${visitor.username}@visitor.demo.invalid`);
			expect(visitor.username).toMatch(/^[a-z]+_demo_\d{1,2}$/);
		});

		it('should give two visitors two different accounts and tokens', () => {
			const first = JWT.verify(firstToken, JWT_SECRET);
			const second = JWT.verify(secondToken, JWT_SECRET);

			expect(firstToken).not.toBe(secondToken);
			expect(first.userId).not.toBe(second.userId);
			expect(first.username).not.toBe(second.username);
		});

		it('should create an account that can be used with the token straight away', async () => {
			const payload = JWT.verify(firstToken, JWT_SECRET);
			const response = await fetch(`${baseUrl}/users?userIds=${payload.userId}`, { headers: authHeaders(firstToken) });
			const [profile] = await response.json();

			expect(response.status).toBe(200);
			expect(profile.accountType).toBe('demo');
		});

		it('should fill the feed straight away', async () => {
			const response = await fetch(`${baseUrl}/user-posts/followed-users-posts`, { headers: authHeaders(firstToken) });
			const { posts } = await response.json();

			expect(response.status).toBe(200);
			expect(posts.length).toBeGreaterThan(0);
		});

		it('should fill the own profile straight away', async () => {
			const payload = JWT.verify(firstToken, JWT_SECRET);
			const [profile] = await (await fetch(`${baseUrl}/users?userIds=${payload.userId}`, { headers: authHeaders(firstToken) })).json();

			expect(profile.posts.length).toBeGreaterThanOrEqual(2);
			expect(profile.posts.length).toBeLessThanOrEqual(3);
			expect(profile.following).toHaveLength(40);
			expect(profile.followers.length).toBeGreaterThanOrEqual(15);
			expect(profile.profilePicture.imageUrl).toContain('visitor-avatars');
		});

		it('should not hand out any password in the response', async () => {
			const text = await (await demoLogin()).text();

			expect(text).not.toMatch(/password/i);
		});
	});

	describe('when 300 visitors are already live', () => {
		beforeAll(async () => {
			await seedDatabase(fixture, SEED_NOW);
			await UserModel.insertMany(
				Array.from({ length: 300 }, (value, index) => ({
					email: `capfiller${index}_demo_1@visitor.demo.invalid`,
					username: `capfiller${index}_demo_1`,
					password: 'hashed-password',
					accountType: 'demo',
				})),
			);
		});

		afterAll(async () => {
			await UserModel.deleteMany({ username: /^capfiller/ });
		});

		it('answers 429 with the DEMO_UNAVAILABLE code, so the client can say the demo is busy', async () => {
			const response = await demoLogin();
			const body = await response.json();

			expect(response.status).toBe(429);
			expect(body.code).toBe(ERROR_CODES.DEMO_UNAVAILABLE);
			expect(body.code).toBe('DEMO_UNAVAILABLE');
		});

		it('is not the same answer as the per-connection limit', async () => {
			const body = await (await demoLogin()).json();

			expect(body.code).not.toBe(ERROR_CODES.TOO_MANY_REQUESTS);
		});

		it('hands out no token and creates no account', async () => {
			const before = await UserModel.countDocuments({ accountType: 'demo' });
			const response = await demoLogin();
			const text = await response.text();

			expect(text).not.toMatch(/\.[A-Za-z0-9_-]+\./);
			expect(readSessionCookie(response)).toBeUndefined();
			expect(await UserModel.countDocuments({ accountType: 'demo' })).toBe(before);
		});

		it('leaves login and the rest of the app working', async () => {
			const response = await fetch(`${baseUrl}/users/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'nobody@example.com', password: 'whatever-password' }),
			});

			expect(response.status).toBe(401);
		});
	});

	describe('when the visitor cannot be created', () => {
		it('should hide a 503 from the visitor service behind the generic 500', async () => {
			jest.spyOn(userService, 'demoLogin').mockRejectedValue(new AppError('Could not find a free demo username', 503));

			const response = await demoLogin();
			const body = await response.json();

			expect(response.status).toBe(500);
			expect(body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
			expect(JSON.stringify(body)).not.toContain('free demo username');
		});

		it('should answer a generic 500 for an unexpected failure, without internal text', async () => {
			jest.spyOn(userService, 'demoLogin').mockRejectedValue(new Error('mongo exploded at 10.0.0.5'));

			const response = await demoLogin();
			const body = await response.json();

			expect(response.status).toBe(500);
			expect(body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
			expect(JSON.stringify(body)).not.toContain('10.0.0.5');
		});
	});

	describe('the rate limit of 5 per connection per hour', () => {
		beforeEach(() => {
			jest.spyOn(userService, 'demoLogin').mockResolvedValue(JWT.sign({ userId: 'a-demo-user-id', username: 'a_demo_1' }, JWT_SECRET));
			jest.spyOn(userService, 'getCurrentUser').mockResolvedValue({ _id: 'a-demo-user-id', username: 'a_demo_1' });
		});

		it('should be 5 requests', () => {
			expect(RATE_LIMIT).toBe(5);
			expect(constants.DEMO_LOGIN_RATE_LIMIT_WINDOW_MS).toBe(60 * 60 * 1000);
		});

		it('should let the first 5 requests from a connection through', async () => {
			const ip = nextIp();

			for (let attempt = 1; attempt <= RATE_LIMIT; attempt += 1) {
				expect((await demoLogin(ip)).status).toBe(200);
			}
		});

		it('should answer 429 TOO_MANY_REQUESTS to the 6th request', async () => {
			const ip = nextIp();

			for (let attempt = 1; attempt <= RATE_LIMIT; attempt += 1) {
				await demoLogin(ip);
			}

			const response = await demoLogin(ip);
			const body = await response.json();

			expect(response.status).toBe(429);
			expect(body.code).toBe(ERROR_CODES.TOO_MANY_REQUESTS);
			expect(body.code).toBe('TOO_MANY_REQUESTS');
		});

		it('should keep answering 429 for further requests from that connection', async () => {
			const ip = nextIp();

			for (let attempt = 1; attempt <= RATE_LIMIT + 1; attempt += 1) {
				await demoLogin(ip);
			}

			expect((await demoLogin(ip)).status).toBe(429);
		});

		it('should not create an account for a rejected request', async () => {
			const ip = nextIp();

			for (let attempt = 1; attempt <= RATE_LIMIT; attempt += 1) {
				await demoLogin(ip);
			}

			userService.demoLogin.mockClear();
			await demoLogin(ip);

			expect(userService.demoLogin).not.toHaveBeenCalled();
		});

		it('should count each connection separately', async () => {
			const exhausted = nextIp();
			const other = nextIp();

			for (let attempt = 1; attempt <= RATE_LIMIT + 1; attempt += 1) {
				await demoLogin(exhausted);
			}

			expect((await demoLogin(exhausted)).status).toBe(429);
			expect((await demoLogin(other)).status).toBe(200);
		});

		it('should tell the client how many requests are allowed', async () => {
			const response = await demoLogin(nextIp());

			expect(response.headers.get('ratelimit-policy')).toContain(String(RATE_LIMIT));
		});

		it('should not slow down the other routes: login is still answered after the limit is reached', async () => {
			const ip = nextIp();

			for (let attempt = 1; attempt <= RATE_LIMIT + 1; attempt += 1) {
				await demoLogin(ip);
			}

			const response = await fetch(`${baseUrl}/users/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
				body: JSON.stringify({ email: 'nobody@example.com', password: 'whatever-password' }),
			});

			expect(response.status).toBe(401);
		});
	});
});

describe('the account type cannot be set by a user, against a real database', () => {
	let mongoServer;
	let server;
	let baseUrl;
	let originalJwtSecret;

	const postJson = (path, body) =>
		fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

	const signUp = async (username, extra = {}) => {
		const response = await postJson('/users/sign-up', { email: `${username}@example.com`, username, password: 'a-valid-password', ...extra });

		return { response, token: readSessionToken(response) };
	};

	const updateProfile = (user, token, fields) => {
		const form = new FormData();

		Object.entries(fields).forEach(([name, value]) => form.append(name, value));

		return fetch(`${baseUrl}/users/update/${user._id}`, { method: 'PATCH', headers: authHeaders(token), body: form });
	};

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await UserModel.init();

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

	describe.each(['demo', 'persona', 'user'])('signing up with accountType %s in the body', (requestedType) => {
		it('should create a regular user whatever the body says', async () => {
			const { response } = await signUp('newcomer', { accountType: requestedType });
			const stored = await UserModel.findOne({ username: 'newcomer' }).lean();

			expect(response.status).toBe(200);
			expect(stored.accountType).toBe('user');
		});
	});

	it('should create a regular user when sign-up sends no account type', async () => {
		await signUp('plain');

		expect((await UserModel.findOne({ username: 'plain' }).lean()).accountType).toBe('user');
	});

	it('should show the owner the account type user on their own profile', async () => {
		const { token } = await signUp('loginuser');
		const stored = await UserModel.findOne({ username: 'loginuser' });
		const response = await fetch(`${baseUrl}/users?userIds=${stored._id}`, { headers: authHeaders(token) });
		const [profile] = await response.json();

		expect(profile.accountType).toBe('user');
	});

	it('should not make a sign-up with a visitor-looking email a visitor', async () => {
		await signUp('lookalike', { email: 'lookalike@visitor.demo.invalid' });

		expect((await UserModel.findOne({ username: 'lookalike' }).lean()).accountType).toBe('user');
	});

	describe('editing the profile', () => {
		let user;
		let token;

		beforeEach(async () => {
			({ token } = await signUp('editor'));
			user = await UserModel.findOne({ username: 'editor' });
		});

		it.each(['demo', 'persona', 'user'])('should refuse accountType %s with a 400 BAD_REQUEST', async (requestedType) => {
			const response = await updateProfile(user, token, { accountType: requestedType });

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.BAD_REQUEST });
		});

		it('should leave the account type unchanged after a refused change', async () => {
			await updateProfile(user, token, { accountType: 'persona' });

			expect((await UserModel.findById(user._id).lean()).accountType).toBe('user');
		});

		it('should not apply the other fields of a request that also tries to change the account type', async () => {
			await updateProfile(user, token, { accountType: 'persona', bio: 'sneaky bio' });

			expect((await UserModel.findById(user._id).lean()).bio).toBeUndefined();
		});

		it('should still accept an ordinary profile edit', async () => {
			const response = await updateProfile(user, token, { bio: 'a real bio' });

			expect(response.status).toBe(200);
			expect((await UserModel.findById(user._id).lean()).bio).toBe('a real bio');
		});

		it('should not list the account type among the editable profile fields', () => {
			expect(constants.ALLOWED_PROFILE_UPDATE_FIELDS).not.toContain('accountType');
		});
	});
});
