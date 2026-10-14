jest.mock('../services', () => ({
	userService: { updateUserProfileData: jest.fn() },
	userPostService: { addUserPost: jest.fn() },
	commentService: {},
}));

const express = require('express');
const JWT = require('jsonwebtoken');

const { userService, userPostService } = require('../services');
const userController = require('./userController');
const userPostController = require('./userPostController');
const errorHandler = require('../middlewares/errorHandler');
const constants = require('../config/constants');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const JWT_SECRET = 'upload-routes-test-secret';

const buildImageBlob = (byteLength) => {
	const bytes = new Uint8Array(byteLength);

	bytes.set(JPEG_HEADER);

	return new Blob([bytes], { type: 'image/jpeg' });
};

const buildFormData = ({ fieldName, byteLength = 1024, extraFields = {} }) => {
	const formData = new FormData();

	Object.entries(extraFields).forEach(([name, value]) => formData.append(name, value));
	formData.append(fieldName, buildImageBlob(byteLength), 'photo.jpg');

	return formData;
};

describe('upload routes', () => {
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
		app.use('/users', userController);
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
		jest.clearAllMocks();
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		userPostService.addUserPost.mockResolvedValue({ _id: 'post1', caption: 'Sunset' });
		userService.updateUserProfileData.mockResolvedValue({ user: { _id: USER_ID }, jwt: 'token' });
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('POST /user-posts', () => {
		const url = () => `${baseUrl}/user-posts`;

		it('hands the uploaded image and the caption to addUserPost for an authenticated request', async () => {
			const response = await fetch(url(), {
				method: 'POST',
				headers: authHeaders(),
				body: buildFormData({ fieldName: constants.POST_IMAGE_FIELD, extraFields: { caption: 'Sunset' } }),
			});

			expect(response.status).toBe(200);
			expect(userPostService.addUserPost).toHaveBeenCalledTimes(1);

			const [{ caption, imageFile }, userId] = userPostService.addUserPost.mock.calls[0];

			expect(caption).toBe('Sunset');
			expect(imageFile).toMatchObject({ fieldname: 'image', originalname: 'photo.jpg', size: 1024 });
			expect(Buffer.isBuffer(imageFile.buffer)).toBe(true);
			expect(userId).toBe(USER_ID);
		});

		it('answers 401 without a token and never calls the service', async () => {
			const response = await fetch(url(), { method: 'POST', body: buildFormData({ fieldName: constants.POST_IMAGE_FIELD }) });

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
			expect(userPostService.addUserPost).not.toHaveBeenCalled();
		});

		it('checks the token before parsing the upload, so an unauthenticated oversized file gets 401, not 413', async () => {
			const response = await fetch(url(), {
				method: 'POST',
				body: buildFormData({ fieldName: constants.POST_IMAGE_FIELD, byteLength: constants.MAX_IMAGE_BYTES + 1 }),
			});

			expect(response.status).toBe(401);
		});

		it('answers 401 for an invalid token and never calls the service', async () => {
			const response = await fetch(url(), {
				method: 'POST',
				headers: { 'X-Authorization': 'not.a.valid.token' },
				body: buildFormData({ fieldName: constants.POST_IMAGE_FIELD }),
			});

			expect(response.status).toBe(401);
			expect(userPostService.addUserPost).not.toHaveBeenCalled();
		});

		it('answers 413 IMAGE_TOO_LARGE for an authenticated oversized file and never calls the service', async () => {
			const response = await fetch(url(), {
				method: 'POST',
				headers: authHeaders(),
				body: buildFormData({ fieldName: constants.POST_IMAGE_FIELD, byteLength: constants.MAX_IMAGE_BYTES + 1 }),
			});

			expect(response.status).toBe(413);
			await expect(response.json()).resolves.toMatchObject({ fields: { image: ERROR_CODES.IMAGE_TOO_LARGE } });
			expect(userPostService.addUserPost).not.toHaveBeenCalled();
		});

		it('passes a request with no file to the service with an undefined imageFile', async () => {
			const formData = new FormData();

			formData.append('caption', 'no picture');

			await fetch(url(), { method: 'POST', headers: authHeaders(), body: formData });

			expect(userPostService.addUserPost).toHaveBeenCalledWith({ caption: 'no picture', imageFile: undefined }, USER_ID);
		});
	});

	describe('PATCH /users/update/:userId', () => {
		const url = () => `${baseUrl}/users/update/${USER_ID}`;

		it('hands the uploaded picture and the text fields to updateUserProfileData for an authenticated request', async () => {
			const response = await fetch(url(), {
				method: 'PATCH',
				headers: authHeaders(),
				body: buildFormData({ fieldName: constants.PROFILE_PICTURE_FIELD, extraFields: { bio: 'New bio' } }),
			});

			expect(response.status).toBe(200);

			const [userId, body, file] = userService.updateUserProfileData.mock.calls[0];

			expect(userId).toBe(USER_ID);
			expect(body).toEqual({ bio: 'New bio' });
			expect(file).toMatchObject({ fieldname: 'profilePicture', originalname: 'photo.jpg', size: 1024 });
		});

		it('still accepts a JSON body (picture removal) with no file', async () => {
			const response = await fetch(url(), {
				method: 'PATCH',
				headers: { ...authHeaders(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ profilePicture: null }),
			});

			expect(response.status).toBe(200);
			expect(userService.updateUserProfileData).toHaveBeenCalledWith(USER_ID, { profilePicture: null }, undefined);
		});

		it('forwards a disallowed field to the service untouched and relays its 400 BAD_REQUEST', async () => {
			userService.updateUserProfileData.mockRejectedValue(
				new AppError('Only profile fields can be updated', 400, { code: ERROR_CODES.BAD_REQUEST }),
			);

			const response = await fetch(url(), {
				method: 'PATCH',
				headers: { ...authHeaders(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ followers: ['someone'], bio: 'New bio' }),
			});

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.BAD_REQUEST });
			expect(userService.updateUserProfileData).toHaveBeenCalledWith(USER_ID, { followers: ['someone'], bio: 'New bio' }, undefined);
		});

		it('relays a 404 USER_NOT_FOUND from the service', async () => {
			userService.updateUserProfileData.mockRejectedValue(new AppError('User not found', 404, { code: ERROR_CODES.USER_NOT_FOUND }));

			const response = await fetch(url(), {
				method: 'PATCH',
				headers: { ...authHeaders(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ bio: 'New bio' }),
			});

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.USER_NOT_FOUND });
		});

		it('answers 401 without a token and never calls the service', async () => {
			const response = await fetch(url(), { method: 'PATCH', body: buildFormData({ fieldName: constants.PROFILE_PICTURE_FIELD }) });

			expect(response.status).toBe(401);
			expect(userService.updateUserProfileData).not.toHaveBeenCalled();
		});

		it('checks the token before parsing the upload, so an unauthenticated oversized file gets 401, not 413', async () => {
			const response = await fetch(url(), {
				method: 'PATCH',
				body: buildFormData({ fieldName: constants.PROFILE_PICTURE_FIELD, byteLength: constants.MAX_IMAGE_BYTES + 1 }),
			});

			expect(response.status).toBe(401);
		});

		it('answers 413 IMAGE_TOO_LARGE keyed by profilePicture for an authenticated oversized file', async () => {
			const response = await fetch(url(), {
				method: 'PATCH',
				headers: authHeaders(),
				body: buildFormData({ fieldName: constants.PROFILE_PICTURE_FIELD, byteLength: constants.MAX_IMAGE_BYTES + 1 }),
			});

			expect(response.status).toBe(413);
			await expect(response.json()).resolves.toMatchObject({ fields: { profilePicture: ERROR_CODES.IMAGE_TOO_LARGE } });
			expect(userService.updateUserProfileData).not.toHaveBeenCalled();
		});
	});
});
