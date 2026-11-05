const { cloudinary } = require('../config/cloudinary');
const constants = require('../config/constants');
const CommentModel = require('../models/commentModel');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const StoryModel = require('../models/storyModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const objectIdFromDate = require('../utils/objectIdFromDate');
const notificationService = require('../services/notificationService');
const config = require('./demoConfig');
const { createPhotoLookup, createCaptionPicker, planPostEngagement, pickWeighted } = require('./contentPlanning');
const { loadDemoData } = require('./loadDemoData');
const { pickOne, shuffle } = require('./random');
const { removeExpiredVisitors } = require('./removeExpiredVisitors');
const { applyDueEvents } = require('./scheduledEvents');

const POSTING_HOURS_PER_DAY = config.LAST_POSTING_HOUR - config.FIRST_POSTING_HOUR + 1;
const AVERAGE_STORIES_PER_DAY = (config.STORIES_PER_DAY[0] + config.STORIES_PER_DAY[1]) / 2;
const HOURS_PER_DAY = 24;

const floorToHour = (date) => new Date(Math.floor(date.getTime() / config.HOUR_MS) * config.HOUR_MS);

const isPostingHour = (hourStart) => hourStart.getUTCHours() >= config.FIRST_POSTING_HOUR && hourStart.getUTCHours() <= config.LAST_POSTING_HOUR;

const isLastPostingHour = (hourStart) => hourStart.getUTCHours() === config.LAST_POSTING_HOUR;

const randomTimeInHour = (hourStart, random) => new Date(hourStart.getTime() + random() * config.HOUR_MS);

const countFromExpected = (expected, random) => Math.floor(expected) + (random() < expected % 1 ? 1 : 0);

const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const loadContext = async (random) => {
	const data = await loadDemoData();
	const states = await DemoAccountStateModel.find();
	const users = await UserModel.find({ _id: { $in: states.map((state) => state.userId) } })
		.select({ username: 1, followers: 1, following: 1 })
		.lean();

	return {
		captionBanks: data.captionBanks,
		replies: data.replies,
		lookupPhoto: createPhotoLookup(data.photosManifest),
		pickCaption: createCaptionPicker(data.captionBanks, random),
		states,
		usersById: new Map(users.map((user) => [String(user._id), user])),
		allAccountIds: states.map((state) => state.userId),
		usernames: new Map(states.map((state) => [String(state.userId), state.username])),
	};
};

const toScheduledEvents = (engagement, userPostId) => [
	...engagement.likes.map((like) => ({ dueAt: like.at, type: 'postLike', userPostId, userId: like.userId })),
	...engagement.comments.flatMap((comment) => [
		{
			dueAt: comment.at,
			type: 'comment',
			userPostId,
			userId: comment.userId,
			commentId: comment._id,
			text: comment.text,
			parentCommentId: comment.parentCommentId || undefined,
			mentionedUserId: comment.mentionedUserId || undefined,
		},
		...comment.likes.map((like) => ({ dueAt: like.at, type: 'commentLike', userPostId, userId: like.userId, commentId: comment._id })),
	]),
];

const createPost = async (context, state, at, random) => {
	const source = state.queue.shift();

	if (!source) {
		return false;
	}

	const previousIndex = state.previousCaptions.findIndex((entry) => entry.source === source);
	const previousCaption = previousIndex === -1 ? undefined : state.previousCaptions[previousIndex].caption;
	const caption = context.pickCaption({ username: state.username, folder: state.folder }, source, previousCaption);
	const photo = context.lookupPhoto(source);
	const post = await UserPostModel.create({
		imageIdentifier: photo.imageIdentifier,
		imageUrl: photo.imageUrl,
		imageWidth: photo.imageWidth,
		imageHeight: photo.imageHeight,
		caption,
		userId: state.userId,
		likes: [],
		commentsCount: 0,
		createdAt: at,
		updatedAt: at,
	});

	await UserModel.updateOne({ _id: state.userId }, { $push: { posts: post._id } });

	const engagement = planPostEngagement({
		postId: post._id,
		postTime: at,
		owner: { id: state.userId, tier: state.tier },
		source,
		captionBanks: context.captionBanks,
		replies: context.replies,
		allAccountIds: context.allAccountIds,
		usernames: context.usernames,
		ownerFollowerIds: context.usersById.get(String(state.userId))?.followers || [],
		random,
	});

	await DemoScheduledEventModel.insertMany(toScheduledEvents(engagement, post._id));

	if (previousIndex !== -1) {
		state.previousCaptions.splice(previousIndex, 1);
	}

	state.posted.push({ postId: post._id, source, caption, permanent: false });
	await state.save();

	return true;
};

const createStory = async (context, state, at, random) => {
	const source = pickOne(state.ownPhotos, random);
	const copy = await cloudinary.uploader.upload(context.lookupPhoto(source).imageUrl, {
		resource_type: 'image',
		folder: config.STORY_COPY_FOLDER,
	});

	await StoryModel.create({
		imageIdentifier: copy.public_id,
		imageUrl: copy.secure_url,
		imageWidth: copy.width,
		imageHeight: copy.height,
		userId: state.userId,
		createdAt: at,
	});
};

const canPost = (state) => state.queue.length > 0;

const canPostStory = (state) => state.tier !== 'lurker' || state.queue.length > 0 || state.posted.some((entry) => !entry.permanent);

const pickByTier = (states, tierWeights, random) => {
	const tiers = [...new Set(states.map((state) => state.tier))];

	if (!tiers.length) {
		return null;
	}

	const tier =
		tiers[
			pickWeighted(
				tiers,
				tiers.map((candidate) => tierWeights[candidate]),
				random,
			)
		];

	return pickOne(
		states.filter((state) => state.tier === tier),
		random,
	);
};

const pickStoryAccount = (states, random) => pickByTier(states.filter(canPostStory), config.STORY_TIER_WEIGHTS, random);

const runPosts = async (context, hourStart, random) => {
	let created = 0;

	for (const state of shuffle(context.states.filter(canPost), random)) {
		if (
			random() < config.TIERS[state.tier].postsPerWeek / (7 * POSTING_HOURS_PER_DAY) &&
			(await createPost(context, state, randomTimeInHour(hourStart, random), random))
		) {
			created += 1;
		}
	}

	return created;
};

const runStories = async (context, hourStart, count, random) => {
	for (let index = 0; index < count; index += 1) {
		const state = pickStoryAccount(context.states, random);

		if (state) {
			await createStory(context, state, randomTimeInHour(hourStart, random), random);
		}
	}
};

const createFollow = async (context, random) => {
	const follower = pickOne(context.states, random);
	const followerUser = context.usersById.get(String(follower.userId));
	const alreadyFollowing = new Set((followerUser.following || []).map(String));
	const candidates = context.states.filter(
		(state) => String(state.userId) !== String(follower.userId) && !alreadyFollowing.has(String(state.userId)),
	);
	const followed = pickByTier(candidates, config.FOLLOW_TIER_WEIGHTS, random);

	if (!followed) {
		return false;
	}

	await UserModel.updateOne({ _id: follower.userId }, { $addToSet: { following: followed.userId } });
	await UserModel.updateOne({ _id: followed.userId }, { $addToSet: { followers: follower.userId } });
	followerUser.following = [...(followerUser.following || []), followed.userId];

	return true;
};

const recordFollows = (run, hourStart, count) => {
	const day = startOfUtcDay(hourStart);

	if (!run.followDay || run.followDay.getTime() !== day.getTime()) {
		run.followDay = day;
		run.followCount = 0;
	}

	run.followCount += count;
};

const runFollows = async (context, run, hourStart, random) => {
	const demoIds = new Set(context.allAccountIds.map(String));
	const followCount = countFromExpected(config.FOLLOWS_PER_DAY / 24, random);
	const unfollowCount = countFromExpected(config.UNFOLLOWS_PER_DAY / 24, random);
	let created = 0;

	for (let index = 0; index < followCount; index += 1) {
		if (await createFollow(context, random)) {
			created += 1;
		}
	}

	recordFollows(run, hourStart, created);

	for (let index = 0; index < unfollowCount; index += 1) {
		const follower = pickOne(context.states, random);
		const followerUser = context.usersById.get(String(follower.userId));
		const demoFollowing = (followerUser.following || []).filter((id) => demoIds.has(String(id)));

		if (!demoFollowing.length) {
			continue;
		}

		const unfollowedId = pickOne(demoFollowing, random);

		await UserModel.updateOne({ _id: follower.userId }, { $pull: { following: unfollowedId } });
		await UserModel.updateOne({ _id: unfollowedId }, { $pull: { followers: follower.userId } });
		followerUser.following = followerUser.following.filter((id) => String(id) !== String(unfollowedId));
	}
};

const runSignUpFollows = async (context, hourStart, random) => {
	const windowStart = new Date(hourStart.getTime() - config.SIGN_UP_FOLLOWS.days * config.DAY_MS);
	const windowEnd = new Date(hourStart.getTime() + config.HOUR_MS);
	const signUps = await UserModel.find({
		_id: { $gte: objectIdFromDate(windowStart), $lt: objectIdFromDate(windowEnd) },
		accountType: 'user',
	})
		.select({ followers: 1 })
		.lean();

	for (const signUp of signUps) {
		if (random() >= config.SIGN_UP_FOLLOWS.perDay / HOURS_PER_DAY) {
			continue;
		}

		const followerIds = new Set((signUp.followers || []).map(String));
		const persona = pickByTier(
			context.states.filter((state) => !followerIds.has(String(state.userId))),
			config.FOLLOW_TIER_WEIGHTS,
			random,
		);

		if (persona) {
			await UserModel.updateOne({ _id: signUp._id }, { $addToSet: { followers: persona.userId } });
			await UserModel.updateOne({ _id: persona.userId }, { $addToSet: { following: signUp._id } });
			await notificationService.notifyFollow({ actorId: persona.userId, recipientId: signUp._id });
		}
	}
};

const countCreatedToday = async (Model, context, hourStart) =>
	Model.countDocuments({
		userId: { $in: context.allAccountIds },
		createdAt: { $gte: startOfUtcDay(hourStart), $lt: new Date(hourStart.getTime() + config.HOUR_MS) },
	});

const topUpDailyMinimums = async (context, run, hourStart, storiesAllowed, random) => {
	const missingPosts = config.MIN_POSTS_PER_DAY - (await countCreatedToday(UserPostModel, context, hourStart));

	for (let index = 0; index < missingPosts; index += 1) {
		const candidates = context.states.filter(canPost);

		if (!candidates.length) {
			break;
		}

		await createPost(context, pickOne(candidates, random), randomTimeInHour(hourStart, random), random);
	}

	const missingStories = config.MIN_STORIES_PER_DAY - (await countCreatedToday(StoryModel, context, hourStart));

	if (storiesAllowed && missingStories > 0) {
		await runStories(context, hourStart, missingStories, random);
	}

	let created = 0;

	for (let index = 0; index < config.MIN_FOLLOWS_PER_DAY - run.followCount; index += 1) {
		if (await createFollow(context, random)) {
			created += 1;
		}
	}

	recordFollows(run, hourStart, created);
};

const runHour = async (context, run, hourStart, now, random) => {
	const storiesAllowed = hourStart.getTime() >= now.getTime() - constants.STORY_LIFETIME_MS;

	if (isPostingHour(hourStart)) {
		await runPosts(context, hourStart, random);

		if (storiesAllowed) {
			await runStories(context, hourStart, countFromExpected(AVERAGE_STORIES_PER_DAY / POSTING_HOURS_PER_DAY, random), random);
		}
	}

	await runFollows(context, run, hourStart, random);
	await runSignUpFollows(context, hourStart, random);

	if (isLastPostingHour(hourStart)) {
		await topUpDailyMinimums(context, run, hourStart, storiesAllowed, random);
	}
};

const removePost = async (userPostId) => {
	const topLevelIds = (await CommentModel.find({ userPostId }).select({ _id: 1 }).lean()).map((comment) => comment._id);

	await CommentModel.deleteMany({ $or: [{ userPostId }, { parentCommentId: { $in: topLevelIds } }] });
	await DemoScheduledEventModel.deleteMany({ userPostId });
	await UserPostModel.deleteOne({ _id: userPostId });
	await notificationService.removeNotificationsForPosts({ userPostIds: [userPostId] });
};

const applyRollingWindow = async (context, now) => {
	const cutoff = new Date(now.getTime() - config.WINDOW_DAYS * config.DAY_MS);
	const createdAtById = new Map(
		(
			await UserPostModel.find({ userId: { $in: context.allAccountIds } })
				.select({ _id: 1, createdAt: 1 })
				.lean()
		).map((post) => [String(post._id), post.createdAt]),
	);

	for (const state of context.states) {
		const keptCount = config.TIERS[state.tier].posts?.[0] || 0;
		const expired = state.posted
			.filter((entry) => !entry.permanent && createdAtById.has(String(entry.postId)))
			.sort((a, b) => createdAtById.get(String(b.postId)) - createdAtById.get(String(a.postId)))
			.slice(keptCount)
			.filter((entry) => createdAtById.get(String(entry.postId)) < cutoff);

		if (!expired.length) {
			continue;
		}

		for (const entry of expired) {
			await removePost(entry.postId);
			await UserModel.updateOne({ _id: state.userId }, { $pull: { posts: entry.postId } });
			state.queue.push(entry.source);
			state.previousCaptions.push({ source: entry.source, caption: entry.caption });
		}

		state.posted = state.posted.filter((entry) => !expired.includes(entry));
		await state.save();
	}
};

const runDemoActivity = async ({ now = new Date(), random = Math.random } = {}) => {
	await removeExpiredVisitors(now);

	const run = await DemoActivityRunModel.findOne();

	if (!run) {
		return { hoursRun: 0 };
	}

	const lastCompleteHour = new Date(floorToHour(now).getTime() - config.HOUR_MS);
	const earliestHour = new Date(lastCompleteHour.getTime() - (config.MAX_CATCH_UP_HOURS - 1) * config.HOUR_MS);
	let hourStart = new Date(Math.max(run.lastCompletedHour.getTime() + config.HOUR_MS, earliestHour.getTime()));
	let hoursRun = 0;

	if (hourStart > lastCompleteHour) {
		await applyDueEvents(now);

		return { hoursRun };
	}

	const context = await loadContext(random);

	while (hourStart <= lastCompleteHour) {
		await runHour(context, run, hourStart, now, random);
		run.lastCompletedHour = hourStart;
		await run.save();
		hoursRun += 1;
		hourStart = new Date(hourStart.getTime() + config.HOUR_MS);
	}

	await applyDueEvents(now);
	await applyRollingWindow(context, now);

	return { hoursRun };
};

module.exports = {
	floorToHour,
	runDemoActivity,
};
