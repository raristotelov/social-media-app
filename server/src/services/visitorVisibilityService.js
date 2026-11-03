const CommentModel = require('../models/commentModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { createCommentNotFoundError, createPostNotFoundError, createUserNotFoundError } = require('../utils/notFoundErrors');

const getHiddenVisitorIds = async (viewerId) => {
	const visitors = await UserModel.find({ accountType: 'demo' }).select({ _id: 1 }).lean();

	return visitors.map((visitor) => visitor._id).filter((visitorId) => String(visitorId) !== String(viewerId));
};

const hiddenIdSets = new WeakMap();

const toHiddenIdSet = (hiddenIds) => {
	if (!hiddenIdSets.has(hiddenIds)) {
		hiddenIdSets.set(hiddenIds, new Set(hiddenIds.map(String)));
	}

	return hiddenIdSets.get(hiddenIds);
};

const withoutHiddenIds = (ids, hiddenIds) => {
	if (!hiddenIds.length) {
		return ids;
	}

	const hiddenIdSet = toHiddenIdSet(hiddenIds);

	return ids.filter((id) => !hiddenIdSet.has(String(id)));
};

const isHiddenId = (id, hiddenIds) => hiddenIds.length > 0 && toHiddenIdSet(hiddenIds).has(String(id));

const assertUserNotHidden = (userId, hiddenIds) => {
	if (isHiddenId(userId, hiddenIds)) {
		throw createUserNotFoundError();
	}
};

const assertPostNotHidden = async (userPostId, hiddenIds) => {
	if (hiddenIds.length && (await UserPostModel.exists({ _id: userPostId, userId: { $in: hiddenIds } }))) {
		throw createPostNotFoundError();
	}
};

const assertCommentNotHidden = async (commentId, hiddenIds) => {
	if (!hiddenIds.length) {
		return;
	}

	const comment = await CommentModel.findById(commentId).select({ userId: 1, userPostId: 1 }).lean();

	if (!comment) {
		return;
	}

	if (isHiddenId(comment.userId, hiddenIds)) {
		throw createCommentNotFoundError();
	}

	if (await UserPostModel.exists({ _id: comment.userPostId, userId: { $in: hiddenIds } })) {
		throw createCommentNotFoundError();
	}
};

const toPlainObject = (document) => (typeof document.toObject === 'function' ? document.toObject() : document);

const getHiddenCommentIdsByPost = async (userPostIds, hiddenIds) => {
	const hiddenTopLevel = await CommentModel.find({ userPostId: { $in: userPostIds }, userId: { $in: hiddenIds } })
		.select({ _id: 1, userPostId: 1 })
		.lean();
	const repliesToHidden = await CommentModel.find({
		userPostId: { $in: userPostIds },
		parentCommentId: { $in: hiddenTopLevel.map((comment) => comment._id) },
	})
		.select({ _id: 1, userPostId: 1 })
		.lean();
	const hiddenIdsByPost = new Map();

	for (const comment of [...hiddenTopLevel, ...repliesToHidden]) {
		const key = String(comment.userPostId);

		hiddenIdsByPost.set(key, (hiddenIdsByPost.get(key) || new Set()).add(String(comment._id)));
	}

	return hiddenIdsByPost;
};

const createPostVisibility = async (userPostIds, hiddenIds) => {
	if (!hiddenIds.length) {
		return (post) => post;
	}

	const hiddenCommentIdsByPost = await getHiddenCommentIdsByPost(userPostIds, hiddenIds);

	return (post) => {
		const plainPost = toPlainObject(post);
		const hiddenCommentCount = hiddenCommentIdsByPost.get(String(plainPost._id))?.size || 0;

		return {
			...plainPost,
			likes: withoutHiddenIds(plainPost.likes || [], hiddenIds),
			commentsCount: Math.max((plainPost.commentsCount || 0) - hiddenCommentCount, 0),
		};
	};
};

const withoutHiddenCommentLikes = (comment, hiddenIds) => {
	if (!hiddenIds.length) {
		return comment;
	}

	const plainComment = toPlainObject(comment);

	return { ...plainComment, likes: withoutHiddenIds(plainComment.likes || [], hiddenIds) };
};

module.exports = {
	getHiddenVisitorIds,
	withoutHiddenIds,
	isHiddenId,
	assertUserNotHidden,
	assertPostNotHidden,
	assertCommentNotHidden,
	createPostVisibility,
	withoutHiddenCommentLikes,
};
