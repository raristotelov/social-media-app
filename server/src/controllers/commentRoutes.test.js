jest.mock('../services', () => ({
	userService: {},
	userPostService: {},
	commentService: {
		addComment: jest.fn(),
		getCommentsForPost: jest.fn(),
		likeComment: jest.fn(),
		unlikeComment: jest.fn(),
	},
}));

const express = require('express');
const JWT = require('jsonwebtoken');

const { commentService } = require('../services');
const commentController = require('./commentController');
const errorHandler = require('../middlewares/errorHandler');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const POST_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
const COMMENT_ID = '64b7f0a1c2d3e4f5a6b7c8f1';
const JWT_SECRET = 'comment-routes-test-secret';

describe('comment routes', () => {
	let server;
	let baseUrl;
	let originalJwtSecret;
	let consoleErrorSpy;

	const authHeaders = () => ({ 'X-Authorization': JWT.sign({ userId: USER_ID, username: 'realuser' }, JWT_SECRET) });

	const postJson = (path, body, headers = {}) =>
		fetch(`${baseUrl}${path}`, {
			method: 'POST',
			headers: { ...headers, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		const app = express();

		app.use(express.json());
		app.use('/comments', commentController);
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
		commentService.addComment.mockResolvedValue({ _id: COMMENT_ID });
		commentService.getCommentsForPost.mockResolvedValue([{ _id: COMMENT_ID, replies: [] }]);
		commentService.likeComment.mockResolvedValue({ _id: COMMENT_ID, likes: [USER_ID] });
		commentService.unlikeComment.mockResolvedValue({ _id: COMMENT_ID, likes: [] });
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('GET /comments/post/:userPostId', () => {
		it('is public: answers 200 with the comments when there is no token', async () => {
			const response = await fetch(`${baseUrl}/comments/post/${POST_ID}`);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual([{ _id: COMMENT_ID, replies: [] }]);
		});

		it('loads the comments of the post named in the path', async () => {
			await fetch(`${baseUrl}/comments/post/${POST_ID}`);

			expect(commentService.getCommentsForPost).toHaveBeenCalledWith({ userPostId: POST_ID });
		});

		it('answers 200 for a logged-in user as well', async () => {
			const response = await fetch(`${baseUrl}/comments/post/${POST_ID}`, { headers: authHeaders() });

			expect(response.status).toBe(200);
		});

		it('answers 200 for a guest who sends an expired or invalid token', async () => {
			const response = await fetch(`${baseUrl}/comments/post/${POST_ID}`, { headers: { 'X-Authorization': 'not-a-token' } });

			expect(response.status).toBe(200);
		});

		it('answers 404 POST_NOT_FOUND when the post is missing or malformed', async () => {
			commentService.getCommentsForPost.mockRejectedValue(new AppError('Post not found', 404, { code: ERROR_CODES.POST_NOT_FOUND }));

			const response = await fetch(`${baseUrl}/comments/post/${POST_ID}`);

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.POST_NOT_FOUND });
		});

		it('answers 500 with the generic code for an unexpected failure', async () => {
			commentService.getCommentsForPost.mockRejectedValue(new AppError('Could not load comments', 500));

			const response = await fetch(`${baseUrl}/comments/post/${POST_ID}`);

			expect(response.status).toBe(500);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.INTERNAL_ERROR });
		});
	});

	describe('POST /comments', () => {
		it('answers 401 UNAUTHENTICATED without a token and adds nothing', async () => {
			const response = await postJson('/comments', { userPostId: POST_ID, text: 'Hi' });

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
			expect(commentService.addComment).not.toHaveBeenCalled();
		});

		it('answers 401 for an invalid token', async () => {
			const response = await postJson('/comments', { userPostId: POST_ID, text: 'Hi' }, { 'X-Authorization': 'not-a-token' });

			expect(response.status).toBe(401);
			expect(commentService.addComment).not.toHaveBeenCalled();
		});

		it('adds the comment as the user in the token, never as a user named in the body', async () => {
			await postJson('/comments', { userPostId: POST_ID, text: 'Hi', userId: 'someone-else' }, authHeaders());

			expect(commentService.addComment).toHaveBeenCalledWith({ userPostId: POST_ID, userId: USER_ID, text: 'Hi', parentCommentId: undefined });
		});

		it('passes the parent comment id of a reply on', async () => {
			await postJson('/comments', { userPostId: POST_ID, text: 'Thanks', parentCommentId: COMMENT_ID }, authHeaders());

			expect(commentService.addComment).toHaveBeenCalledWith({
				userPostId: POST_ID,
				userId: USER_ID,
				text: 'Thanks',
				parentCommentId: COMMENT_ID,
			});
		});

		it('answers 200 with the saved comment', async () => {
			const response = await postJson('/comments', { userPostId: POST_ID, text: 'Hi' }, authHeaders());

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual({ _id: COMMENT_ID });
		});

		it.each([
			['COMMENT_TEXT_REQUIRED', 400],
			['POST_NOT_FOUND', 404],
			['COMMENT_NOT_FOUND', 404],
		])('answers with the %s code and status %s that the service raised', async (code, status) => {
			commentService.addComment.mockRejectedValue(new AppError('rejected', status, { code }));

			const response = await postJson('/comments', { userPostId: POST_ID, text: 'Hi' }, authHeaders());

			expect(response.status).toBe(status);
			await expect(response.json()).resolves.toMatchObject({ code });
		});
	});

	describe.each([
		['like', 'likeComment'],
		['unlike', 'unlikeComment'],
	])('POST /comments/:commentId/%s', (action, serviceMethod) => {
		const send = (headers) => fetch(`${baseUrl}/comments/${COMMENT_ID}/${action}`, { method: 'POST', headers });

		it('answers 401 UNAUTHENTICATED without a token and changes nothing', async () => {
			const response = await send({});

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
			expect(commentService[serviceMethod]).not.toHaveBeenCalled();
		});

		it('acts as the user in the token on the comment in the path', async () => {
			const response = await send(authHeaders());

			expect(response.status).toBe(200);
			expect(commentService[serviceMethod]).toHaveBeenCalledWith({ commentId: COMMENT_ID, userId: USER_ID });
		});

		it('answers 404 COMMENT_NOT_FOUND when the comment is missing or malformed', async () => {
			commentService[serviceMethod].mockRejectedValue(new AppError('Comment not found', 404, { code: ERROR_CODES.COMMENT_NOT_FOUND }));

			const response = await send(authHeaders());

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.COMMENT_NOT_FOUND });
		});
	});
});
