const CommentModel = require('../models/commentModel');
const AppError = require('../utils/AppError');

const AUTHOR_POPULATE = {
	path: 'userId',
	select: 'username profilePicture',
	populate: { path: 'profilePicture' },
};

const addComment = async ({ userPostId, userId, text, parentCommentId }) => {
	try {
		if (!text || !text.trim()) {
			throw new AppError('Comment text is required', 400);
		}

		const comment = new CommentModel({
			userPostId,
			userId,
			text: text.trim(),
			parentCommentId: parentCommentId || null,
		});

		await comment.save();
		await comment.populate(AUTHOR_POPULATE);

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
		const comments = await CommentModel.find({ userPostId }).sort({ createdAt: 1 }).populate(AUTHOR_POPULATE);

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

		return topLevel.map((comment) => ({
			...comment.toObject(),
			replies: repliesByParent[comment._id.toString()] || [],
		}));
	} catch (error) {
		throw new AppError('Could not load comments', 500, { cause: error });
	}
};

const likeComment = async ({ commentId, userId }) => {
	try {
		const updatedComment = await CommentModel.findByIdAndUpdate(commentId, { $addToSet: { likes: userId } }, { new: true });

		return updatedComment;
	} catch (error) {
		throw new AppError('Could not like comment', 500, { cause: error });
	}
};

const unlikeComment = async ({ commentId, userId }) => {
	try {
		const updatedComment = await CommentModel.findByIdAndUpdate(commentId, { $pull: { likes: userId } }, { new: true });

		return updatedComment;
	} catch (error) {
		throw new AppError('Could not unlike comment', 500, { cause: error });
	}
};

// Map of userPostId -> total comment count (comments + replies) for feed cards.
const getCommentCountsForPosts = async (userPostIds) => {
	try {
		const counts = await CommentModel.aggregate([
			{ $match: { userPostId: { $in: userPostIds } } },
			{ $group: { _id: '$userPostId', count: { $sum: 1 } } },
		]);

		return counts.reduce((map, entry) => {
			map[entry._id.toString()] = entry.count;
			return map;
		}, {});
	} catch (error) {
		throw new AppError('Could not load comment counts', 500, { cause: error });
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
	getCommentCountsForPosts,
	deleteCommentsForPost,
};
