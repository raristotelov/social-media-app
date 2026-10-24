const mongoose = require('mongoose');

const UserModel = require('../models/userModel');
const { ERROR_CODES } = require('../config/errorCodes');
const {
	SUGGESTION_PLACEMENTS,
	SUGGESTION_GROUPS,
	SUGGESTION_PLACEMENT_CONFIG,
	NEW_USER_WINDOW_MS,
	CAROUSEL_DISMISS_DURATION_MS,
} = require('../config/suggestions');
const AppError = require('../utils/AppError');
const { selectSuggestions } = require('../utils/suggestionSelection');

const FOLLOWERS_COUNT = { $size: { $ifNull: ['$followers', []] } };

const SUGGESTION_ROW_PROJECTION = {
	_id: 1,
	username: 1,
	'profilePicture.imageUrl': 1,
};

const MS_PER_SECOND = 1000;

const POOL_SIZE_FACTOR = 2;

const createUnauthenticatedError = () => new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED });

const getMutualPool = ({ excludedIds, followingIds, poolSize }) => {
	if (!followingIds.length) {
		return [];
	}

	return UserModel.aggregate([
		{ $match: { _id: { $nin: excludedIds }, followers: { $in: followingIds } } },
		{ $addFields: { mutualFollowerIds: { $setIntersection: ['$followers', followingIds] }, followersCount: FOLLOWERS_COUNT } },
		{ $addFields: { mutualCount: { $size: '$mutualFollowerIds' } } },
		{ $sort: { mutualCount: -1, followersCount: -1, _id: 1 } },
		{ $limit: poolSize },
		{ $project: { ...SUGGESTION_ROW_PROJECTION, mutualFollowerIds: 1, mutualCount: 1 } },
	]);
};

const getPopularPool = ({ excludedIds, poolSize }) =>
	UserModel.aggregate([
		{ $match: { _id: { $nin: excludedIds } } },
		{ $addFields: { followersCount: FOLLOWERS_COUNT } },
		{ $sort: { followersCount: -1, _id: 1 } },
		{ $limit: poolSize },
		{ $project: SUGGESTION_ROW_PROJECTION },
	]);

const getNewPool = ({ excludedIds, poolSize }) => {
	const joinedAfterSeconds = Math.floor((Date.now() - NEW_USER_WINDOW_MS) / MS_PER_SECOND);

	return UserModel.aggregate([
		{
			$match: {
				_id: { $nin: excludedIds, $gte: mongoose.Types.ObjectId.createFromTime(joinedAfterSeconds) },
				'posts.0': { $exists: true },
			},
		},
		{ $sort: { _id: -1 } },
		{ $limit: poolSize },
		{ $project: SUGGESTION_ROW_PROJECTION },
	]);
};

const compareMostFollowed = (a, b) => b.followersCount - a.followersCount || String(a._id).localeCompare(String(b._id));

const getMutualFollowersById = async (candidates) => {
	const mutualFollowerIdsByKey = new Map();

	candidates
		.filter((candidate) => candidate.group === SUGGESTION_GROUPS.MUTUAL)
		.forEach((candidate) => {
			candidate.mutualFollowerIds.forEach((mutualFollowerId) => mutualFollowerIdsByKey.set(String(mutualFollowerId), mutualFollowerId));
		});

	if (!mutualFollowerIdsByKey.size) {
		return new Map();
	}

	const mutualFollowers = await UserModel.aggregate([
		{ $match: { _id: { $in: [...mutualFollowerIdsByKey.values()] } } },
		{ $project: { _id: 1, username: 1, followersCount: FOLLOWERS_COUNT } },
	]);

	return new Map(mutualFollowers.map((mutualFollower) => [String(mutualFollower._id), mutualFollower]));
};

const toSuggestionData = (candidate, mutualFollowersById) => {
	const suggestionData = {
		_id: candidate._id,
		username: candidate.username,
		profilePicture: candidate.profilePicture?.imageUrl ? { imageUrl: candidate.profilePicture.imageUrl } : undefined,
		group: candidate.group,
	};

	if (candidate.group !== SUGGESTION_GROUPS.MUTUAL) {
		return suggestionData;
	}

	const [mostFollowedMutualFollower] = candidate.mutualFollowerIds
		.map((mutualFollowerId) => mutualFollowersById.get(String(mutualFollowerId)))
		.filter(Boolean)
		.sort(compareMostFollowed);

	if (!mostFollowedMutualFollower) {
		return { ...suggestionData, group: SUGGESTION_GROUPS.POPULAR };
	}

	return {
		...suggestionData,
		followedBy: { _id: mostFollowedMutualFollower._id, username: mostFollowedMutualFollower.username },
		moreMutualCount: candidate.mutualCount - 1,
	};
};

const isCarouselDismissed = (user) => Boolean(user.suggestionsCarouselDismissedUntil) && user.suggestionsCarouselDismissedUntil > new Date();

const getSuggestions = async ({ userId, placement }) => {
	try {
		if (!Object.hasOwn(SUGGESTION_PLACEMENT_CONFIG, placement)) {
			throw new AppError('Unknown suggestions placement', 400, { code: ERROR_CODES.BAD_REQUEST });
		}

		const { mix, reserveSize } = SUGGESTION_PLACEMENT_CONFIG[placement];

		const currentUser = await UserModel.findById(userId).select({ following: 1, suggestionsCarouselDismissedUntil: 1 }).lean();

		if (!currentUser) {
			throw createUnauthenticatedError();
		}

		if (placement === SUGGESTION_PLACEMENTS.CAROUSEL && isCarouselDismissed(currentUser)) {
			return { suggestions: [], reserve: [], isCarouselDismissed: true };
		}

		const followingIds = currentUser.following ?? [];
		const excludedIds = [currentUser._id, ...followingIds];
		const size = Object.values(mix).reduce((total, groupCount) => total + groupCount, 0);
		const poolSize = (size + reserveSize) * POOL_SIZE_FACTOR;

		const [mutualPool, popularPool, newPool] = await Promise.all([
			mix[SUGGESTION_GROUPS.MUTUAL] ? getMutualPool({ excludedIds, followingIds, poolSize }) : [],
			mix[SUGGESTION_GROUPS.POPULAR] ? getPopularPool({ excludedIds, poolSize }) : [],
			mix[SUGGESTION_GROUPS.NEW] ? getNewPool({ excludedIds, poolSize }) : [],
		]);

		const { suggestions, reserve } = selectSuggestions({
			pools: {
				[SUGGESTION_GROUPS.MUTUAL]: mutualPool,
				[SUGGESTION_GROUPS.POPULAR]: popularPool,
				[SUGGESTION_GROUPS.NEW]: newPool,
			},
			mix,
			size,
			reserveSize,
		});

		const mutualFollowersById = await getMutualFollowersById([...suggestions, ...reserve]);

		return {
			suggestions: suggestions.map((candidate) => toSuggestionData(candidate, mutualFollowersById)),
			reserve: reserve.map((candidate) => toSuggestionData(candidate, mutualFollowersById)),
			isCarouselDismissed: false,
		};
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load suggestions', 500, { cause: error });
	}
};

const dismissCarousel = async (userId) => {
	try {
		const dismissedUntil = new Date(Date.now() + CAROUSEL_DISMISS_DURATION_MS);

		const result = await UserModel.updateOne({ _id: userId }, { $set: { suggestionsCarouselDismissedUntil: dismissedUntil } });

		if (!result.matchedCount) {
			throw createUnauthenticatedError();
		}
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not dismiss the suggestions carousel', 500, { cause: error });
	}
};

module.exports = {
	getSuggestions,
	dismissCarousel,
};
