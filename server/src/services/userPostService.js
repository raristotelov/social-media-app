const mongoose = require('mongoose');

const UserPostModel = require('../models/userPostModel');
const UserModel = require('../models/userModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { createPostNotFoundError } = require('../utils/notFoundErrors');
const { asFieldError } = require('../utils/fieldErrors');
const commentService = require('./commentService');
const imageStorageService = require('./imageStorageService');

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

		return userPosts;
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
			caption,
			userId,
		});

		await userPost.save();

		await UserModel.findByIdAndUpdate(userId, {
			$addToSet: {
				posts: userPost._id,
			},
		});

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

const getFollowedUsersPosts = async (userId) => {
	try {
		const currentUser = await UserModel.findById(userId).select({ following: 1 });

		if (!currentUser) {
			throw new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED });
		}

		const followedUsersPostDocs = await UserPostModel.find({ userId: { $in: currentUser.following } })
			.sort({ createdAt: -1, _id: -1 })
			.populate(AUTHOR_POPULATE);

		const postIds = followedUsersPostDocs.map((post) => post._id);

		const [commentCounts, previewComments] = await Promise.all([
			commentService.getCommentCountsForPosts(postIds),
			commentService.getPreviewCommentsForPosts(postIds),
		]);

		return followedUsersPostDocs.map((post) => ({
			...post.toObject(),
			commentsCount: commentCounts[post._id.toString()] || 0,
			previewComments: previewComments[post._id.toString()] || [],
		}));
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load followed users posts', 500, { cause: error });
	}
};

const updateUserPostLikes = async ({ userPostId, likesUpdate }) => {
	if (!mongoose.isObjectIdOrHexString(userPostId)) {
		throw createPostNotFoundError();
	}

	const updatedUserPost = await UserPostModel.findOneAndUpdate({ _id: userPostId }, likesUpdate, { new: true });

	if (!updatedUserPost) {
		throw createPostNotFoundError();
	}

	return updatedUserPost;
};

const likeUserPost = async ({ userPostId, userWhoLikedId }) => {
	try {
		return await updateUserPostLikes({ userPostId, likesUpdate: { $addToSet: { likes: userWhoLikedId } } });
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not like the post', 500, { cause: error });
	}
};

const unlikeUserPost = async ({ userPostId, userWhoUnlikedId }) => {
	try {
		return await updateUserPostLikes({ userPostId, likesUpdate: { $pull: { likes: userWhoUnlikedId } } });
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not unlike the post', 500, { cause: error });
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

		return userPost;
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
	updateUserPostCaption,
	deleteUserPost,
};
