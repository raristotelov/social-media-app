const mongoose = require('mongoose');
const JWT = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const NotificationModel = require('../models/notificationModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;
const JWT_SECRET = 'notification-integration-test-secret';
const MINUTE_MS = 60 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

let postCounter = 0;

const createUser = (username) => UserModel.create({ email: `${username}@example.com`, username, password: 'hashed-password' });

describe('notification endpoints against a real database', () => {
	let mongoServer;
	let server;
	let baseUrl;
	let originalJwtSecret;
	let alice;
	let bob;

	const authHeaders = (user) => ({ 'X-Authorization': JWT.sign({ userId: String(user._id), username: user.username }, JWT_SECRET) });

	const get = (path, user) => fetch(`${baseUrl}${path}`, { headers: user ? authHeaders(user) : {} });

	const markAllRead = (user, body = { cutoff: new Date().toISOString() }) =>
		fetch(`${baseUrl}/notifications/mark-all-read`, {
			method: 'POST',
			headers: { ...(user ? authHeaders(user) : {}), 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});

	const insertLikes = async (recipient, actor, count) => {
		const likedPosts = await UserPostModel.insertMany(
			Array.from({ length: count }, () => {
				postCounter += 1;

				return {
					imageIdentifier: `liked-post-${postCounter}`,
					imageUrl: `https://cdn.example.com/liked-post-${postCounter}.jpg`,
					imageWidth: 100,
					imageHeight: 100,
					userId: recipient._id,
				};
			}),
		);

		return NotificationModel.insertMany(
			likedPosts.map((likedPost, index) => ({
				recipientId: recipient._id,
				actorId: actor._id,
				type: constants.NOTIFICATION_TYPES.POST_LIKE,
				userPostId: likedPost._id,
				createdAt: new Date(Date.now() - index * MINUTE_MS),
			})),
		);
	};

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), UserPostModel.init(), NotificationModel.init()]);

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
		await Promise.all([UserModel.deleteMany({}), UserPostModel.deleteMany({}), NotificationModel.deleteMany({})]);

		alice = await createUser('alice');
		bob = await createUser('bob');
	});

	describe.each([
		['GET /notifications/unread-count', (user) => get('/notifications/unread-count', user)],
		['GET /notifications', (user) => get('/notifications', user)],
		['POST /notifications/mark-all-read', (user) => markAllRead(user)],
	])('%s', (_name, request) => {
		it('answers 401 without a token', async () => {
			const response = await request();

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
		});
	});

	describe('GET /notifications/unread-count', () => {
		it('answers the number of unread notifications of the user', async () => {
			await insertLikes(alice, bob, 3);

			const response = await get('/notifications/unread-count', alice);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual({ count: 3 });
		});

		it('does not count the notifications of someone else', async () => {
			await insertLikes(alice, bob, 3);

			await expect((await get('/notifications/unread-count', bob)).json()).resolves.toEqual({ count: 0 });
		});
	});

	describe('GET /notifications', () => {
		it('answers the first page with the shape the client reads', async () => {
			await insertLikes(alice, bob, 1);

			const response = await get('/notifications', alice);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body).toMatchObject({
				hasMore: false,
				nextCursor: null,
				notifications: [
					{
						type: 'post-like',
						actor: { username: 'bob' },
						post: { imageUrl: expect.stringContaining('https://cdn.example.com/liked-post-') },
						excerpt: null,
					},
				],
			});
			expect(typeof body.unreadSince).toBe('string');
		});

		it('stamps every page with the server time taken when the call started', async () => {
			await insertLikes(alice, bob, 23);
			const before = Date.now();

			const first = await (await get('/notifications', alice)).json();
			const second = await (await get(`/notifications?cursor=${encodeURIComponent(first.nextCursor)}`, alice)).json();

			expect(new Date(first.fetchedAt).getTime()).toBeGreaterThanOrEqual(before);
			expect(new Date(first.fetchedAt).getTime()).toBeLessThanOrEqual(Date.now());
			expect(typeof second.fetchedAt).toBe('string');
		});

		it('stamps an empty list with fetchedAt too', async () => {
			const body = await (await get('/notifications', alice)).json();

			expect(body).toMatchObject({ notifications: [], unreadSince: null });
			expect(typeof body.fetchedAt).toBe('string');
		});

		it('is visible only to the recipient', async () => {
			await insertLikes(alice, bob, 2);

			const body = await (await get('/notifications', bob)).json();

			expect(body.notifications).toEqual([]);
		});

		it('pages with the cursor: 20, then the rest, without unreadSince on the second page', async () => {
			await insertLikes(alice, bob, 23);

			const first = await (await get('/notifications', alice)).json();
			const second = await (await get(`/notifications?cursor=${encodeURIComponent(first.nextCursor)}`, alice)).json();

			expect(first.notifications).toHaveLength(20);
			expect(first.hasMore).toBe(true);
			expect(second.notifications).toHaveLength(3);
			expect(second.hasMore).toBe(false);
			expect(second).not.toHaveProperty('unreadSince');
		});

		it('answers 400 for a malformed cursor', async () => {
			const response = await get('/notifications?cursor=garbage', alice);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.BAD_REQUEST });
		});

		it('answers 400 for a repeated cursor parameter', async () => {
			const response = await get('/notifications?cursor=a&cursor=b', alice);

			expect(response.status).toBe(400);
		});

		it('survives a notification whose actor and post are gone', async () => {
			await insertLikes(alice, bob, 2);
			await UserModel.deleteOne({ _id: bob._id });

			const response = await get('/notifications', alice);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ notifications: [], hasMore: false });
		});
	});

	describe('POST /notifications/mark-all-read', () => {
		it('answers 204 and clears the unread count of the user', async () => {
			await insertLikes(alice, bob, 3);

			const response = await markAllRead(alice);

			expect(response.status).toBe(204);
			await expect((await get('/notifications/unread-count', alice)).json()).resolves.toEqual({ count: 0 });
		});

		it('leaves the unread notifications of other users alone', async () => {
			await insertLikes(alice, bob, 1);
			await insertLikes(bob, alice, 2);

			await markAllRead(alice);

			await expect((await get('/notifications/unread-count', bob)).json()).resolves.toEqual({ count: 2 });
		});

		it('keeps the notifications created after the cutoff unread', async () => {
			await insertLikes(alice, bob, 3);
			const { fetchedAt } = await (await get('/notifications', alice)).json();
			await NotificationModel.create({
				recipientId: alice._id,
				actorId: bob._id,
				type: constants.NOTIFICATION_TYPES.FOLLOW,
				createdAt: new Date(new Date(fetchedAt).getTime() + MINUTE_MS),
			});

			const response = await markAllRead(alice, { cutoff: fetchedAt });

			expect(response.status).toBe(204);
			await expect((await get('/notifications/unread-count', alice)).json()).resolves.toEqual({ count: 1 });
		});

		it('posts the cutoff of an empty list and leaves the later arrival unread', async () => {
			const { fetchedAt, notifications } = await (await get('/notifications', alice)).json();
			await insertLikes(alice, bob, 1);
			await NotificationModel.updateMany({}, { $set: { createdAt: new Date(new Date(fetchedAt).getTime() + MINUTE_MS) } });

			const response = await markAllRead(alice, { cutoff: fetchedAt });

			expect(notifications).toEqual([]);
			expect(response.status).toBe(204);
			await expect((await get('/notifications/unread-count', alice)).json()).resolves.toEqual({ count: 1 });
		});

		it('clears the dot when the list is empty and the cutoff is valid', async () => {
			const { fetchedAt } = await (await get('/notifications', alice)).json();

			const response = await markAllRead(alice, { cutoff: fetchedAt });

			expect(response.status).toBe(204);
			await expect((await get('/notifications/unread-count', alice)).json()).resolves.toEqual({ count: 0 });
		});

		it.each([
			['missing', {}],
			['an empty string', { cutoff: '' }],
			['not a date', { cutoff: 'yesterday' }],
			['a number', { cutoff: 1700000000000 }],
			['null', { cutoff: null }],
			['an array', { cutoff: ['2026-01-01T00:00:00.000Z'] }],
		])('answers 400 and marks nothing when the cutoff is %s', async (_name, body) => {
			await insertLikes(alice, bob, 2);

			const response = await markAllRead(alice, body);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.BAD_REQUEST });
			await expect((await get('/notifications/unread-count', alice)).json()).resolves.toEqual({ count: 2 });
		});

		it('answers 400 when the request has no body at all', async () => {
			const response = await fetch(`${baseUrl}/notifications/mark-all-read`, { method: 'POST', headers: authHeaders(alice) });

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.BAD_REQUEST });
		});
	});
});
