jest.mock('../models/storyModel');
jest.mock('../models/storyViewModel');
jest.mock('../models/userModel');
jest.mock('./imageStorageService', () => ({
	uploadImage: jest.fn(),
	deleteImage: jest.fn(),
	discardUploadedImage: jest.fn(),
}));

const StoryModel = require('../models/storyModel');
const StoryViewModel = require('../models/storyViewModel');
const UserModel = require('../models/userModel');
const imageStorageService = require('./imageStorageService');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const { addStory, getStoryTray, getUserStories, recordStoryView, getStoryViewers, deleteStory, deleteExpiredStories } = require('./storyService');

const NOW = new Date('2026-10-22T12:00:00.000Z');
const ACTIVE_SINCE = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
const ME = '64b7f0a1c2d3e4f5a6b7c8d1';
const AUTHOR_A = '64b7f0a1c2d3e4f5a6b7c8a1';
const AUTHOR_B = '64b7f0a1c2d3e4f5a6b7c8a2';
const AUTHOR_C = '64b7f0a1c2d3e4f5a6b7c8a3';
const AUTHOR_D = '64b7f0a1c2d3e4f5a6b7c8a4';
const STORY_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
const STORY_ID_2 = '64b7f0a1c2d3e4f5a6b7c8e2';
const STORY_ID_3 = '64b7f0a1c2d3e4f5a6b7c8e3';

const minutesAgo = (minutes) => new Date(NOW.getTime() - minutes * 60 * 1000);

const buildQuery = (result) => {
	const query = {};

	['select', 'sort', 'lean', 'populate'].forEach((method) => {
		query[method] = jest.fn().mockReturnValue(query);
	});
	query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);

	return query;
};

