jest.mock('../services', () => ({
	userService: {},
	userPostService: {
		getAllUserPosts: jest.fn(),
		addUserPost: jest.fn(),
		getFollowedUsersPosts: jest.fn(),
		likeUserPost: jest.fn(),
		unlikeUserPost: jest.fn(),
		getUserPostLikes: jest.fn(),
		updateUserPostCaption: jest.fn(),
		deleteUserPost: jest.fn(),
	},
	commentService: {},
}));

const express = require('express');
const JWT = require('jsonwebtoken');

const { userPostService } = require('../services');
const userPostController = require('./userPostController');
const errorHandler = require('../middlewares/errorHandler');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const POST_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
const JWT_SECRET = 'user-post-routes-test-secret';

describe('user post routes', () => {
	let server;
	let baseUrl;
	let originalJwtSecret;
	let consoleErrorSpy;

	const authHeaders = () => ({ 'X-Authorization': JWT.sign({ userId: USER_ID, username: 'realuser' }, JWT_SECRET) });

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		const app = express();

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
		userPostService.getFollowedUsersPosts.mockResolvedValue([{ _id: POST_ID }]);
		userPostService.likeUserPost.mockResolvedValue({ _id: POST_ID, likes: [USER_ID] });
		userPostService.unlikeUserPost.mockResolvedValue({ _id: POST_ID, likes: [] });
		userPostService.getUserPostLikes.mockResolvedValue([{ _id: USER_ID, username: 'realuser' }]);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('GET /user-posts/followed-users-posts', () => {
		it('answers 401 UNAUTHENTICATED without a token and loads nothing', async () => {
			const response = await fetch(`${baseUrl}/user-posts/followed-users-posts`);

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
			expect(userPostService.getFollowedUsersPosts).not.toHaveBeenCalled();
		});

		it('loads the feed of the user in the token', async () => {
			const response = await fetch(`${baseUrl}/user-posts/followed-users-posts`, { headers: authHeaders() });

			expect(response.status).toBe(200);
			expect(userPostService.getFollowedUsersPosts).toHaveBeenCalledWith(USER_ID);
			await expect(response.json()).resolves.toEqual([{ _id: POST_ID }]);
		});

		it('is not swallowed by the :userPostId routes', async () => {
			await fetch(`${baseUrl}/user-posts/followed-users-posts`, { headers: authHeaders() });

			expect(userPostService.updateUserPostCaption).not.toHaveBeenCalled();
			expect(userPostService.deleteUserPost).not.toHaveBeenCalled();
		});
	});

	describe('GET /user-posts/:userPostId/likes', () => {
		it('is public: answers 200 with the accounts when there is no token', async () => {
			const response = await fetch(`${baseUrl}/user-posts/${POST_ID}/likes`);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual([{ _id: USER_ID, username: 'realuser' }]);
		});

		it('loads the likes of the post named in the path', async () => {
			await fetch(`${baseUrl}/user-posts/${POST_ID}/likes`);

			expect(userPostService.getUserPostLikes).toHaveBeenCalledWith({ userPostId: POST_ID });
		});

		it('answers 200 for a guest who sends an expired or invalid token', async () => {
			const response = await fetch(`${baseUrl}/user-posts/${POST_ID}/likes`, { headers: { 'X-Authorization': 'not-a-token' } });

			expect(response.status).toBe(200);
		});

		it('answers 200 with an empty list for a post nobody liked', async () => {
			userPostService.getUserPostLikes.mockResolvedValue([]);

			const response = await fetch(`${baseUrl}/user-posts/${POST_ID}/likes`);

			await expect(response.json()).resolves.toEqual([]);
		});

		it('answers 404 POST_NOT_FOUND when the post is missing or malformed', async () => {
			userPostService.getUserPostLikes.mockRejectedValue(new AppError('Post not found', 404, { code: ERROR_CODES.POST_NOT_FOUND }));

			const response = await fetch(`${baseUrl}/user-posts/${POST_ID}/likes`);

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.POST_NOT_FOUND });
		});

		it('answers 500 with the generic code for an unexpected failure', async () => {
			userPostService.getUserPostLikes.mockRejectedValue(new AppError('Could not load the likes', 500));

			const response = await fetch(`${baseUrl}/user-posts/${POST_ID}/likes`);

			expect(response.status).toBe(500);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.INTERNAL_ERROR });
		});
	});

	describe.each([
		['like', 'likeUserPost', 'userWhoLikedId'],
		['unlike', 'unlikeUserPost', 'userWhoUnlikedId'],
	])('POST /user-posts/%s/:userPostId', (action, serviceMethod, userKey) => {
		const send = (headers) => fetch(`${baseUrl}/user-posts/${action}/${POST_ID}`, { method: 'POST', headers });

		it('answers 401 UNAUTHENTICATED without a token and changes nothing', async () => {
			const response = await send({});

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
			expect(userPostService[serviceMethod]).not.toHaveBeenCalled();
		});

		it('acts as the user in the token on the post in the path', async () => {
			const response = await send(authHeaders());

			expect(response.status).toBe(200);
			expect(userPostService[serviceMethod]).toHaveBeenCalledWith({ userPostId: POST_ID, [userKey]: USER_ID });
		});

		it('answers 404 POST_NOT_FOUND, not 200 with null, when the post is missing or malformed', async () => {
			userPostService[serviceMethod].mockRejectedValue(new AppError('Post not found', 404, { code: ERROR_CODES.POST_NOT_FOUND }));

			const response = await send(authHeaders());

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.POST_NOT_FOUND });
		});
	});
});
