const mongoose = require('mongoose');

const StoryModel = require('../models/storyModel');
const StoryViewModel = require('../models/storyViewModel');
const UserModel = require('../models/userModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { createStoryNotFoundError, createUserNotFoundError } = require('../utils/notFoundErrors');
const { asFieldError } = require('../utils/fieldErrors');
const imageStorageService = require('./imageStorageService');
const { assertUserNotHidden, getHiddenVisitorIds, isHiddenId, withoutHiddenIds } = require('./visitorVisibilityService');

const STORY_AUTHOR_SELECT = { username: 1, 'profilePicture.imageUrl': 1 };

const getActiveStoriesFilter = () => ({ createdAt: { $gt: new Date(Date.now() - constants.STORY_LIFETIME_MS) } });

const getExpiredStoriesFilter = () => ({ createdAt: { $lte: new Date(Date.now() - constants.STORY_LIFETIME_MS) } });

const toStoryData = (story, { viewersCount, isWatched } = {}) => ({
	_id: story._id,
	userId: story.userId,
	imageUrl: story.imageUrl,
	imageWidth: story.imageWidth,
	imageHeight: story.imageHeight,
	createdAt: story.createdAt,
	...(viewersCount === undefined ? {} : { viewersCount }),
	...(isWatched === undefined ? {} : { isWatched }),
});

const toStoryAuthorData = (user) => ({
	_id: user._id,
	username: user.username,
	profilePicture: user.profilePicture?.imageUrl ? { imageUrl: user.profilePicture.imageUrl } : undefined,
});

const findActiveStory = async (storyId, viewerId) => {
	if (!mongoose.isObjectIdOrHexString(storyId)) {
		throw createStoryNotFoundError();
	}

	const story = await StoryModel.findOne({ _id: storyId, ...getActiveStoriesFilter() });

	if (!story || isHiddenId(story.userId, await getHiddenVisitorIds(viewerId))) {
		throw createStoryNotFoundError();
	}

	return story;
};

const findOwnedActiveStory = async ({ storyId, userId }) => {
	const story = await findActiveStory(storyId, userId);

	if (String(story.userId) !== String(userId)) {
		throw new AppError('You can only change your own stories', 403, { code: ERROR_CODES.STORY_FORBIDDEN });
	}

	return story;
};

const rollbackAddedStory = async ({ story, imageIdentifier }) => {
	if (story) {
		try {
			await StoryModel.deleteOne({ _id: story._id });
		} catch (error) {
			console.error(`Could not remove story ${story._id} after a failed save`, error);
		}
	}

	await imageStorageService.discardUploadedImage(imageIdentifier);
};

const addStory = async ({ imageFile }, userId) => {
	const uploadedImage = await imageStorageService.uploadImage({ file: imageFile, fieldName: constants.STORY_IMAGE_FIELD });

	let story;

	try {
		story = new StoryModel({
			imageIdentifier: uploadedImage.imageIdentifier,
			imageUrl: uploadedImage.imageUrl,
			imageWidth: uploadedImage.imageWidth,
			imageHeight: uploadedImage.imageHeight,
			userId,
		});

		await story.save();

		return toStoryData(story);
	} catch (error) {
		await rollbackAddedStory({ story, imageIdentifier: uploadedImage.imageIdentifier });

		const fieldError = asFieldError(error);

		if (fieldError) {
			throw fieldError;
		}

		throw new AppError('Could not save the story', 500, { cause: error });
	}
};

const getViewersCountsByStoryId = async (storyIds, hiddenVisitorIds) => {
	const match = { storyId: { $in: storyIds } };

	if (hiddenVisitorIds.length) {
		match.viewerId = { $nin: hiddenVisitorIds };
	}

	const counts = await StoryViewModel.aggregate([{ $match: match }, { $group: { _id: '$storyId', count: { $sum: 1 } } }]);

	return new Map(counts.map((entry) => [String(entry._id), entry.count]));
};

const getWatchedStoryIds = async ({ storyIds, viewerId }) => {
	const views = await StoryViewModel.find({ viewerId, storyId: { $in: storyIds } })
		.select({ storyId: 1 })
		.lean();

	return new Set(views.map((view) => String(view.storyId)));
};

const getStorySummariesByUserId = async ({ userIds, viewerId }) => {
	if (!userIds.length) {
		return new Map();
	}

	const activeStories = await StoryModel.find({ userId: { $in: userIds }, ...getActiveStoriesFilter() })
		.select({ _id: 1, userId: 1 })
		.lean();

	const othersStoryIds = activeStories.filter((story) => String(story.userId) !== String(viewerId)).map((story) => story._id);
	const watchedStoryIds = viewerId && othersStoryIds.length ? await getWatchedStoryIds({ storyIds: othersStoryIds, viewerId }) : new Set();

	const summariesByUserId = new Map();

	activeStories.forEach((story) => {
		const authorKey = String(story.userId);
		const isStoryWatched = authorKey === String(viewerId) || watchedStoryIds.has(String(story._id));
		const summary = summariesByUserId.get(authorKey);

		summariesByUserId.set(authorKey, { isWatched: (summary ? summary.isWatched : true) && isStoryWatched });
	});

	return summariesByUserId;
};

const withStorySummaries = async ({ users, viewerId }) => {
	try {
		const summariesByUserId = await getStorySummariesByUserId({ userIds: users.map((user) => user._id), viewerId });

		return users.map((user) => ({ ...user, story: summariesByUserId.get(String(user._id)) ?? null }));
	} catch (error) {
		throw new AppError('Could not load the stories', 500, { cause: error });
	}
};

const getUserStory = async ({ userId, viewerId }) => {
	try {
		if (!mongoose.isObjectIdOrHexString(userId)) {
			throw createUserNotFoundError();
		}

		const hiddenVisitorIds = await getHiddenVisitorIds(viewerId);

		assertUserNotHidden(userId, hiddenVisitorIds);

		const activeStories = await StoryModel.find({ userId, ...getActiveStoriesFilter() })
			.sort({ createdAt: 1, _id: 1 })
			.lean();

		if (!activeStories.length) {
			return { story: null, stories: [] };
		}

		if (!viewerId) {
			return { story: { isWatched: false }, stories: [] };
		}

		const storyIds = activeStories.map((story) => story._id);

		if (String(userId) === String(viewerId)) {
			const viewersCounts = await getViewersCountsByStoryId(storyIds, hiddenVisitorIds);

			return {
				story: { isWatched: true },
				stories: activeStories.map((story) => toStoryData(story, { viewersCount: viewersCounts.get(String(story._id)) || 0 })),
			};
		}

		const watchedStoryIds = await getWatchedStoryIds({ storyIds, viewerId });
		const stories = activeStories.map((story) => toStoryData(story, { isWatched: watchedStoryIds.has(String(story._id)) }));

		return { story: { isWatched: stories.every((story) => story.isWatched) }, stories };
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load the user story', 500, { cause: error });
	}
};

const compareTrayEntries = (a, b) =>
	Number(b.isOwn) - Number(a.isOwn) || Number(a.isWatched) - Number(b.isWatched) || b.latestStoryAt - a.latestStoryAt;

const getStoryTray = async (userId) => {
	try {
		const currentUser = await UserModel.findById(userId).select({ following: 1 });

		if (!currentUser) {
			throw new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED });
		}

		const hiddenVisitorIds = await getHiddenVisitorIds(userId);
		const authorIds = [currentUser._id, ...withoutHiddenIds(currentUser.following, hiddenVisitorIds)];

		const activeStories = await StoryModel.find({ userId: { $in: authorIds }, ...getActiveStoriesFilter() })
			.sort({ createdAt: 1, _id: 1 })
			.lean();

		const ownStoryIds = activeStories.filter((story) => String(story.userId) === String(userId)).map((story) => story._id);
		const otherStoryIds = activeStories.filter((story) => String(story.userId) !== String(userId)).map((story) => story._id);
		const viewersCounts = await getViewersCountsByStoryId(ownStoryIds, hiddenVisitorIds);
		const watchedStoryIds = await getWatchedStoryIds({ storyIds: otherStoryIds, viewerId: userId });

		const entriesByAuthorId = new Map();

		activeStories.forEach((story) => {
			const authorKey = String(story.userId);
			const isOwn = authorKey === String(userId);
			const isStoryWatched = watchedStoryIds.has(String(story._id));
			const entry = entriesByAuthorId.get(authorKey) || {
				authorId: story.userId,
				isOwn,
				isWatched: true,
				latestStoryAt: story.createdAt,
				stories: [],
			};

			entry.isWatched = entry.isWatched && (isOwn || isStoryWatched);
			entry.latestStoryAt = story.createdAt > entry.latestStoryAt ? story.createdAt : entry.latestStoryAt;
			entry.stories.push(
				toStoryData(story, isOwn ? { viewersCount: viewersCounts.get(String(story._id)) || 0 } : { isWatched: isStoryWatched }),
			);

			entriesByAuthorId.set(authorKey, entry);
		});

		const authors = await UserModel.find({ _id: { $in: [...entriesByAuthorId.values()].map((entry) => entry.authorId) } })
			.select(STORY_AUTHOR_SELECT)
			.lean();

		const authorsById = new Map(authors.map((author) => [String(author._id), author]));

		return [...entriesByAuthorId.values()]
			.filter((entry) => authorsById.has(String(entry.authorId)))
			.sort(compareTrayEntries)
			.map((entry) => ({
				user: toStoryAuthorData(authorsById.get(String(entry.authorId))),
				isOwn: entry.isOwn,
				isWatched: entry.isWatched,
				latestStoryAt: entry.latestStoryAt,
				stories: entry.stories,
			}));
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load the stories tray', 500, { cause: error });
	}
};