describe('storyService', () => {
	let consoleErrorSpy;

	beforeEach(() => {
		jest.resetAllMocks();
		jest.useFakeTimers({ now: NOW });
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
		jest.useRealTimers();
	});

	describe('addStory', () => {
		const imageFile = { buffer: Buffer.from('image') };
		const uploadedImage = { imageIdentifier: 'folder/abc', imageUrl: 'https://cdn/abc.jpg', imageWidth: 1080, imageHeight: 1920 };

		const buildStoryModelMock = ({ save = jest.fn().mockResolvedValue(undefined) } = {}) => {
			StoryModel.mockImplementation(function StoryModelMock(data) {
				Object.assign(this, data);
				this._id = STORY_ID;
				this.createdAt = NOW;
				this.save = save;
			});
			StoryModel.deleteOne = jest.fn().mockResolvedValue({});

			return { save };
		};

		it('uploads the picture to image storage on the story field', async () => {
			imageStorageService.uploadImage.mockResolvedValue(uploadedImage);
			buildStoryModelMock();

			await addStory({ imageFile }, ME);

			expect(imageStorageService.uploadImage).toHaveBeenCalledWith({ file: imageFile, fieldName: constants.STORY_IMAGE_FIELD });
		});

		it('saves the story with the uploaded image, its dimensions and the owner', async () => {
			imageStorageService.uploadImage.mockResolvedValue(uploadedImage);
			const { save } = buildStoryModelMock();

			await addStory({ imageFile }, ME);

			expect(StoryModel).toHaveBeenCalledWith({
				imageIdentifier: 'folder/abc',
				imageUrl: 'https://cdn/abc.jpg',
				imageWidth: 1080,
				imageHeight: 1920,
				userId: ME,
			});
			expect(save).toHaveBeenCalledTimes(1);
		});

		it('returns the story with its dimensions and without the storage identifier', async () => {
			imageStorageService.uploadImage.mockResolvedValue(uploadedImage);
			buildStoryModelMock();

			const result = await addStory({ imageFile }, ME);

			expect(result).toEqual({
				_id: STORY_ID,
				userId: ME,
				imageUrl: 'https://cdn/abc.jpg',
				imageWidth: 1080,
				imageHeight: 1920,
				createdAt: NOW,
			});
		});

		it('saves nothing when the upload is rejected', async () => {
			const uploadError = Object.assign(new Error('bad image'), { statusCode: 400 });
			imageStorageService.uploadImage.mockRejectedValue(uploadError);
			buildStoryModelMock();

			await expect(addStory({ imageFile }, ME)).rejects.toBe(uploadError);

			expect(StoryModel).not.toHaveBeenCalled();
		});

		it('removes the story record and the uploaded picture, then answers 500, when saving fails', async () => {
			imageStorageService.uploadImage.mockResolvedValue(uploadedImage);
			buildStoryModelMock({ save: jest.fn().mockRejectedValue(new Error('db down')) });

			await expect(addStory({ imageFile }, ME)).rejects.toMatchObject({ statusCode: 500 });

			expect(StoryModel.deleteOne).toHaveBeenCalledWith({ _id: STORY_ID });
			expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('folder/abc');
		});

		it('still discards the uploaded picture when removing the story record also fails', async () => {
			imageStorageService.uploadImage.mockResolvedValue(uploadedImage);
			buildStoryModelMock({ save: jest.fn().mockRejectedValue(new Error('db down')) });
			StoryModel.deleteOne = jest.fn().mockRejectedValue(new Error('still down'));

			await expect(addStory({ imageFile }, ME)).rejects.toMatchObject({ statusCode: 500 });

			expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('folder/abc');
		});
	});

	describe('getStoryTray', () => {
		const givenCurrentUser = (user) => {
			UserModel.findById = jest.fn().mockReturnValue(buildQuery(user));
		};

		const givenStories = (stories) => {
			StoryModel.find = jest.fn().mockReturnValue(buildQuery(stories));
		};

		const givenViews = (storyIds) => {
			StoryViewModel.find = jest.fn().mockReturnValue(buildQuery(storyIds.map((storyId) => ({ storyId }))));
		};

		const givenAuthors = (authorIds) => {
			UserModel.find = jest
				.fn()
				.mockReturnValue(
					buildQuery(
						authorIds.map((_id) => ({ _id, username: `user_${_id.slice(-2)}`, profilePicture: { imageUrl: `https://cdn/${_id}.jpg` } })),
					),
				);
		};

		const story = (_id, userId, createdAt) => ({ _id, userId, createdAt });

		it('rejects a session whose user no longer exists with 401 UNAUTHENTICATED', async () => {
			givenCurrentUser(null);

			await expect(getStoryTray(ME)).rejects.toMatchObject({ statusCode: 401, code: ERROR_CODES.UNAUTHENTICATED });
		});

		it('only loads the stories of the current user and the users they follow', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A, AUTHOR_B] });
			givenStories([]);
			givenViews([]);
			givenAuthors([]);

			await getStoryTray(ME);

			expect(StoryModel.find).toHaveBeenCalledWith({ userId: { $in: [ME, AUTHOR_A, AUTHOR_B] }, createdAt: { $gt: ACTIVE_SINCE } });
		});

		it('returns an empty tray when nobody has an active story', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A] });
			givenStories([]);
			givenViews([]);
			givenAuthors([]);

			await expect(getStoryTray(ME)).resolves.toEqual([]);
		});

		it('leaves your own circle out when you have no active story', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A] });
			givenStories([story(STORY_ID, AUTHOR_A, minutesAgo(5))]);
			givenViews([]);
			givenAuthors([AUTHOR_A]);

			const tray = await getStoryTray(ME);

			expect(tray.map((entry) => entry.isOwn)).toEqual([false]);
		});

		it('lists your own circle first, as watched so its ring is grey, when you have an active story', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A] });
			givenStories([story(STORY_ID, AUTHOR_A, minutesAgo(1)), story(STORY_ID_2, ME, minutesAgo(600))]);
			givenViews([]);
			givenAuthors([ME, AUTHOR_A]);

			const tray = await getStoryTray(ME);

			expect(tray[0]).toMatchObject({ isOwn: true, isWatched: true });
			expect(tray[1]).toMatchObject({ isOwn: false, isWatched: false });
		});

		it('orders unwatched users before watched ones, newest story first within each group', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A, AUTHOR_B, AUTHOR_C, AUTHOR_D] });
			givenStories([
				story('s-own', ME, minutesAgo(900)),
				story('s-a', AUTHOR_A, minutesAgo(50)),
				story('s-b1', AUTHOR_B, minutesAgo(100)),
				story('s-b2', AUTHOR_B, minutesAgo(40)),
				story('s-c', AUTHOR_C, minutesAgo(10)),
				story('s-d', AUTHOR_D, minutesAgo(20)),
			]);
			givenViews(['s-a', 's-b1', 's-d']);
			givenAuthors([ME, AUTHOR_A, AUTHOR_B, AUTHOR_C, AUTHOR_D]);

			const tray = await getStoryTray(ME);

			expect(tray.map((entry) => String(entry.user._id))).toEqual([ME, AUTHOR_C, AUTHOR_B, AUTHOR_D, AUTHOR_A]);
		});

		it('keeps a user unwatched while any one of their stories is unwatched', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A] });
			givenStories([story('s-1', AUTHOR_A, minutesAgo(60)), story('s-2', AUTHOR_A, minutesAgo(30))]);
			givenViews(['s-1']);
			givenAuthors([AUTHOR_A]);

			const tray = await getStoryTray(ME);

			expect(tray[0].isWatched).toBe(false);
		});

		it('marks a user watched once all of their active stories are watched', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A] });
			givenStories([story('s-1', AUTHOR_A, minutesAgo(60)), story('s-2', AUTHOR_A, minutesAgo(30))]);
			givenViews(['s-1', 's-2']);
			givenAuthors([AUTHOR_A]);

			const tray = await getStoryTray(ME);

			expect(tray[0].isWatched).toBe(true);
		});

		it('reports the newest story time of each user', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A] });
			givenStories([story('s-1', AUTHOR_A, minutesAgo(60)), story('s-2', AUTHOR_A, minutesAgo(30)), story('s-3', AUTHOR_A, minutesAgo(45))]);
			givenViews([]);
			givenAuthors([AUTHOR_A]);

			const tray = await getStoryTray(ME);

			expect(tray[0].latestStoryAt).toEqual(minutesAgo(30));
		});

		it('looks up the views of the current user for the active stories only', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A] });
			givenStories([story(STORY_ID, AUTHOR_A, minutesAgo(5)), story(STORY_ID_2, AUTHOR_A, minutesAgo(4))]);
			givenViews([]);
			givenAuthors([AUTHOR_A]);

			await getStoryTray(ME);

			expect(StoryViewModel.find).toHaveBeenCalledWith({ viewerId: ME, storyId: { $in: [STORY_ID, STORY_ID_2] } });
		});

		it('returns only the username and photo of each user', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A] });
			givenStories([story(STORY_ID, AUTHOR_A, minutesAgo(5))]);
			givenViews([]);
			givenAuthors([AUTHOR_A]);

			const tray = await getStoryTray(ME);

			expect(tray[0].user).toEqual({ _id: AUTHOR_A, username: 'user_a1', profilePicture: { imageUrl: `https://cdn/${AUTHOR_A}.jpg` } });
		});

		it('leaves out a user whose account no longer exists', async () => {
			givenCurrentUser({ _id: ME, following: [AUTHOR_A, AUTHOR_B] });
			givenStories([story(STORY_ID, AUTHOR_A, minutesAgo(5)), story(STORY_ID_2, AUTHOR_B, minutesAgo(6))]);
			givenViews([]);
			givenAuthors([AUTHOR_B]);

			const tray = await getStoryTray(ME);

			expect(tray.map((entry) => String(entry.user._id))).toEqual([AUTHOR_B]);
		});

		it('answers 500 when the database fails', async () => {
			UserModel.findById = jest.fn().mockImplementation(() => {
				throw new Error('db down');
			});

			await expect(getStoryTray(ME)).rejects.toMatchObject({ statusCode: 500 });
		});
	});

	describe('getUserStories', () => {
		const author = { _id: AUTHOR_A, username: 'author', profilePicture: { imageUrl: 'https://cdn/a.jpg' } };

		const givenAuthor = (value) => {
			UserModel.findById = jest.fn().mockReturnValue(buildQuery(value));
		};

		const givenStories = (stories) => {
			const query = buildQuery(stories);

			StoryModel.find = jest.fn().mockReturnValue(query);

			return query;
		};

		const storyDoc = (_id, userId, createdAt) => ({
			_id,
			userId,
			imageUrl: `https://cdn/${_id}.jpg`,
			imageWidth: 1080,
			imageHeight: 1920,
			imageIdentifier: `folder/${_id}`,
			createdAt,
		});

		it('rejects a malformed user id with 404 USER_NOT_FOUND without querying', async () => {
			UserModel.findById = jest.fn();

			await expect(getUserStories({ authorId: 'nope', requesterId: ME })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.USER_NOT_FOUND,
			});

			expect(UserModel.findById).not.toHaveBeenCalled();
		});

		it('rejects an unknown user with 404 USER_NOT_FOUND', async () => {
			givenAuthor(null);

			await expect(getUserStories({ authorId: AUTHOR_A, requesterId: ME })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.USER_NOT_FOUND,
			});
		});

		it('only asks for stories younger than 24 hours', async () => {
			givenAuthor(author);
			givenStories([]);
			StoryViewModel.find = jest.fn().mockReturnValue(buildQuery([]));

			await getUserStories({ authorId: AUTHOR_A, requesterId: ME });

			expect(StoryModel.find).toHaveBeenCalledWith({ userId: AUTHOR_A, createdAt: { $gt: ACTIVE_SINCE } });
		});

		it('returns the stories oldest first', async () => {
			givenAuthor(author);
			const query = givenStories([]);
			StoryViewModel.find = jest.fn().mockReturnValue(buildQuery([]));

			await getUserStories({ authorId: AUTHOR_A, requesterId: ME });

			expect(query.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
		});

		it('returns the author as username and photo only', async () => {
			givenAuthor(author);
			givenStories([]);
			StoryViewModel.find = jest.fn().mockReturnValue(buildQuery([]));

			const result = await getUserStories({ authorId: AUTHOR_A, requesterId: ME });

			expect(result.user).toEqual({ _id: AUTHOR_A, username: 'author', profilePicture: { imageUrl: 'https://cdn/a.jpg' } });
		});

		it("flags which of another user's stories the requester has watched, without a viewers count", async () => {
			givenAuthor(author);
			givenStories([storyDoc(STORY_ID, AUTHOR_A, minutesAgo(60)), storyDoc(STORY_ID_2, AUTHOR_A, minutesAgo(30))]);
			StoryViewModel.find = jest.fn().mockReturnValue(buildQuery([{ storyId: STORY_ID }]));
			StoryViewModel.aggregate = jest.fn();

			const result = await getUserStories({ authorId: AUTHOR_A, requesterId: ME });

			expect(result.stories.map((entry) => entry.isWatched)).toEqual([true, false]);
			expect(result.stories[0]).not.toHaveProperty('viewersCount');
			expect(StoryViewModel.find).toHaveBeenCalledWith({ viewerId: ME, storyId: { $in: [STORY_ID, STORY_ID_2] } });
			expect(StoryViewModel.aggregate).not.toHaveBeenCalled();
		});

		it('does not expose the storage identifier', async () => {
			givenAuthor(author);
			givenStories([storyDoc(STORY_ID, AUTHOR_A, minutesAgo(60))]);
			StoryViewModel.find = jest.fn().mockReturnValue(buildQuery([]));

			const result = await getUserStories({ authorId: AUTHOR_A, requesterId: ME });

			expect(result.stories[0]).not.toHaveProperty('imageIdentifier');
		});

		it('returns the viewers count of each of your own stories, without a watched flag', async () => {
			givenAuthor({ ...author, _id: ME });
			givenStories([storyDoc(STORY_ID, ME, minutesAgo(60)), storyDoc(STORY_ID_2, ME, minutesAgo(30))]);
			StoryViewModel.aggregate = jest.fn().mockResolvedValue([{ _id: STORY_ID, count: 3 }]);
			StoryViewModel.find = jest.fn();

			const result = await getUserStories({ authorId: ME, requesterId: ME });

			expect(result.stories.map((entry) => entry.viewersCount)).toEqual([3, 0]);
			expect(result.stories[0]).not.toHaveProperty('isWatched');
			expect(StoryViewModel.find).not.toHaveBeenCalled();
		});

		it('counts the views of your own stories grouped per story', async () => {
			givenAuthor({ ...author, _id: ME });
			givenStories([storyDoc(STORY_ID, ME, minutesAgo(60))]);
			StoryViewModel.aggregate = jest.fn().mockResolvedValue([]);

			await getUserStories({ authorId: ME, requesterId: ME });

			expect(StoryViewModel.aggregate).toHaveBeenCalledWith([
				{ $match: { storyId: { $in: [STORY_ID] } } },
				{ $group: { _id: '$storyId', count: { $sum: 1 } } },
			]);
		});

		it('answers 500 when the database fails', async () => {
			UserModel.findById = jest.fn().mockImplementation(() => {
				throw new Error('db down');
			});

			await expect(getUserStories({ authorId: AUTHOR_A, requesterId: ME })).rejects.toMatchObject({ statusCode: 500 });
		});
	});

	describe('recordStoryView', () => {
		const givenStory = (story) => {
			StoryModel.findOne = jest.fn().mockResolvedValue(story);
		};

		it('rejects a malformed story id with 404 STORY_NOT_FOUND without querying', async () => {
			StoryModel.findOne = jest.fn();

			await expect(recordStoryView({ storyId: 'nope', viewerId: ME })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.STORY_NOT_FOUND,
			});

			expect(StoryModel.findOne).not.toHaveBeenCalled();
		});

		it('rejects a story that does not exist or has expired with 404 STORY_NOT_FOUND', async () => {
			givenStory(null);

			await expect(recordStoryView({ storyId: STORY_ID, viewerId: ME })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.STORY_NOT_FOUND,
			});
		});

		it('looks the story up only among those younger than 24 hours', async () => {
			givenStory(null);

			await recordStoryView({ storyId: STORY_ID, viewerId: ME }).catch(() => {});

			expect(StoryModel.findOne).toHaveBeenCalledWith({ _id: STORY_ID, createdAt: { $gt: ACTIVE_SINCE } });
		});

		it('never records a view of your own story', async () => {
			givenStory({ _id: STORY_ID, userId: ME });
			StoryViewModel.updateOne = jest.fn();

			await recordStoryView({ storyId: STORY_ID, viewerId: ME });

			expect(StoryViewModel.updateOne).not.toHaveBeenCalled();
		});

		it("records a view of someone else's story as one upserted record per viewer", async () => {
			givenStory({ _id: STORY_ID, userId: AUTHOR_A });
			StoryViewModel.updateOne = jest.fn().mockResolvedValue({});

			await recordStoryView({ storyId: STORY_ID, viewerId: ME });

			expect(StoryViewModel.updateOne).toHaveBeenCalledWith(
				{ storyId: STORY_ID, viewerId: ME },
				{ $setOnInsert: { createdAt: NOW } },
				{ upsert: true },
			);
		});

		it('treats a concurrent duplicate view as success', async () => {
			givenStory({ _id: STORY_ID, userId: AUTHOR_A });
			StoryViewModel.updateOne = jest.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

			await expect(recordStoryView({ storyId: STORY_ID, viewerId: ME })).resolves.toBeUndefined();
		});

		it('answers 500 for any other failure while saving the view', async () => {
			givenStory({ _id: STORY_ID, userId: AUTHOR_A });
			StoryViewModel.updateOne = jest.fn().mockRejectedValue(new Error('db down'));

			await expect(recordStoryView({ storyId: STORY_ID, viewerId: ME })).rejects.toMatchObject({ statusCode: 500 });
		});
	});

	describe('getStoryViewers', () => {
		const viewer = (_id, username, imageUrl) => ({
			viewerId: { _id, username, profilePicture: imageUrl ? { imageUrl } : undefined, email: 'private@example.com' },
		});

		const givenViews = (views) => {
			const query = buildQuery(views);

			StoryViewModel.find = jest.fn().mockReturnValue(query);

			return query;
		};

		it('rejects a malformed story id with 404 STORY_NOT_FOUND', async () => {
			StoryModel.findOne = jest.fn();

			await expect(getStoryViewers({ storyId: 'nope', userId: ME })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.STORY_NOT_FOUND,
			});
		});

		it('rejects a missing or expired story with 404 STORY_NOT_FOUND', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue(null);

			await expect(getStoryViewers({ storyId: STORY_ID, userId: ME })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.STORY_NOT_FOUND,
			});
			expect(StoryModel.findOne).toHaveBeenCalledWith({ _id: STORY_ID, createdAt: { $gt: ACTIVE_SINCE } });
		});

		it('rejects anyone but the owner with 403 STORY_FORBIDDEN and reveals no viewers', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue({ _id: STORY_ID, userId: AUTHOR_A });
			StoryViewModel.find = jest.fn();

			await expect(getStoryViewers({ storyId: STORY_ID, userId: ME })).rejects.toMatchObject({
				statusCode: 403,
				code: ERROR_CODES.STORY_FORBIDDEN,
			});

			expect(StoryViewModel.find).not.toHaveBeenCalled();
		});

		it('excludes the owner from the viewers', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue({ _id: STORY_ID, userId: ME });
			givenViews([]);

			await getStoryViewers({ storyId: STORY_ID, userId: ME });

			expect(StoryViewModel.find).toHaveBeenCalledWith({ storyId: STORY_ID, viewerId: { $ne: ME } });
		});

		it('lists the most recent viewers first', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue({ _id: STORY_ID, userId: ME });
			const query = givenViews([]);

			await getStoryViewers({ storyId: STORY_ID, userId: ME });

			expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
		});

		it('returns only the photo and username of each viewer', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue({ _id: STORY_ID, userId: ME });
			givenViews([viewer(AUTHOR_A, 'alice', 'https://cdn/a.jpg'), viewer(AUTHOR_B, 'bob')]);

			const result = await getStoryViewers({ storyId: STORY_ID, userId: ME });

			expect(result).toEqual([
				{ _id: AUTHOR_A, username: 'alice', profilePicture: { imageUrl: 'https://cdn/a.jpg' } },
				{ _id: AUTHOR_B, username: 'bob', profilePicture: undefined },
			]);
		});

		it('skips viewers whose account no longer exists', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue({ _id: STORY_ID, userId: ME });
			givenViews([{ viewerId: null }, viewer(AUTHOR_A, 'alice')]);

			const result = await getStoryViewers({ storyId: STORY_ID, userId: ME });

			expect(result.map((entry) => entry.username)).toEqual(['alice']);
		});
	});

	describe('deleteStory', () => {
		const ownStory = { _id: STORY_ID, userId: ME, imageIdentifier: 'folder/abc' };

		beforeEach(() => {
			imageStorageService.deleteImage.mockResolvedValue({ result: 'ok' });
			StoryViewModel.deleteMany = jest.fn().mockResolvedValue({});
			StoryModel.deleteOne = jest.fn().mockResolvedValue({});
		});

		it('rejects a malformed story id with 404 STORY_NOT_FOUND', async () => {
			StoryModel.findOne = jest.fn();

			await expect(deleteStory({ storyId: 'nope', userId: ME })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.STORY_NOT_FOUND,
			});
		});

		it('rejects a missing or expired story with 404 STORY_NOT_FOUND and deletes nothing', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue(null);

			await expect(deleteStory({ storyId: STORY_ID, userId: ME })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.STORY_NOT_FOUND,
			});

			expect(StoryModel.findOne).toHaveBeenCalledWith({ _id: STORY_ID, createdAt: { $gt: ACTIVE_SINCE } });
			expect(StoryModel.deleteOne).not.toHaveBeenCalled();
		});

		it("rejects deleting someone else's story with 403 STORY_FORBIDDEN and deletes nothing", async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue({ ...ownStory, userId: AUTHOR_A });

			await expect(deleteStory({ storyId: STORY_ID, userId: ME })).rejects.toMatchObject({
				statusCode: 403,
				code: ERROR_CODES.STORY_FORBIDDEN,
			});

			expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			expect(StoryViewModel.deleteMany).not.toHaveBeenCalled();
			expect(StoryModel.deleteOne).not.toHaveBeenCalled();
		});

		it('removes the Cloudinary image of your own story', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue(ownStory);

			await deleteStory({ storyId: STORY_ID, userId: ME });

			expect(imageStorageService.deleteImage).toHaveBeenCalledWith('folder/abc');
		});

		it('removes the view records of the story', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue(ownStory);

			await deleteStory({ storyId: STORY_ID, userId: ME });

			expect(StoryViewModel.deleteMany).toHaveBeenCalledWith({ storyId: STORY_ID });
		});

		it('removes the story itself', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue(ownStory);

			await deleteStory({ storyId: STORY_ID, userId: ME });

			expect(StoryModel.deleteOne).toHaveBeenCalledWith({ _id: STORY_ID });
		});

		it('answers 500 and keeps the story when the image cannot be deleted', async () => {
			StoryModel.findOne = jest.fn().mockResolvedValue(ownStory);
			imageStorageService.deleteImage.mockRejectedValue(new Error('cloudinary down'));

			await expect(deleteStory({ storyId: STORY_ID, userId: ME })).rejects.toMatchObject({ statusCode: 500 });

			expect(StoryModel.deleteOne).not.toHaveBeenCalled();
		});
	});

	describe('deleteExpiredStories', () => {
		const expired = (_id) => ({ _id, userId: AUTHOR_A, imageIdentifier: `folder/${_id}` });

		beforeEach(() => {
			imageStorageService.deleteImage.mockResolvedValue({ result: 'ok' });
			StoryViewModel.deleteMany = jest.fn().mockResolvedValue({});
			StoryModel.deleteOne = jest.fn().mockResolvedValue({});
		});

		it('selects the stories that are 24 hours old or older', async () => {
			StoryModel.find = jest.fn().mockResolvedValue([]);

			await deleteExpiredStories();

			expect(StoryModel.find).toHaveBeenCalledWith({ createdAt: { $lte: ACTIVE_SINCE } });
		});

		it('does nothing and reports zero when there are no expired stories', async () => {
			StoryModel.find = jest.fn().mockResolvedValue([]);

			await expect(deleteExpiredStories()).resolves.toBe(0);

			expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
		});

		it('removes the image, the view records and the story of every expired story', async () => {
			StoryModel.find = jest.fn().mockResolvedValue([expired(STORY_ID), expired(STORY_ID_2)]);

			const deletedCount = await deleteExpiredStories();

			expect(deletedCount).toBe(2);
			expect(imageStorageService.deleteImage).toHaveBeenCalledWith(`folder/${STORY_ID}`);
			expect(imageStorageService.deleteImage).toHaveBeenCalledWith(`folder/${STORY_ID_2}`);
			expect(StoryViewModel.deleteMany).toHaveBeenCalledWith({ storyId: STORY_ID });
			expect(StoryViewModel.deleteMany).toHaveBeenCalledWith({ storyId: STORY_ID_2 });
			expect(StoryModel.deleteOne).toHaveBeenCalledWith({ _id: STORY_ID });
			expect(StoryModel.deleteOne).toHaveBeenCalledWith({ _id: STORY_ID_2 });
		});

		it('logs a failed deletion, keeps the story for the next run and carries on with the others', async () => {
			StoryModel.find = jest.fn().mockResolvedValue([expired(STORY_ID), expired(STORY_ID_2), expired(STORY_ID_3)]);
			imageStorageService.deleteImage.mockImplementation(async (identifier) => {
				if (identifier === `folder/${STORY_ID_2}`) {
					throw new Error('cloudinary down');
				}

				return { result: 'ok' };
			});

			const deletedCount = await deleteExpiredStories();

			expect(deletedCount).toBe(2);
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(StoryModel.deleteOne).not.toHaveBeenCalledWith({ _id: STORY_ID_2 });
			expect(StoryModel.deleteOne).toHaveBeenCalledWith({ _id: STORY_ID });
			expect(StoryModel.deleteOne).toHaveBeenCalledWith({ _id: STORY_ID_3 });
		});

		it('picks a story whose deletion failed up again on the next run', async () => {
			StoryModel.find = jest.fn().mockResolvedValue([expired(STORY_ID)]);
			imageStorageService.deleteImage.mockRejectedValueOnce(new Error('cloudinary down'));

			await expect(deleteExpiredStories()).resolves.toBe(0);
			await expect(deleteExpiredStories()).resolves.toBe(1);

			expect(StoryModel.deleteOne).toHaveBeenCalledTimes(1);
		});
	});
});
