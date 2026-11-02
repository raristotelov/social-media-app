const CommentModel = require('../models/commentModel');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const StoryModel = require('../models/storyModel');
const StoryViewModel = require('../models/storyViewModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { deleteImage } = require('../services/imageStorageService');
const { DEMO_EMAIL_DOMAIN } = require('./buildDemoData');

const DEMO_EMAIL_PATTERN = new RegExp(`@${DEMO_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`);

const countByPost = (comments) =>
	comments.reduce((counts, comment) => {
		const key = String(comment.userPostId);
		counts.set(key, (counts.get(key) || 0) + 1);

		return counts;
	}, new Map());

const clearDemoContent = async () => {
	await DemoActivityRunModel.deleteMany({});
	await DemoScheduledEventModel.deleteMany({});
	await DemoAccountStateModel.deleteMany({});

	const demoUserIds = (await UserModel.find({ email: DEMO_EMAIL_PATTERN }).select({ _id: 1 }).lean()).map((user) => user._id);

	if (!demoUserIds.length) {
		return 0;
	}

	const demoPostIds = (
		await UserPostModel.find({ userId: { $in: demoUserIds } })
			.select({ _id: 1 })
			.lean()
	).map((post) => post._id);
	const demoStories = await StoryModel.find({ userId: { $in: demoUserIds } })
		.select({ _id: 1, imageIdentifier: 1 })
		.lean();

	for (const story of demoStories) {
		await deleteImage(story.imageIdentifier);
	}

	await StoryViewModel.deleteMany({ $or: [{ storyId: { $in: demoStories.map((story) => story._id) } }, { viewerId: { $in: demoUserIds } }] });
	await StoryModel.deleteMany({ userId: { $in: demoUserIds } });

	const removedComments = await CommentModel.find({ $or: [{ userPostId: { $in: demoPostIds } }, { userId: { $in: demoUserIds } }] })
		.select({ _id: 1, userPostId: 1 })
		.lean();
	const orphanedReplies = await CommentModel.find({
		parentCommentId: { $in: removedComments.map((comment) => comment._id) },
		_id: { $nin: removedComments.map((comment) => comment._id) },
	})
		.select({ _id: 1, userPostId: 1 })
		.lean();
	const allRemovedComments = [...removedComments, ...orphanedReplies];
	const demoPostIdSet = new Set(demoPostIds.map(String));

	for (const [userPostId, count] of countByPost(allRemovedComments)) {
		if (!demoPostIdSet.has(userPostId)) {
			await UserPostModel.updateOne({ _id: userPostId }, { $inc: { commentsCount: -count } });
		}
	}

	await CommentModel.deleteMany({ _id: { $in: allRemovedComments.map((comment) => comment._id) } });
	await CommentModel.updateMany({ likes: { $in: demoUserIds } }, { $pull: { likes: { $in: demoUserIds } } });
	await CommentModel.updateMany({ mentionedUserId: { $in: demoUserIds } }, { $set: { mentionedUserId: null } });
	await UserPostModel.updateMany({ likes: { $in: demoUserIds } }, { $pull: { likes: { $in: demoUserIds } } });
	await UserPostModel.deleteMany({ _id: { $in: demoPostIds } });
	await UserModel.updateMany(
		{ $or: [{ followers: { $in: demoUserIds } }, { following: { $in: demoUserIds } }] },
		{ $pull: { followers: { $in: demoUserIds }, following: { $in: demoUserIds } } },
	);
	await UserModel.deleteMany({ _id: { $in: demoUserIds } });

	return demoUserIds.length;
};

module.exports = {
	DEMO_EMAIL_PATTERN,
	clearDemoContent,
};
