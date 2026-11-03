const mongoose = require('mongoose');

const UserPostModel = require('../models/userPostModel');
const UserModel = require('../models/userModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { createPostNotFoundError } = require('../utils/notFoundErrors');
const { asFieldError } = require('../utils/fieldErrors');
const { reactToUpload } = require('../demo/userReactions');
const commentService = require('./commentService');
const imageStorageService = require('./imageStorageService');
const { getUserRowsInOrder } = require('./userRowService');
const { assertPostNotHidden, createPostVisibility, getHiddenVisitorIds, isHiddenId, withoutHiddenIds } = require('./visitorVisibilityService');

const AUTHOR_POPULATE = {
	path: 'userId',
	select: 'username profilePicture',
};

const findOwnedUserPost = async ({ userPostId, userId }) => {
	if (!mongoose.isValidObjectId(userPostId)) {
		throw createPostNotFoundError();
	}

	const userPost = await UserPostModel.findById(userPostId);

	if (!userPost) {
		throw createPostNotFoundError();
	}

	if (!userPost.userId || userPost.userId.toString() !== String(userId)) {
		if (userPost.userId && isHiddenId(userPost.userId, await getHiddenVisitorIds(userId))) {
			throw createPostNotFoundError();
		}

		throw new AppError('You can only change your own posts', 403, { code: ERROR_CODES.POST_FORBIDDEN });
	}

	const isListedPost = await UserModel.exists({ _id: userId, posts: userPost._id });

	if (!isListedPost) {
		throw createPostNotFoundError();
	}

	return userPost;
};

const getAllUserPosts = async (userId) => {
	try {
		const userPosts = await UserPostModel.find({ userId });
		const applyVisibility = await createPostVisibility(
			userPosts.map((userPost) => userPost._id),
			await getHiddenVisitorIds(userId),
		);

		return userPosts.map((userPost) => applyVisibility(userPost));
	} catch (error) {
		throw new AppError('Could not load user posts', 500, { cause: error });
	}
};

const rollbackAddedUserPost = async ({ userPost, imageIdentifier }) => {
	if (userPost) {
		try {
			await UserPostModel.deleteOne({ _id: userPost._id });
		} catch (error) {
			console.error(`Could not remove post ${userPost._id} after a failed save`, error);
		}
	}

	await imageStorageService.discardUploadedImage(imageIdentifier);
};

const assertValidCaption = async (caption) => {
	try {
		await UserPostModel.validate({ caption }, ['caption']);
	} catch (error) {
		const fieldError = asFieldError(error);

		if (fieldError) {
			throw fieldError;
		}

		throw new AppError('Could not save the user post', 500, { cause: error });
	}
};

const addUserPost = async ({ caption, imageFile }, userId) => {
	await assertValidCaption(caption);

	const uploadedImage = await imageStorageService.uploadImage({ file: imageFile, fieldName: constants.POST_IMAGE_FIELD });

	let userPost;

	try {
		userPost = new UserPostModel({
			imageIdentifier: uploadedImage.imageIdentifier,
			imageUrl: uploadedImage.imageUrl,
			imageWidth: uploadedImage.imageWidth,
			imageHeight: uploadedImage.imageHeight,
			caption,
			userId,
		});

		await userPost.save();

		await UserModel.findByIdAndUpdate(userId, {
			$addToSet: {
				posts: userPost._id,
			},
		});

		reactToUpload(userPost);

		return userPost;
	} catch (error) {
		await rollbackAddedUserPost({ userPost, imageIdentifier: uploadedImage.imageIdentifier });

		const fieldError = asFieldError(error);

		if (fieldError) {
			throw fieldError;
		}

		throw new AppError('Could not save the user post', 500, { cause: error });
	}
};

const FEED_CURSOR_SEPARATOR = '_';

const toFeedCursor = (post) => `${post.createdAt.getTime()}${FEED_CURSOR_SEPARATOR}${post._id}`;

const parseFeedCursor = (cursor) => {
	if (cursor === undefined) {
		return null;
	}

	const [timestamp, postId] = typeof cursor === 'string' ? cursor.split(FEED_CURSOR_SEPARATOR) : [];
	const createdAt = new Date(Number(timestamp));

	if (!timestamp || Number.isNaN(createdAt.getTime()) || !mongoose.isObjectIdOrHexString(postId)) {
		throw new AppError('cursor must be a feed cursor', 400, { code: ERROR_CODES.BAD_REQUEST });
	}

	return { createdAt, postId: new mongoose.Types.ObjectId(postId) };
};

const getFollowedUsersPosts = async (userId, { cursor } = {}) => {
	try {
		const parsedCursor = parseFeedCursor(cursor);
		const currentUser = await UserModel.findById(userId).select({ following: 1 });

		if (!currentUser) {
			throw new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED });
		}

		const hiddenVisitorIds = await getHiddenVisitorIds(userId);
		const filter = { userId: { $in: withoutHiddenIds(currentUser.following, hiddenVisitorIds) } };

		if (parsedCursor) {
			filter.$or = [{ createdAt: { $lt: parsedCursor.createdAt } }, { createdAt: parsedCursor.createdAt, _id: { $lt: parsedCursor.postId } }];
		}

		const fetchedPostDocs = await UserPostModel.find(filter)
			.sort({ createdAt: -1, _id: -1 })
			.limit(constants.FEED_POSTS_PAGE_SIZE + 1)
			.populate(AUTHOR_POPULATE);
		const hasMore = fetchedPostDocs.length > constants.FEED_POSTS_PAGE_SIZE;
		const followedUsersPostDocs = fetchedPostDocs.slice(0, constants.FEED_POSTS_PAGE_SIZE);

		const postIds = followedUsersPostDocs.map((post) => post._id);

		const applyVisibility = await createPostVisibility(postIds, hiddenVisitorIds);
		const previewComments = await commentService.getPreviewCommentsForPosts(postIds, hiddenVisitorIds);

		return {
			posts: followedUsersPostDocs.map((post) => ({
				...applyVisibility(post.toObject()),
				previewComments: previewComments[post._id.toString()] || [],
			})),
			hasMore,
			nextCursor: hasMore ? toFeedCursor(followedUsersPostDocs[followedUsersPostDocs.length - 1]) : null,
		};
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load followed users posts', 500, { cause: error });
	}
};

