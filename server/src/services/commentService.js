const mongoose = require('mongoose');

const CommentModel = require('../models/commentModel');
const UserPostModel = require('../models/userPostModel');
const UserModel = require('../models/userModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { createPostNotFoundError, createCommentNotFoundError } = require('../utils/notFoundErrors');

const AUTHOR_POPULATE = {
	path: 'userId',
	select: 'username profilePicture',
};

const MENTIONED_USER_POPULATE = {
	path: 'mentionedUserId',
	select: 'username',
};

const compareTopLevelComments = (a, b) => b.likes.length - a.likes.length || new Date(b.createdAt) - new Date(a.createdAt);

const assertPostExists = async (userPostId) => {
	if (!mongoose.isObjectIdOrHexString(userPostId) || !(await UserPostModel.exists({ _id: userPostId }))) {
		throw createPostNotFoundError();
	}
};

const assertValidReplyParent = async ({ parentCommentId, userPostId }) => {
	if (
		!mongoose.isObjectIdOrHexString(parentCommentId) ||
		!(await CommentModel.exists({ _id: parentCommentId, userPostId, parentCommentId: null }))
	) {
		throw createCommentNotFoundError();
	}
};

const resolveMentionedUserId = async ({ mentionedUserId, text }) => {
	if (!mongoose.isObjectIdOrHexString(mentionedUserId)) {
		return null;
	}

	const mentionedUser = await UserModel.findById(mentionedUserId).select({ username: 1 });

	if (mentionedUser && text.startsWith(`@${mentionedUser.username}`)) {
		return mentionedUser._id;
	}

	return null;
};

const addComment = async ({ userPostId, userId, text, parentCommentId, mentionedUserId }) => {
	try {
		if (typeof text !== 'string' || !text.trim()) {
			throw new AppError('Comment text is required', 400, { code: ERROR_CODES.COMMENT_TEXT_REQUIRED });
		}

		await assertPostExists(userPostId);

		if (parentCommentId) {
			await assertValidReplyParent({ parentCommentId, userPostId });
		}

		const trimmedText = text.trim();

		const comment = new CommentModel({
			userPostId,
			userId,
			text: trimmedText,
			parentCommentId: parentCommentId || null,
			mentionedUserId: parentCommentId ? await resolveMentionedUserId({ mentionedUserId, text: trimmedText }) : null,
		});

		await comment.save();
		await UserPostModel.updateOne({ _id: userPostId }, { $inc: { commentsCount: 1 } });
		await comment.populate([AUTHOR_POPULATE, MENTIONED_USER_POPULATE]);

		return comment;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not add comment', 500, { cause: error });
	}
};

// Returns top-level comments for a post, each with a nested `replies` array.
const getCommentsForPost = async ({ userPostId }) => {
	try {
		await assertPostExists(userPostId);

		const comments = await CommentModel.find({ userPostId }).sort({ createdAt: 1 }).populate([AUTHOR_POPULATE, MENTIONED_USER_POPULATE]);

		const topLevel = [];
		const repliesByParent = {};

		comments.forEach((comment) => {
			if (comment.parentCommentId) {
				const key = comment.parentCommentId.toString();
				repliesByParent[key] = repliesByParent[key] || [];
				repliesByParent[key].push(comment.toObject());
			} else {
				topLevel.push(comment);
			}
		});

		return topLevel
			.map((comment) => ({
				...comment.toObject(),
				replies: repliesByParent[comment._id.toString()] || [],
			}))
			.sort(compareTopLevelComments);
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load comments', 500, { cause: error });
	}
};

const updateCommentLikes = async ({ commentId, likesUpdate }) => {
	if (!mongoose.isObjectIdOrHexString(commentId)) {
		throw createCommentNotFoundError();
	}

	const updatedComment = await CommentModel.findByIdAndUpdate(commentId, likesUpdate, { new: true });

	if (!updatedComment) {
		throw createCommentNotFoundError();
	}

	return updatedComment;
};

const likeComment = async ({ commentId, userId }) => {
	try {
		return await updateCommentLikes({ commentId, likesUpdate: { $addToSet: { likes: userId } } });
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not like comment', 500, { cause: error });
	}
};

const unlikeComment = async ({ commentId, userId }) => {
	try {
		return await updateCommentLikes({ commentId, likesUpdate: { $pull: { likes: userId } } });
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not unlike comment', 500, { cause: error });
	}
};

const getPreviewCommentsForPosts = async (userPostIds) => {
	try {
		const previewGroups = await CommentModel.aggregate([
			{ $match: { userPostId: { $in: userPostIds }, parentCommentId: null } },
			{ $addFields: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
			{ $sort: { likesCount: -1, createdAt: -1, _id: -1 } },
			{ $group: { _id: '$userPostId', comments: { $push: '$$ROOT' } } },
			{ $project: { comments: { $slice: ['$comments', constants.COMMENT_PREVIEW_LIMIT] } } },
			{ $unset: 'comments.likesCount' },
		]);

		const populatedComments = await CommentModel.populate(
			previewGroups.flatMap((group) => group.comments),
			AUTHOR_POPULATE,
		);

		const populatedCommentsById = new Map(populatedComments.map((comment) => [String(comment._id), comment]));

		return previewGroups.reduce((map, group) => {
			map[group._id.toString()] = group.comments.map((comment) => populatedCommentsById.get(String(comment._id)));

			return map;
		}, {});
	} catch (error) {
		throw new AppError('Could not load preview comments', 500, { cause: error });
	}
};

const deleteCommentsForPost = async ({ userPostId }) => {
	try {
		const postComments = await CommentModel.find({ userPostId }).select({ _id: 1 });
		const commentIds = postComments.map((comment) => comment._id);

		await CommentModel.deleteMany({ $or: [{ userPostId }, { parentCommentId: { $in: commentIds } }] });
	} catch (error) {
		throw new AppError('Could not delete comments', 500, { cause: error });
	}
};

module.exports = {
	addComment,
	getCommentsForPost,
	likeComment,
	unlikeComment,
	getPreviewCommentsForPosts,
	deleteCommentsForPost,
};
