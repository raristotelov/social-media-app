const CommentModel = require('../models/commentModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const StoryModel = require('../models/storyModel');
const StoryViewModel = require('../models/storyViewModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { deleteImage } = require('../services/imageStorageService');
const notificationService = require('../services/notificationService');

const countByPost = (comments) =>
	comments.reduce((counts, comment) => {
		const key = String(comment.userPostId);
		counts.set(key, (counts.get(key) || 0) + 1);

		return counts;
	}, new Map());

const deleteUploadedImagesOf = async (userIds, posts) => {
	const users = await UserModel.find({ _id: { $in: userIds } })
		.select({ profilePicture: 1 })
		.lean();

	for (const post of posts) {
		await deleteImage(post.imageIdentifier);
	}

	for (const user of users) {
		await deleteImage(user.profilePicture?.imageIdentifier);
	}
};

const removeUsersWithContent = async (userIds, { deleteUploadedImages = false } = {}) => {
	if (!userIds.length) {
		return 0;
	}

	const posts = await UserPostModel.find({ userId: { $in: userIds } })
		.select({ _id: 1, imageIdentifier: 1 })
		.lean();
	const postIds = posts.map((post) => post._id);
	const stories = await StoryModel.find({ userId: { $in: userIds } })
		.select({ _id: 1, imageIdentifier: 1 })
		.lean();

	if (deleteUploadedImages) {
		await deleteUploadedImagesOf(userIds, posts);
	}

	for (const story of stories) {
		await deleteImage(story.imageIdentifier);
	}

	await StoryViewModel.deleteMany({ $or: [{ storyId: { $in: stories.map((story) => story._id) } }, { viewerId: { $in: userIds } }] });
	await StoryModel.deleteMany({ userId: { $in: userIds } });
	await DemoScheduledEventModel.deleteMany({ $or: [{ userPostId: { $in: postIds } }, { userId: { $in: userIds } }] });

	const removedComments = await CommentModel.find({ $or: [{ userPostId: { $in: postIds } }, { userId: { $in: userIds } }] })
		.select({ _id: 1, userPostId: 1 })
		.lean();
	const orphanedReplies = await CommentModel.find({
		parentCommentId: { $in: removedComments.map((comment) => comment._id) },
		_id: { $nin: removedComments.map((comment) => comment._id) },
	})
		.select({ _id: 1, userPostId: 1 })
		.lean();
	const allRemovedComments = [...removedComments, ...orphanedReplies];
	const removedPostIdSet = new Set(postIds.map(String));

	for (const [userPostId, count] of countByPost(allRemovedComments)) {
		if (!removedPostIdSet.has(userPostId)) {
			await UserPostModel.updateOne({ _id: userPostId }, { $inc: { commentsCount: -count } });
		}
	}

	await CommentModel.deleteMany({ _id: { $in: allRemovedComments.map((comment) => comment._id) } });
	await CommentModel.updateMany({ likes: { $in: userIds } }, { $pull: { likes: { $in: userIds } } });
	await CommentModel.updateMany({ mentionedUserId: { $in: userIds } }, { $set: { mentionedUserId: null } });
	await UserPostModel.updateMany({ likes: { $in: userIds } }, { $pull: { likes: { $in: userIds } } });
	await UserPostModel.deleteMany({ _id: { $in: postIds } });
	await notificationService.removeNotificationsForComments({ commentIds: allRemovedComments.map((comment) => comment._id) });
	await notificationService.removeNotificationsForPosts({ userPostIds: postIds });
	await notificationService.removeNotificationsForUsers({ userIds });
	await UserModel.updateMany(
		{ $or: [{ followers: { $in: userIds } }, { following: { $in: userIds } }] },
		{ $pull: { followers: { $in: userIds }, following: { $in: userIds } } },
	);
	await UserModel.deleteMany({ _id: { $in: userIds } });

	return userIds.length;
};

module.exports = {
	removeUsersWithContent,
};
