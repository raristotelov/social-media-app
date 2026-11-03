const mongoose = require('mongoose');

const CommentModel = require('../models/commentModel');
const UserPostModel = require('../models/userPostModel');
const UserModel = require('../models/userModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { createPostNotFoundError, createCommentNotFoundError } = require('../utils/notFoundErrors');
const { getUserRowsInOrder } = require('./userRowService');
const {
	assertCommentNotHidden,
	assertPostNotHidden,
	getHiddenVisitorIds,
	withoutHiddenCommentLikes,
	withoutHiddenIds,
} = require('./visitorVisibilityService');

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

		const hiddenVisitorIds = await getHiddenVisitorIds(userId);

		await assertPostNotHidden(userPostId, hiddenVisitorIds);

		if (parentCommentId) {
			await assertValidReplyParent({ parentCommentId, userPostId });
			await assertCommentNotHidden(parentCommentId, hiddenVisitorIds);
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
const getCommentsForPost = async ({ userPostId, requesterId }) => {
	try {
		await assertPostExists(userPostId);

		const hiddenVisitorIds = await getHiddenVisitorIds(requesterId);

		await assertPostNotHidden(userPostId, hiddenVisitorIds);

		const filter = hiddenVisitorIds.length ? { userPostId, userId: { $nin: hiddenVisitorIds } } : { userPostId };
		const comments = await CommentModel.find(filter).sort({ createdAt: 1 }).populate([AUTHOR_POPULATE, MENTIONED_USER_POPULATE]);

		const topLevel = [];
		const repliesByParent = {};

		comments.forEach((comment) => {
			if (comment.parentCommentId) {
				const key = comment.parentCommentId.toString();
				repliesByParent[key] = repliesByParent[key] || [];
				repliesByParent[key].push(withoutHiddenCommentLikes(comment.toObject(), hiddenVisitorIds));
			} else {
				topLevel.push(comment);
			}
		});

		return topLevel
			.map((comment) => ({
				...withoutHiddenCommentLikes(comment.toObject(), hiddenVisitorIds),
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

const updateCommentLikes = async ({ commentId, likesUpdate, viewerId }) => {
	if (!mongoose.isObjectIdOrHexString(commentId)) {
		throw createCommentNotFoundError();
	}

	const hiddenVisitorIds = await getHiddenVisitorIds(viewerId);

	await assertCommentNotHidden(commentId, hiddenVisitorIds);

	const updatedComment = await CommentModel.findByIdAndUpdate(commentId, likesUpdate, { new: true });

	if (!updatedComment) {
		throw createCommentNotFoundError();
	}

	return withoutHiddenCommentLikes(updatedComment, hiddenVisitorIds);
};

const likeComment = async ({ commentId, userId }) => {
	try {
		return await updateCommentLikes({ commentId, likesUpdate: { $addToSet: { likes: userId } }, viewerId: userId });
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not like comment', 500, { cause: error });
	}
};

const unlikeComment = async ({ commentId, userId }) => {
	try {
		return await updateCommentLikes({ commentId, likesUpdate: { $pull: { likes: userId } }, viewerId: userId });
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not unlike comment', 500, { cause: error });
	}
};

const getCommentLikes = async ({ commentId, requesterId }) => {
	try {
		if (!mongoose.isObjectIdOrHexString(commentId)) {
			throw createCommentNotFoundError();
		}

		const comment = await CommentModel.findById(commentId).select({ likes: 1 });

		if (!comment) {
			throw createCommentNotFoundError();
		}

		const hiddenVisitorIds = await getHiddenVisitorIds(requesterId);

		await assertCommentNotHidden(commentId, hiddenVisitorIds);

		const visibleLikes = withoutHiddenIds(comment.likes, hiddenVisitorIds);

		return await getUserRowsInOrder([...visibleLikes].reverse());
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load the likes', 500, { cause: error });
	}
};

const getPreviewCommentsForPosts = async (userPostIds, hiddenVisitorIds = []) => {
	try {
		const match = { userPostId: { $in: userPostIds }, parentCommentId: null };

		if (hiddenVisitorIds.length) {
			match.userId = { $nin: hiddenVisitorIds };
		}

		const previewGroups = await CommentModel.aggregate([
			{ $match: match },
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
			map[group._id.toString()] = group.comments.map((comment) =>
				withoutHiddenCommentLikes(populatedCommentsById.get(String(comment._id)), hiddenVisitorIds),
			);

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
	getCommentLikes,
	getPreviewCommentsForPosts,
	deleteCommentsForPost,
};