const recordStoryView = async ({ storyId, viewerId }) => {
	try {
		const story = await findActiveStory(storyId, viewerId);

		if (String(story.userId) === String(viewerId)) {
			return;
		}

		try {
			await StoryViewModel.updateOne({ storyId: story._id, viewerId }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
		} catch (error) {
			if (error?.code !== constants.DUPLICATE_KEY_ERROR_CODE) {
				throw error;
			}
		}
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not record the story view', 500, { cause: error });
	}
};

const getStoryViewers = async ({ storyId, userId }) => {
	try {
		const story = await findOwnedActiveStory({ storyId, userId });

		const hiddenVisitorIds = await getHiddenVisitorIds(userId);
		const viewerFilter = hiddenVisitorIds.length ? { $nin: [userId, ...hiddenVisitorIds] } : { $ne: userId };
		const views = await StoryViewModel.find({ storyId: story._id, viewerId: viewerFilter })
			.sort({ createdAt: -1, _id: -1 })
			.populate({ path: 'viewerId', select: STORY_AUTHOR_SELECT });

		return views.filter((view) => view.viewerId).map((view) => toStoryAuthorData(view.viewerId));
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load the story viewers', 500, { cause: error });
	}
};

const removeStory = async (story) => {
	await imageStorageService.deleteImage(story.imageIdentifier);

	await StoryViewModel.deleteMany({ storyId: story._id });

	await StoryModel.deleteOne({ _id: story._id });
};

const deleteStory = async ({ storyId, userId }) => {
	try {
		const story = await findOwnedActiveStory({ storyId, userId });

		await removeStory(story);
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not delete the story', 500, { cause: error });
	}
};

const deleteExpiredStories = async () => {
	const expiredStories = await StoryModel.find(getExpiredStoriesFilter()).select({ _id: 1, imageIdentifier: 1 }).lean();

	let deletedCount = 0;

	for (const story of expiredStories) {
		try {
			await removeStory(story);

			deletedCount += 1;
		} catch (error) {
			console.error(`Could not delete expired story ${story._id}`, error);
		}
	}

	return deletedCount;
};

module.exports = {
	addStory,
	getStoryTray,
	getUserStory,
	withStorySummaries,
	recordStoryView,
	getStoryViewers,
	deleteStory,
	deleteExpiredStories,
};
