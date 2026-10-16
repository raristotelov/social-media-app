jest.mock('../services', () => ({
	userService: {
		updateUserProfileData: jest.fn(),
		followUser: jest.fn(),
		unfollowUser: jest.fn(),
		getUsersProfileDataByUserIds: jest.fn(),
		getUsersProfileDataBySearchWord: jest.fn(),
		getFollowers: jest.fn(),
		getFollowing: jest.fn(),
	},
	userPostService: {},
	commentService: {},
}));

const express = require('express');
const JWT = require('jsonwebtoken');

const { userService } = require('../services');
const userController = require('./userController');
const errorHandler = require('../middlewares/errorHandler');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const OTHER_USER_ID = '64b7f0a1c2d3e4f5a6b7c8d2';
const JWT_SECRET = 'user-routes-test-secret';

describe('user routes', () => {
	let server;
	let baseUrl;
	let originalJwtSecret;
	let consoleErrorSpy;

	const authHeaders = (userId = USER_ID) => ({ 'X-Authorization': JWT.sign({ userId, username: 'realuser' }, JWT_SECRET) });

	const expectProfileForbidden = async (response) => {
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.PROFILE_FORBIDDEN });
	};

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		const app = express();

		app.use(express.json());
		app.use('/users', userController);
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
		userService.updateUserProfileData.mockResolvedValue({ user: { _id: USER_ID }, jwt: 'token' });
		userService.followUser.mockResolvedValue({ user: { _id: USER_ID }, jwt: 'token' });
		userService.unfollowUser.mockResolvedValue({ user: { _id: USER_ID }, jwt: 'token' });
		userService.getUsersProfileDataByUserIds.mockResolvedValue([]);
		userService.getUsersProfileDataBySearchWord.mockResolvedValue([]);
		userService.getFollowers.mockResolvedValue([]);
		userService.getFollowing.mockResolvedValue([]);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('PATCH /users/update/:userId', () => {
		const patchBio = (targetUserId, headers) =>
			fetch(`${baseUrl}/users/update/${targetUserId}`, {
				method: 'PATCH',
				headers: { ...headers, 'Content-Type': 'application/json' },
				body: JSON.stringify({ bio: 'Hijacked' }),
			});

		it("answers 403 PROFILE_FORBIDDEN for another user's id and never calls the service", async () => {
			const response = await patchBio(OTHER_USER_ID, authHeaders());

			await expectProfileForbidden(response);
			expect(userService.updateUserProfileData).not.toHaveBeenCalled();
		});

		it('updates the profile when the token user is the user in the path', async () => {
			const response = await patchBio(USER_ID, authHeaders());

			expect(response.status).toBe(200);
			expect(userService.updateUserProfileData).toHaveBeenCalledWith(USER_ID, { bio: 'Hijacked' }, undefined);
		});

		it('answers 401, not 403, when there is no token', async () => {
			const response = await patchBio(OTHER_USER_ID, {});

			expect(response.status).toBe(401);
		});
	});

	describe.each([
		['follow', 'followUser'],
		['unfollow', 'unfollowUser'],
	])('POST /users/:userId/%s/:targetId', (action, serviceMethod) => {
		const post = (actingUserId, headers) => fetch(`${baseUrl}/users/${actingUserId}/${action}/${OTHER_USER_ID}`, { method: 'POST', headers });

		it('answers 403 PROFILE_FORBIDDEN when acting as another user and never calls the service', async () => {
			const response = await post(OTHER_USER_ID, authHeaders());

			await expectProfileForbidden(response);
			expect(userService[serviceMethod]).not.toHaveBeenCalled();
		});

		it('answers 403 PROFILE_FORBIDDEN when a third user acts as the path user', async () => {
			const response = await post(USER_ID, authHeaders('64b7f0a1c2d3e4f5a6b7c8d3'));

			await expectProfileForbidden(response);
			expect(userService[serviceMethod]).not.toHaveBeenCalled();
		});

		it('calls the service when the token user is the user in the path', async () => {
			const response = await post(USER_ID, authHeaders());

			expect(response.status).toBe(200);
			expect(userService[serviceMethod]).toHaveBeenCalledWith(USER_ID, OTHER_USER_ID);
		});

		it('answers 401 without a token', async () => {
			const response = await post(USER_ID, {});

			expect(response.status).toBe(401);
			expect(userService[serviceMethod]).not.toHaveBeenCalled();
		});
	});

	describe('GET /users', () => {
		const getUsers = (headers) => fetch(`${baseUrl}/users?userIds=${USER_ID}`, { headers });

		it('answers a guest and passes no requester to the lookup', async () => {
			const response = await getUsers({});

			expect(response.status).toBe(200);
			expect(userService.getUsersProfileDataByUserIds).toHaveBeenCalledWith({ userIds: [USER_ID], requesterId: undefined });
		});

		it('passes the token user as the requester', async () => {
			await getUsers(authHeaders(OTHER_USER_ID));

			expect(userService.getUsersProfileDataByUserIds).toHaveBeenCalledWith({ userIds: [USER_ID], requesterId: OTHER_USER_ID });
		});

		it('treats an invalid token as a guest instead of rejecting the request', async () => {
			const response = await getUsers({ 'X-Authorization': 'not.a.valid.token' });

			expect(response.status).toBe(200);
			expect(userService.getUsersProfileDataByUserIds).toHaveBeenCalledWith({ userIds: [USER_ID], requesterId: undefined });
		});

		it('hands a search word to the search lookup', async () => {
			await fetch(`${baseUrl}/users?searchWord=jan`);

			expect(userService.getUsersProfileDataBySearchWord).toHaveBeenCalledWith({ searchWord: 'jan' });
		});
	});

	describe.each([
		['followers', 'getFollowers'],
		['following', 'getFollowing'],
	])('GET /users/:userId/%s', (listPath, serviceMethod) => {
		const rows = [{ _id: OTHER_USER_ID, username: 'janedoe', followersCount: 2 }];

		const getList = (headers) => fetch(`${baseUrl}/users/${USER_ID}/${listPath}`, { headers });

		it('is public: a guest gets the rows and no requester is passed', async () => {
			userService[serviceMethod].mockResolvedValue(rows);

			const response = await getList({});

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual(rows);
			expect(userService[serviceMethod]).toHaveBeenCalledWith({ userId: USER_ID, requesterId: undefined });
		});

		it('passes the token user as the requester', async () => {
			await getList(authHeaders(OTHER_USER_ID));

			expect(userService[serviceMethod]).toHaveBeenCalledWith({ userId: USER_ID, requesterId: OTHER_USER_ID });
		});

		it('treats an invalid token as a guest instead of rejecting the request', async () => {
			const response = await getList({ 'X-Authorization': 'not.a.valid.token' });

			expect(response.status).toBe(200);
			expect(userService[serviceMethod]).toHaveBeenCalledWith({ userId: USER_ID, requesterId: undefined });
		});

		it('relays a 404 USER_NOT_FOUND from the service', async () => {
			userService[serviceMethod].mockRejectedValue(new AppError('User not found', 404, { code: ERROR_CODES.USER_NOT_FOUND }));

			const response = await getList({});

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.USER_NOT_FOUND });
		});

		it('relays a 500 from the service', async () => {
			userService[serviceMethod].mockRejectedValue(new AppError('Could not load the users list', 500));

			const response = await getList({});

			expect(response.status).toBe(500);
		});
	});
});
