const CommentModel = require('../models/commentModel');
const NotificationModel = require('../models/notificationModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { parseKeysetCursor, toKeysetCursor, toKeysetFilter } = require('../utils/keysetCursor');

const { NOTIFICATION_TYPES } = constants;

const DEMO_ACCOUNT_TYPE = 'demo';
const WHITESPACE_PATTERN = /\s+/g;

const ONE_PER_ACTOR_TYPES = new Set([NOTIFICATION_TYPES.FOLLOW, NOTIFICATION_TYPES.POST_LIKE, NOTIFICATION_TYPES.COMMENT_LIKE]);
const POST_TYPES = new Set([
	NOTIFICATION_TYPES.POST_LIKE,
	NOTIFICATION_TYPES.COMMENT_LIKE,
	NOTIFICATION_TYPES.COMMENT,
	NOTIFICATION_TYPES.REPLY,
	NOTIFICATION_TYPES.REPLY_ON_POST,
]);
const COMMENT_TYPES = new Set([
	NOTIFICATION_TYPES.COMMENT_LIKE,
	NOTIFICATION_TYPES.COMMENT,
	NOTIFICATION_TYPES.REPLY,
	NOTIFICATION_TYPES.REPLY_ON_POST,
]);

const NOTIFICATION_POPULATE = [
	{ path: 'actorId', select: 'username profilePicture' },
	{ path: 'userPostId', select: 'imageUrl userId' },
	{ path: 'commentId', select: 'text' },
];

const isSameId = (a, b) => String(a) === String(b);

const canNotify = async ({ actorId, recipientId }) => {
	if (isSameId(actorId, recipientId)) {
		return false;
	}

	const users = await UserModel.find({ _id: { $in: [actorId, recipientId] } })
		.select({ accountType: 1 })
		.lean();
	const accountTypeById = new Map(users.map((user) => [String(user._id), user.accountType]));

	return (
		accountTypeById.has(String(actorId)) &&
		accountTypeById.get(String(actorId)) !== DEMO_ACCOUNT_TYPE &&
		constants.NOTIFICATION_RECIPIENT_ACCOUNT_TYPES.includes(accountTypeById.get(String(recipientId)))
	);
};

const createNotification = async ({ actorId, recipientId, type, userPostId, commentId }) => {
	const fields = {
		recipientId,
		actorId,
		type,
		...(userPostId && { userPostId }),
		...(commentId && { commentId }),
	};

	try {
		if (ONE_PER_ACTOR_TYPES.has(type)) {
			await NotificationModel.updateOne(fields, { $setOnInsert: { isRead: false, createdAt: new Date() } }, { upsert: true });

			return;
		}

		await NotificationModel.create(fields);
	} catch (error) {
		if (error?.code !== constants.DUPLICATE_KEY_ERROR_CODE) {
			throw error;
		}
	}
};

const createNotificationIfAllowed = async (fields) => {
	if (await canNotify(fields)) {
		await createNotification(fields);
	}
};

const withLogging = (description, action) => async (args) => {
	try {
		await action(args);
	} catch (error) {
		console.error(`Could not ${description}`, error);
	}
};

const notifyFollow = withLogging('create a follow notification', ({ actorId, recipientId }) =>
	createNotificationIfAllowed({ actorId, recipientId, type: NOTIFICATION_TYPES.FOLLOW }),
);

const notifyPostLike = withLogging('create a post like notification', async ({ actorId, userPostId }) => {
	const post = await UserPostModel.findById(userPostId).select({ userId: 1 }).lean();

	if (post?.userId) {
		await createNotificationIfAllowed({ actorId, recipientId: post.userId, type: NOTIFICATION_TYPES.POST_LIKE, userPostId });
	}
});

const notifyCommentLike = withLogging('create a comment like notification', async ({ actorId, commentId }) => {
	const comment = await CommentModel.findById(commentId).select({ userId: 1, userPostId: 1 }).lean();

	if (comment) {
		await createNotificationIfAllowed({
			actorId,
			recipientId: comment.userId,
			type: NOTIFICATION_TYPES.COMMENT_LIKE,
			userPostId: comment.userPostId,
			commentId,
		});
	}
});

const notifyComment = withLogging('create a comment notification', async ({ commentId }) => {
	const comment = await CommentModel.findById(commentId).select({ userId: 1, userPostId: 1, parentCommentId: 1 }).lean();
	const post = comment ? await UserPostModel.findById(comment.userPostId).select({ userId: 1 }).lean() : null;

	if (!post?.userId) {
		return;
	}

	const { userId: actorId, userPostId, parentCommentId } = comment;

	if (!parentCommentId) {
		await createNotificationIfAllowed({ actorId, recipientId: post.userId, type: NOTIFICATION_TYPES.COMMENT, userPostId, commentId });

		return;
	}

	const parentComment = await CommentModel.findById(parentCommentId).select({ userId: 1 }).lean();

	if (!parentComment) {
		return;
	}

	await createNotificationIfAllowed({ actorId, recipientId: parentComment.userId, type: NOTIFICATION_TYPES.REPLY, userPostId, commentId });

	if (!isSameId(parentComment.userId, post.userId)) {
		await createNotificationIfAllowed({ actorId, recipientId: post.userId, type: NOTIFICATION_TYPES.REPLY_ON_POST, userPostId, commentId });
	}
});

const removeFollowNotification = withLogging('remove a follow notification', ({ actorId, recipientId }) =>
	NotificationModel.deleteMany({ actorId, recipientId, type: NOTIFICATION_TYPES.FOLLOW }),
);

const removePostLikeNotification = withLogging('remove a post like notification', ({ actorId, userPostId }) =>
	NotificationModel.deleteMany({ actorId, userPostId, type: NOTIFICATION_TYPES.POST_LIKE }),
);

const removeCommentLikeNotification = withLogging('remove a comment like notification', ({ actorId, commentId }) =>
	NotificationModel.deleteMany({ actorId, commentId, type: NOTIFICATION_TYPES.COMMENT_LIKE }),
);

const removeNotificationsForPosts = withLogging('remove the notifications of posts', ({ userPostIds }) =>
	NotificationModel.deleteMany({ userPostId: { $in: userPostIds } }),
);

const removeNotificationsForComments = withLogging('remove the notifications of comments', ({ commentIds }) =>
	NotificationModel.deleteMany({ commentId: { $in: commentIds } }),
);

const removeNotificationsForUsers = withLogging('remove the notifications of users', ({ userIds }) =>
	NotificationModel.deleteMany({ $or: [{ actorId: { $in: userIds } }, { recipientId: { $in: userIds } }] }),
);

const toExcerpt = (text) => {
	const normalizedText = text.replace(WHITESPACE_PATTERN, ' ').trim();

	if (normalizedText.length <= constants.NOTIFICATION_EXCERPT_MAX_LENGTH) {
		return normalizedText;
	}

	return `${normalizedText.slice(0, constants.NOTIFICATION_EXCERPT_MAX_LENGTH).trimEnd()}${constants.NOTIFICATION_EXCERPT_ELLIPSIS}`;
};

const isMissingReference = (notification) => {
	const { type, actorId: actor, userPostId: post, commentId: comment } = notification;

	return !actor || (POST_TYPES.has(type) && !post) || (COMMENT_TYPES.has(type) && !comment);
};

const toNotificationItem = (notification) => {
	const { _id, type, createdAt, actorId: actor, userPostId: post, commentId: comment } = notification;

	return {
		_id,
		type,
		createdAt,
		actor: {
			_id: actor._id,
			username: actor.username,
			profilePicture: actor.profilePicture ? { imageUrl: actor.profilePicture.imageUrl } : undefined,
		},
		post: post ? { _id: post._id, imageUrl: post.imageUrl, userId: post.userId } : null,
		excerpt: comment ? toExcerpt(comment.text) : null,
	};
};

const getOldestUnreadCreatedAt = async (recipientId) => {
	const oldestUnread = await NotificationModel.findOne({ recipientId, isRead: false })
		.sort({ createdAt: 1, _id: 1 })
		.select({ createdAt: 1 })
		.lean();

	return oldestUnread ? oldestUnread.createdAt : null;
};

const getUnreadCount = async (userId) => {
	try {
		const count = await NotificationModel.countDocuments({ recipientId: userId, isRead: false });

		return { count };
	} catch (error) {
		throw new AppError('Could not load the unread count', 500, { cause: error });
	}
};

const getNotifications = async (userId, { cursor } = {}) => {
	try {
		const fetchedAt = new Date();
		const parsedCursor = parseKeysetCursor(cursor);
		const filter = { recipientId: userId };

		if (parsedCursor) {
			filter.$or = toKeysetFilter(parsedCursor);
		}

		const fetchedNotifications = await NotificationModel.find(filter)
			.sort({ createdAt: -1, _id: -1 })
			.limit(constants.NOTIFICATIONS_PAGE_SIZE + 1)
			.populate(NOTIFICATION_POPULATE)
			.lean();
		const hasMore = fetchedNotifications.length > constants.NOTIFICATIONS_PAGE_SIZE;
		const pageNotifications = fetchedNotifications.slice(0, constants.NOTIFICATIONS_PAGE_SIZE);

		const page = {
			notifications: pageNotifications.filter((notification) => !isMissingReference(notification)).map(toNotificationItem),
			hasMore,
			nextCursor: hasMore ? toKeysetCursor(pageNotifications[pageNotifications.length - 1]) : null,
			fetchedAt,
		};

		if (!parsedCursor) {
			page.unreadSince = await getOldestUnreadCreatedAt(userId);
		}

		return page;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load notifications', 500, { cause: error });
	}
};

const parseCutoff = (cutoff) => {
	const cutoffDate = typeof cutoff === 'string' ? new Date(cutoff) : null;

	if (!cutoffDate || Number.isNaN(cutoffDate.getTime())) {
		throw new AppError('cutoff must be a date', 400, { code: ERROR_CODES.BAD_REQUEST });
	}

	return cutoffDate;
};

const markAllRead = async (userId, { cutoff } = {}) => {
	const cutoffDate = parseCutoff(cutoff);

	try {
		await NotificationModel.updateMany({ recipientId: userId, isRead: false, createdAt: { $lte: cutoffDate } }, { $set: { isRead: true } });
	} catch (error) {
		throw new AppError('Could not mark notifications as read', 500, { cause: error });
	}
};

module.exports = {
	notifyFollow,
	notifyPostLike,
	notifyCommentLike,
	notifyComment,
	removeFollowNotification,
	removePostLikeNotification,
	removeCommentLikeNotification,
	removeNotificationsForPosts,
	removeNotificationsForComments,
	removeNotificationsForUsers,
	getUnreadCount,
	getNotifications,
	markAllRead,
};
