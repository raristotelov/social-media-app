jest.mock('../services', () => ({
	userService: {},
	userPostService: {},
	commentService: {},
	storyService: {
		addStory: jest.fn(),
		getStoryTray: jest.fn(),
		getUserStories: jest.fn(),
		recordStoryView: jest.fn(),
		getStoryViewers: jest.fn(),
		deleteStory: jest.fn(),
	},
}));

const express = require('express');
const JWT = require('jsonwebtoken');

const { storyService } = require('../services');
const storyController = require('./storyController');
const errorHandler = require('../middlewares/errorHandler');
const constants = require('../config/constants');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const AUTHOR_ID = '64b7f0a1c2d3e4f5a6b7c8d2';
const STORY_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const JWT_SECRET = 'story-routes-test-secret';

const buildImageBlob = (byteLength) => {
	const bytes = new Uint8Array(byteLength);

	bytes.set(JPEG_HEADER);

	return new Blob([bytes], { type: 'image/jpeg' });
};

const buildFormData = ({ fieldName, byteLength = 1024 }) => {
	const formData = new FormData();

	formData.append(fieldName, buildImageBlob(byteLength), 'photo.jpg');

	return formData;
};

describe('story routes', () => {
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
		app.use('/stories', storyController);
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
		storyService.addStory.mockResolvedValue({ _id: STORY_ID });
		storyService.getStoryTray.mockResolvedValue([{ isOwn: true }]);
		storyService.getUserStories.mockResolvedValue({ user: { _id: AUTHOR_ID }, stories: [] });
		storyService.recordStoryView.mockResolvedValue(undefined);
		storyService.getStoryViewers.mockResolvedValue([{ _id: AUTHOR_ID, username: 'viewer' }]);
		storyService.deleteStory.mockResolvedValue(undefined);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('authentication', () => {
		it.each([
			['POST', '/stories'],
			['GET', '/stories/tray'],
			['GET', `/stories/user/${AUTHOR_ID}`],
			['POST', `/stories/${STORY_ID}/view`],
			['GET', `/stories/${STORY_ID}/viewers`],
			['DELETE', `/stories/${STORY_ID}`],
		])('answers 401 UNAUTHENTICATED to %s %s without a token, without calling the service', async (method, path) => {
			const response = await fetch(`${baseUrl}${path}`, { method });
			const body = await response.json();

			expect(response.status).toBe(401);
			expect(body.code).toBe(ERROR_CODES.UNAUTHENTICATED);
			Object.values(storyService).forEach((serviceMethod) => expect(serviceMethod).not.toHaveBeenCalled());
		});
	});

	describe('POST /stories', () => {
		const url = () => `${baseUrl}/stories`;

		it('hands the uploaded picture and the user to addStory and answers 200 with the story', async () => {
			const response = await fetch(url(), {
				method: 'POST',
				headers: authHeaders(),
				body: buildFormData({ fieldName: constants.STORY_IMAGE_FIELD }),
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ _id: STORY_ID });
			expect(storyService.addStory).toHaveBeenCalledWith(
				{ imageFile: expect.objectContaining({ fieldname: constants.STORY_IMAGE_FIELD }) },
				USER_ID,
			);
		});

		it('answers 413 IMAGE_TOO_LARGE for a picture over the size limit, without calling addStory', async () => {
			const response = await fetch(url(), {
				method: 'POST',
				headers: authHeaders(),
				body: buildFormData({ fieldName: constants.STORY_IMAGE_FIELD, byteLength: constants.MAX_IMAGE_BYTES + 1 }),
			});

			expect(response.status).toBe(413);
			expect(storyService.addStory).not.toHaveBeenCalled();
		});

		it('passes a service error through with its status and code', async () => {
			storyService.addStory.mockRejectedValue(new AppError('Image is required', 400, { code: ERROR_CODES.BAD_REQUEST }));

			const response = await fetch(url(), { method: 'POST', headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.code).toBe(ERROR_CODES.BAD_REQUEST);
		});
	});

	describe('GET /stories/tray', () => {
		it('answers 200 with the tray of the signed-in user', async () => {
			const response = await fetch(`${baseUrl}/stories/tray`, { headers: authHeaders() });

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual([{ isOwn: true }]);
			expect(storyService.getStoryTray).toHaveBeenCalledWith(USER_ID);
		});

		it('is not mistaken for a story id', async () => {
			await fetch(`${baseUrl}/stories/tray`, { headers: authHeaders() });

			expect(storyService.getUserStories).not.toHaveBeenCalled();
			expect(storyService.deleteStory).not.toHaveBeenCalled();
		});
	});

	describe('GET /stories/user/:userId', () => {
		it("asks for the author's stories on behalf of the signed-in user", async () => {
			const response = await fetch(`${baseUrl}/stories/user/${AUTHOR_ID}`, { headers: authHeaders() });

			expect(response.status).toBe(200);
			expect(storyService.getUserStories).toHaveBeenCalledWith({ authorId: AUTHOR_ID, requesterId: USER_ID });
		});

		it('answers 404 USER_NOT_FOUND when the service says so', async () => {
			storyService.getUserStories.mockRejectedValue(new AppError('User not found', 404, { code: ERROR_CODES.USER_NOT_FOUND }));

			const response = await fetch(`${baseUrl}/stories/user/${AUTHOR_ID}`, { headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.code).toBe(ERROR_CODES.USER_NOT_FOUND);
		});
	});

	describe('POST /stories/:storyId/view', () => {
		it('records the view for the signed-in user and answers 204 with no body', async () => {
			const response = await fetch(`${baseUrl}/stories/${STORY_ID}/view`, { method: 'POST', headers: authHeaders() });

			expect(response.status).toBe(204);
			expect(await response.text()).toBe('');
			expect(storyService.recordStoryView).toHaveBeenCalledWith({ storyId: STORY_ID, viewerId: USER_ID });
		});

		it('answers 404 STORY_NOT_FOUND when the story is gone', async () => {
			storyService.recordStoryView.mockRejectedValue(new AppError('Story not found', 404, { code: ERROR_CODES.STORY_NOT_FOUND }));

			const response = await fetch(`${baseUrl}/stories/${STORY_ID}/view`, { method: 'POST', headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.code).toBe(ERROR_CODES.STORY_NOT_FOUND);
		});
	});

	describe('GET /stories/:storyId/viewers', () => {
		it('answers 200 with the viewers for the signed-in user', async () => {
			const response = await fetch(`${baseUrl}/stories/${STORY_ID}/viewers`, { headers: authHeaders() });

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual([{ _id: AUTHOR_ID, username: 'viewer' }]);
			expect(storyService.getStoryViewers).toHaveBeenCalledWith({ storyId: STORY_ID, userId: USER_ID });
		});

		it('answers 403 STORY_FORBIDDEN to someone who does not own the story', async () => {
			storyService.getStoryViewers.mockRejectedValue(new AppError('Forbidden', 403, { code: ERROR_CODES.STORY_FORBIDDEN }));

			const response = await fetch(`${baseUrl}/stories/${STORY_ID}/viewers`, { headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(403);
			expect(body.code).toBe(ERROR_CODES.STORY_FORBIDDEN);
		});
	});

	describe('DELETE /stories/:storyId', () => {
		it('deletes for the signed-in user and answers 204 with no body', async () => {
			const response = await fetch(`${baseUrl}/stories/${STORY_ID}`, { method: 'DELETE', headers: authHeaders() });

			expect(response.status).toBe(204);
			expect(await response.text()).toBe('');
			expect(storyService.deleteStory).toHaveBeenCalledWith({ storyId: STORY_ID, userId: USER_ID });
		});

		it('answers 403 STORY_FORBIDDEN when the story is not theirs', async () => {
			storyService.deleteStory.mockRejectedValue(new AppError('Forbidden', 403, { code: ERROR_CODES.STORY_FORBIDDEN }));

			const response = await fetch(`${baseUrl}/stories/${STORY_ID}`, { method: 'DELETE', headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(403);
			expect(body.code).toBe(ERROR_CODES.STORY_FORBIDDEN);
		});

		it('answers 404 STORY_NOT_FOUND when the story is gone', async () => {
			storyService.deleteStory.mockRejectedValue(new AppError('Story not found', 404, { code: ERROR_CODES.STORY_NOT_FOUND }));

			const response = await fetch(`${baseUrl}/stories/${STORY_ID}`, { method: 'DELETE', headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.code).toBe(ERROR_CODES.STORY_NOT_FOUND);
		});
	});
});
