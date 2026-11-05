const CommentModel = require('../models/commentModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const UserPostModel = require('../models/userPostModel');
const notificationService = require('../services/notificationService');

const EVENT_BATCH_SIZE = 1000;

const applyComment = async (event) => {
	if (!(await UserPostModel.exists({ _id: event.userPostId }))) {
		return;
	}

	if (event.parentCommentId && !(await CommentModel.exists({ _id: event.parentCommentId }))) {
		return;
	}

	if (await CommentModel.exists({ _id: event.commentId })) {
		return;
	}

	await CommentModel.create({
		_id: event.commentId,
		userPostId: event.userPostId,
		userId: event.userId,
		text: event.text,
		parentCommentId: event.parentCommentId || null,
		mentionedUserId: event.mentionedUserId || null,
		createdAt: event.dueAt,
	});
	await UserPostModel.updateOne({ _id: event.userPostId }, { $inc: { commentsCount: 1 } });
	await notificationService.notifyComment({ commentId: event.commentId });
};

const applyPostLike = async (event) => {
	const { modifiedCount } = await UserPostModel.updateOne(
		{ _id: event.userPostId, likes: { $ne: event.userId } },
		{ $push: { likes: event.userId } },
	);

	if (modifiedCount) {
		await notificationService.notifyPostLike({ actorId: event.userId, userPostId: event.userPostId });
	}
};

const applyCommentLike = async (event) => {
	const { modifiedCount } = await CommentModel.updateOne(
		{ _id: event.commentId, likes: { $ne: event.userId } },
		{ $push: { likes: event.userId } },
	);

	if (modifiedCount) {
		await notificationService.notifyCommentLike({ actorId: event.userId, commentId: event.commentId });
	}
};

const applyEvent = async (event) => {
	if (event.type === 'postLike') {
		await applyPostLike(event);
	} else if (event.type === 'comment') {
		await applyComment(event);
	} else if (event.type === 'commentLike') {
		await applyCommentLike(event);
	}
};

const applyDueEvents = async (now) => {
	for (;;) {
		const events = await DemoScheduledEventModel.find({ dueAt: { $lte: now } })
			.sort({ dueAt: 1 })
			.limit(EVENT_BATCH_SIZE)
			.lean();

		if (!events.length) {
			return;
		}

		for (const event of events) {
			await applyEvent(event);
		}

		await DemoScheduledEventModel.deleteMany({ _id: { $in: events.map((event) => event._id) } });
	}
};

module.exports = {
	applyEvent,
	applyDueEvents,
};
