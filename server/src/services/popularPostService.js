const mongoose = require('mongoose');

const UserPostModel = require('../models/userPostModel');
const UserModel = require('../models/userModel');
const {
	POPULAR_POSTS_PAGE_SIZE,
	POPULAR_COMMENT_WEIGHT,
	POPULAR_AGE_OFFSET_HOURS,
	POPULAR_AGE_EXPONENT,
	MAX_SHOWN_POST_IDS,
	MS_PER_HOUR,
} = require('../config/popularPosts');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { createPostNotFoundError } = require('../utils/notFoundErrors');
const commentService = require('./commentService');

const AUTHOR_POPULATE = {
	path: 'userId',
	select: 'username profilePicture',
};

const POPULAR_SCORE_FIELDS_TO_DROP = { storedCommentsCount: 0, likesCount: 0, ageHours: 0, popularityScore: 0 };

const createBadRequestError = (message) => new AppError(message, 400, { code: ERROR_CODES.BAD_REQUEST });

const getExcludedAuthorIds = async (userId) => {
	if (!userId) {
		return [];
	}

	const currentUser = await UserModel.findById(userId).select({ following: 1 }).lean();

	if (!currentUser) {
		throw new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED });
	}

	return [currentUser._id, ...(currentUser.following ?? [])];
};

const findFirstPost = async (firstPostId) => {
	if (!firstPostId) {
		return null;
	}

	if (!mongoose.isObjectIdOrHexString(firstPostId)) {
		throw createPostNotFoundError();
	}

	const firstPost = await UserPostModel.findById(firstPostId).lean();

	if (!firstPost) {
		throw createPostNotFoundError();
	}

	return firstPost;
};

const parseSnapshotTime = (snapshotTime) => {
	const parsedSnapshotTime = typeof snapshotTime === 'string' ? new Date(snapshotTime) : null;

	if (!parsedSnapshotTime || Number.isNaN(parsedSnapshotTime.getTime())) {
		throw createBadRequestError('snapshotTime must be a valid date');
	}

	return parsedSnapshotTime;
};

const parseShownPostIds = (shownPostIds) => {
	const isValid =
		Array.isArray(shownPostIds) &&
		shownPostIds.length <= MAX_SHOWN_POST_IDS &&
		shownPostIds.every((postId) => typeof postId === 'string' && mongoose.isObjectIdOrHexString(postId));

	if (!isValid) {
		throw createBadRequestError(`shownPostIds must be an array of at most ${MAX_SHOWN_POST_IDS} post ids`);
	}

	return shownPostIds.map((postId) => new mongoose.Types.ObjectId(postId));
};

const buildScoreStages = (snapshotTime) => [
	{
		$addFields: {
			storedCommentsCount: { $ifNull: ['$commentsCount', 0] },
			likesCount: { $size: { $ifNull: ['$likes', []] } },
			ageHours: { $divide: [{ $subtract: [snapshotTime, '$createdAt'] }, MS_PER_HOUR] },
		},
	},
	{
		$addFields: {
			popularityScore: {
				$divide: [
					{ $add: ['$likesCount', { $multiply: [POPULAR_COMMENT_WEIGHT, '$storedCommentsCount'] }] },
					{ $pow: [{ $add: ['$ageHours', POPULAR_AGE_OFFSET_HOURS] }, POPULAR_AGE_EXPONENT] },
				],
			},
		},
	},
];

const getRankedPosts = ({ snapshotTime, excludedAuthorIds, shownPostIds, limit }) =>
	UserPostModel.aggregate([
		{ $match: { createdAt: { $lte: snapshotTime }, userId: { $nin: excludedAuthorIds }, _id: { $nin: shownPostIds } } },
		...buildScoreStages(snapshotTime),
		{ $sort: { popularityScore: -1, _id: -1 } },
		{ $limit: limit + 1 },
		{ $project: POPULAR_SCORE_FIELDS_TO_DROP },
	]);

const withCommentData = async (posts) => {
	const populatedPosts = await UserPostModel.populate(posts, AUTHOR_POPULATE);
	const postIds = populatedPosts.map((post) => post._id);

	const previewComments = await commentService.getPreviewCommentsForPosts(postIds);

	return populatedPosts.map((post) => ({
		...post,
		previewComments: previewComments[post._id.toString()] || [],
	}));
};

const loadPopularPage = async ({ userId, snapshotTime, firstPost, shownPostIds }) => {
	const excludedAuthorIds = await getExcludedAuthorIds(userId);

	const rankedLimit = POPULAR_POSTS_PAGE_SIZE - (firstPost ? 1 : 0);

	const rankedPosts = await getRankedPosts({ snapshotTime, excludedAuthorIds, shownPostIds, limit: rankedLimit });

	const returnedRankedPosts = rankedPosts.slice(0, rankedLimit);
	const posts = await withCommentData([...(firstPost ? [firstPost] : []), ...returnedRankedPosts]);

	const shownTotal = shownPostIds.length + returnedRankedPosts.length;
	const hasMore = rankedPosts.length > rankedLimit && shownTotal < MAX_SHOWN_POST_IDS;

	return { posts, snapshotTime: snapshotTime.toISOString(), hasMore };
};

const getPopularPosts = async ({ userId, firstPostId }) => {
	try {
		const firstPost = await findFirstPost(firstPostId);

		return await loadPopularPage({
			userId,
			snapshotTime: new Date(),
			firstPost,
			shownPostIds: firstPost ? [firstPost._id] : [],
		});
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load popular posts', 500, { cause: error });
	}
};

const getNextPopularPosts = async ({ userId, snapshotTime, shownPostIds }) => {
	try {
		return await loadPopularPage({
			userId,
			snapshotTime: parseSnapshotTime(snapshotTime),
			firstPost: null,
			shownPostIds: parseShownPostIds(shownPostIds),
		});
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load popular posts', 500, { cause: error });
	}
};

module.exports = {
	getPopularPosts,
	getNextPopularPosts,
};