const updateUserPostLikes = async ({ userPostId, likesUpdate, viewerId }) => {
	if (!mongoose.isObjectIdOrHexString(userPostId)) {
		throw createPostNotFoundError();
	}

	const hiddenVisitorIds = await getHiddenVisitorIds(viewerId);
	const filter = hiddenVisitorIds.length ? { _id: userPostId, userId: { $nin: hiddenVisitorIds } } : { _id: userPostId };
	const updatedUserPost = await UserPostModel.findOneAndUpdate(filter, likesUpdate, { new: true });

	if (!updatedUserPost) {
		throw createPostNotFoundError();
	}

	const applyVisibility = await createPostVisibility([updatedUserPost._id], hiddenVisitorIds);

	return applyVisibility(updatedUserPost);
};

const likeUserPost = async ({ userPostId, userWhoLikedId }) => {
	try {
		return await updateUserPostLikes({ userPostId, likesUpdate: { $addToSet: { likes: userWhoLikedId } }, viewerId: userWhoLikedId });
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not like the post', 500, { cause: error });
	}
};

const unlikeUserPost = async ({ userPostId, userWhoUnlikedId }) => {
	try {
		return await updateUserPostLikes({ userPostId, likesUpdate: { $pull: { likes: userWhoUnlikedId } }, viewerId: userWhoUnlikedId });
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not unlike the post', 500, { cause: error });
	}
};

const getUserPostLikes = async ({ userPostId, requesterId }) => {
	try {
		if (!mongoose.isObjectIdOrHexString(userPostId)) {
			throw createPostNotFoundError();
		}

		const userPost = await UserPostModel.findById(userPostId).select({ likes: 1 });

		if (!userPost) {
			throw createPostNotFoundError();
		}

		const hiddenVisitorIds = await getHiddenVisitorIds(requesterId);

		await assertPostNotHidden(userPostId, hiddenVisitorIds);

		const visibleLikes = withoutHiddenIds(userPost.likes, hiddenVisitorIds);

		return await getUserRowsInOrder([...visibleLikes].reverse());
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load the likes', 500, { cause: error });
	}
};

const updateUserPostCaption = async ({ userPostId, userId, caption }) => {
	try {
		if (typeof caption !== 'string') {
			throw AppError.fromFields({ caption: ERROR_CODES.CAPTION_INVALID }, 400);
		}

		const userPost = await findOwnedUserPost({ userPostId, userId });

		userPost.caption = caption;

		await userPost.save();

		const applyVisibility = await createPostVisibility([userPost._id], await getHiddenVisitorIds(userId));

		return applyVisibility(userPost);
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		const fieldError = asFieldError(error);

		if (fieldError) {
			throw fieldError;
		}

		throw new AppError('Could not update the post', 500, { cause: error });
	}
};

const deleteUserPost = async ({ userPostId, userId }) => {
	try {
		const userPost = await findOwnedUserPost({ userPostId, userId });

		await imageStorageService.deleteImage(userPost.imageIdentifier);

		await commentService.deleteCommentsForPost({ userPostId: userPost._id });

		await UserPostModel.deleteOne({ _id: userPost._id });

		await UserModel.updateOne({ _id: userId }, { $pull: { posts: userPost._id } });
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not delete the post', 500, { cause: error });
	}
};

module.exports = {
	getAllUserPosts,
	addUserPost,
	getFollowedUsersPosts,
	likeUserPost,
	unlikeUserPost,
	getUserPostLikes,
	updateUserPostCaption,
	deleteUserPost,
};
