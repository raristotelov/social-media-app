const mongoose = require('mongoose');

const UserPostModel = require('../models/userPostModel');
const UserModel = require('../models/userModel');
const AppError = require('../utils/AppError');
const commentService = require('./commentService');
const imageStorageService = require('./imageStorageService');

const findOwnedUserPost = async ({ userPostId, userId }) => {
	if (!mongoose.isValidObjectId(userPostId)) {
		throw new AppError('Post not found', 404);
	}

	const userPost = await UserPostModel.findById(userPostId);

	if (!userPost) {
		throw new AppError('Post not found', 404);
	}

	if (!userPost.userId || userPost.userId.toString() !== String(userId)) {
		throw new AppError('You can only change your own posts', 403);
	}

	const isListedPost = await UserModel.exists({ _id: userId, posts: userPost._id });

	if (!isListedPost) {
		throw new AppError('Post not found', 404);
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

const addUserPost = async (postData, userId) => {
	try {
		const userPost = new UserPostModel({
			imageIdentifier: postData.imageIdentifier,
			imageUrl: postData.imageUrl,
			caption: postData.caption,
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
		throw new AppError('Could not save the user post', 500, { cause: error });
	}
};

const getFollowedUsersPosts = async (userId) => {
	try {
		const userResult = await UserModel.find({ _id: userId }).select({ following: 1 }).populate({ path: 'following', populate: 'posts' });

		const currentUser = userResult[0];

		const currentUserFollowedUsers = currentUser.following;

		const followedUsersPosts = [];

		for (let i = 0; i < currentUserFollowedUsers.length; i += 1) {
			const followedUser = currentUserFollowedUsers[i];

			if (followedUser?.posts?.length) {
				followedUsersPosts.push(...followedUser.posts);
			}
		}

		return followedUsersPosts;
	} catch (error) {
		throw new AppError('Could not load followed users posts', 500, { cause: error });
	}
};

const likeUserPost = async ({ userPostId, userWhoLikedId }) => {
	try {
		const updatedUserPostData = await UserPostModel.findOneAndUpdate({ _id: userPostId }, { $push: { likes: userWhoLikedId } }, { new: true });

		return updatedUserPostData;
	} catch (error) {
		throw new AppError('Could not like the post', 500, { cause: error });
	}
};

const unlikeUserPost = async ({ userPostId, userWhoUnlikedId }) => {
	try {
		const updatedUserPostData = await UserPostModel.findOneAndUpdate({ _id: userPostId }, { $pull: { likes: userWhoUnlikedId } }, { new: true });

		return updatedUserPostData;
	} catch (error) {
		throw new AppError('Could not unlike the post', 500, { cause: error });
	}
};

const updateUserPostCaption = async ({ userPostId, userId, caption }) => {
	try {
		if (typeof caption !== 'string') {
			const message = 'Caption must be text';

			throw new AppError(message, 400, { fields: { caption: message } });
		}

		const userPost = await findOwnedUserPost({ userPostId, userId });

		userPost.caption = caption;

		await userPost.save();

		return userPost;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
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
