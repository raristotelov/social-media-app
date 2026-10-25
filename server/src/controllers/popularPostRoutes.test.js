jest.mock('../services', () => ({
	userService: {},
	userPostService: {},
	commentService: {},
	popularPostService: {
		getPopularPosts: jest.fn(),
		getNextPopularPosts: jest.fn(),
	},
}));

const express = require('express');
const JWT = require('jsonwebtoken');
const mongoose = require('mongoose');

const { popularPostService } = require('../services');
const userPostController = require('./userPostController');
const errorHandler = require('../middlewares/errorHandler');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');
const { POPULAR_BODY_LIMIT_BYTES, MAX_SHOWN_POST_IDS } = require('../config/popularPosts');

const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const POST_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
const SNAPSHOT_TIME = '2026-10-24T12:00:00.000Z';
const JWT_SECRET = 'popular-post-routes-test-secret';

const POPULAR_RESULT = { posts: [{ _id: POST_ID }], snapshotTime: SNAPSHOT_TIME, hasMore: true };

describe('popular post routes', () => {
	let server;
	let baseUrl;
	let originalJwtSecret;
	let consoleErrorSpy;

	const authHeaders = () => ({ 'X-Authorization': JWT.sign({ userId: USER_ID, username: 'realuser' }, JWT_SECRET) });

	const postPopular = (body, headers = {}) =>
		fetch(`${baseUrl}/user-posts/popular`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: typeof body === 'string' ? body : JSON.stringify(body),
		});

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		const app = express();

		app.post('/user-posts/popular', express.json({ limit: POPULAR_BODY_LIMIT_BYTES }));
		app.use(express.json());
		app.use('/user-posts', userPostController);
		app.use(errorHandler);

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
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		popularPostService.getPopularPosts.mockResolvedValue(POPULAR_RESULT);
		popularPostService.getNextPopularPosts.mockResolvedValue(POPULAR_RESULT);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('GET /user-posts/popular', () => {
		it('answers 200 with the first page to a guest, without a token', async () => {
			const response = await fetch(`${baseUrl}/user-posts/popular`);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(POPULAR_RESULT);
		});

		it('asks the service for a guest with no user id and no first post', async () => {
			await fetch(`${baseUrl}/user-posts/popular`);

			expect(popularPostService.getPopularPosts).toHaveBeenCalledWith({ userId: undefined, firstPostId: undefined });
		});

		it('asks the service on behalf of the signed-in user when a valid token is sent', async () => {
			await fetch(`${baseUrl}/user-posts/popular`, { headers: authHeaders() });

			expect(popularPostService.getPopularPosts).toHaveBeenCalledWith({ userId: USER_ID, firstPostId: undefined });
		});

		it('treats a token signed with the wrong secret as a guest instead of refusing it', async () => {
			const response = await fetch(`${baseUrl}/user-posts/popular`, {
				headers: { 'X-Authorization': JWT.sign({ userId: USER_ID }, 'another-secret') },
			});

			expect(response.status).toBe(200);
			expect(popularPostService.getPopularPosts).toHaveBeenCalledWith({ userId: undefined, firstPostId: undefined });
		});

		it('treats a garbage token as a guest', async () => {
			const response = await fetch(`${baseUrl}/user-posts/popular`, { headers: { 'X-Authorization': 'not-a-token' } });

			expect(response.status).toBe(200);
			expect(popularPostService.getPopularPosts).toHaveBeenCalledWith({ userId: undefined, firstPostId: undefined });
		});

		it('passes the firstPostId query parameter on to the service', async () => {
			await fetch(`${baseUrl}/user-posts/popular?firstPostId=${POST_ID}`);

			expect(popularPostService.getPopularPosts).toHaveBeenCalledWith({ userId: undefined, firstPostId: POST_ID });
		});

		it('does not ask for the next batch', async () => {
			await fetch(`${baseUrl}/user-posts/popular`);

			expect(popularPostService.getNextPopularPosts).not.toHaveBeenCalled();
		});

		it('answers 404 POST_NOT_FOUND when the service rejects the first post', async () => {
			popularPostService.getPopularPosts.mockRejectedValue(new AppError('Post not found', 404, { code: ERROR_CODES.POST_NOT_FOUND }));

			const response = await fetch(`${baseUrl}/user-posts/popular?firstPostId=gone`);
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.code).toBe(ERROR_CODES.POST_NOT_FOUND);
		});

		it('answers 401 UNAUTHENTICATED when the account in the token was deleted', async () => {
			popularPostService.getPopularPosts.mockRejectedValue(new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED }));

			const response = await fetch(`${baseUrl}/user-posts/popular`, { headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(401);
			expect(body.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		});

		it('answers 500 INTERNAL_ERROR without leaking the cause when the service fails', async () => {
			popularPostService.getPopularPosts.mockRejectedValue(
				new AppError('Could not load popular posts', 500, { cause: new Error('db password') }),
			);

			const response = await fetch(`${baseUrl}/user-posts/popular`);
			const body = await response.json();

			expect(response.status).toBe(500);
			expect(body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
			expect(JSON.stringify(body)).not.toContain('db password');
		});
	});

	describe('POST /user-posts/popular', () => {
		it('answers 200 with the next batch to a guest, without a token', async () => {
			const response = await postPopular({ snapshotTime: SNAPSHOT_TIME, shownPostIds: [POST_ID] });

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(POPULAR_RESULT);
		});

		it('passes the snapshot time and the shown ids on to the service for a guest', async () => {
			await postPopular({ snapshotTime: SNAPSHOT_TIME, shownPostIds: [POST_ID] });

			expect(popularPostService.getNextPopularPosts).toHaveBeenCalledWith({
				userId: undefined,
				snapshotTime: SNAPSHOT_TIME,
				shownPostIds: [POST_ID],
			});
		});

		it('asks the service on behalf of the signed-in user when a valid token is sent', async () => {
			await postPopular({ snapshotTime: SNAPSHOT_TIME, shownPostIds: [] }, authHeaders());

			expect(popularPostService.getNextPopularPosts).toHaveBeenCalledWith({
				userId: USER_ID,
				snapshotTime: SNAPSHOT_TIME,
				shownPostIds: [],
			});
		});

		it('treats a token signed with the wrong secret as a guest', async () => {
			const response = await postPopular(
				{ snapshotTime: SNAPSHOT_TIME, shownPostIds: [] },
				{ 'X-Authorization': JWT.sign({ userId: USER_ID }, 'another-secret') },
			);

			expect(response.status).toBe(200);
			expect(popularPostService.getNextPopularPosts).toHaveBeenCalledWith(expect.objectContaining({ userId: undefined }));
		});

		it('passes undefined values on to the service when the body is empty, leaving the 400 to the service', async () => {
			await fetch(`${baseUrl}/user-posts/popular`, { method: 'POST' });

			expect(popularPostService.getNextPopularPosts).toHaveBeenCalledWith({
				userId: undefined,
				snapshotTime: undefined,
				shownPostIds: undefined,
			});
		});

		it('does not ask for the first page', async () => {
			await postPopular({ snapshotTime: SNAPSHOT_TIME, shownPostIds: [] });

			expect(popularPostService.getPopularPosts).not.toHaveBeenCalled();
		});

		it('answers 400 BAD_REQUEST when the service rejects the input', async () => {
			popularPostService.getNextPopularPosts.mockRejectedValue(
				new AppError('snapshotTime must be a valid date', 400, { code: ERROR_CODES.BAD_REQUEST }),
			);

			const response = await postPopular({ snapshotTime: 'nope', shownPostIds: [] });
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.code).toBe(ERROR_CODES.BAD_REQUEST);
		});

		it('answers 400 BAD_REQUEST to a body that is not valid JSON, without calling the service', async () => {
			const response = await postPopular('{"snapshotTime": ');
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.code).toBe(ERROR_CODES.BAD_REQUEST);
			expect(popularPostService.getNextPopularPosts).not.toHaveBeenCalled();
		});

		it('answers 401 UNAUTHENTICATED when the account in the token was deleted', async () => {
			popularPostService.getNextPopularPosts.mockRejectedValue(new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED }));

			const response = await postPopular({ snapshotTime: SNAPSHOT_TIME, shownPostIds: [] }, authHeaders());
			const body = await response.json();

			expect(response.status).toBe(401);
			expect(body.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		});

		it('answers 500 INTERNAL_ERROR without leaking the cause when the service fails', async () => {
			popularPostService.getNextPopularPosts.mockRejectedValue(
				new AppError('Could not load popular posts', 500, { cause: new Error('db password') }),
			);

			const response = await postPopular({ snapshotTime: SNAPSHOT_TIME, shownPostIds: [] });
			const body = await response.json();

			expect(response.status).toBe(500);
			expect(body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
			expect(JSON.stringify(body)).not.toContain('db password');
		});

		describe('the body size limit', () => {
			const buildIds = (count) => Array.from({ length: count }, () => new mongoose.Types.ObjectId().toString());

			it('accepts a body carrying the maximum of 10000 shown post ids', async () => {
				const response = await postPopular({ snapshotTime: SNAPSHOT_TIME, shownPostIds: buildIds(MAX_SHOWN_POST_IDS) });

				expect(response.status).toBe(200);
				expect(popularPostService.getNextPopularPosts.mock.calls[0][0].shownPostIds).toHaveLength(MAX_SHOWN_POST_IDS);
			});

			it('answers 413 BAD_REQUEST to a body over the limit, without calling the service', async () => {
				const response = await postPopular({ snapshotTime: SNAPSHOT_TIME, shownPostIds: buildIds(MAX_SHOWN_POST_IDS * 2) });
				const body = await response.json();

				expect(response.status).toBe(413);
				expect(body.code).toBe(ERROR_CODES.BAD_REQUEST);
				expect(popularPostService.getNextPopularPosts).not.toHaveBeenCalled();
			});
		});
	});
});
