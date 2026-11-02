const mongoose = require('mongoose');

const config = require('../demo/demoConfig');
const { createRandom, shuffle, randomInt, pickOne } = require('../demo/random');
const { createPhotoLookup, pickWeighted, createCaptionPicker, planPostEngagement } = require('../demo/contentPlanning');

const RANDOM_SEED = 17;
const STARTER_STORIES_PER_TIER = { creator: 18, casualPoster: 9, lurker: 3 };
const STORY_WINDOW_HOURS = 24;
const LURKER_CREATOR_PREFERENCE = 6;

const buildAccounts = (users, assignments, random) => {
	const assignmentsByUsername = new Map(
		[...assignments.creators, ...assignments.casualPosters, ...assignments.lurkers].map((assignment) => [assignment.username, assignment]),
	);

	const toAccount = (tier, user) => {
		const assignment = assignmentsByUsername.get(user.username);

		if (!assignment) {
			throw new Error(`${user.username} has no photo assignment; run the assign script first`);
		}

		const ownPhotos = tier === 'lurker' ? assignment.backlog : assignment.photos;
		const photosToPost = tier === 'lurker' ? assignment.backlog : assignment.photos.slice(0, randomInt(random, ...config.TIERS[tier].posts));
		const laterPhotos = tier === 'lurker' ? assignment.laterPhotos || [] : assignment.photos.slice(photosToPost.length);

		return {
			id: new mongoose.Types.ObjectId(),
			tier,
			username: user.username,
			bio: user.bio,
			folder: user.folder,
			avatar: assignment.avatar,
			ownPhotos,
			photosToPost,
			laterPhotos,
			stillPosts: tier !== 'lurker' || laterPhotos.length > 0,
		};
	};

	return [
		...users.creators.map((user) => toAccount('creator', user)),
		...users.casualPosters.map((user) => toAccount('casualPoster', user)),
		...users.lurkers.map((user) => toAccount('lurker', user)),
	];
};

const buildFollowGraph = (accounts, random) => {
	const targetFollowers = new Map(accounts.map((account) => [account.id, randomInt(random, ...config.TIERS[account.tier].followers)]));
	const followers = new Map(accounts.map((account) => [account.id, []]));
	const following = new Map(accounts.map((account) => [account.id, []]));

	for (const account of shuffle(accounts, random)) {
		const candidates = accounts.filter((candidate) => candidate !== account);
		const count = randomInt(random, ...config.TIERS[account.tier].following);

		for (let index = 0; index < count && candidates.length; index += 1) {
			const weights = candidates.map((candidate) => {
				const remaining = Math.max(targetFollowers.get(candidate.id) - followers.get(candidate.id).length, 0);
				const preference = account.tier === 'lurker' && candidate.tier === 'creator' ? LURKER_CREATOR_PREFERENCE : 1;

				return remaining * preference;
			});
			const usableWeights = weights.some((weight) => weight > 0) ? weights : candidates.map(() => 1);
			const [followed] = candidates.splice(pickWeighted(candidates, usableWeights, random), 1);

			following.get(account.id).push(followed.id);
			followers.get(followed.id).push(account.id);
		}
	}

	return { followers, following };
};

const randomPostingTime = (now, days, random) => {
	const time = new Date(now.getTime() - randomInt(random, 0, days - 2) * config.DAY_MS);
	time.setHours(randomInt(random, config.FIRST_POSTING_HOUR, config.LAST_POSTING_HOUR), randomInt(random, 0, 59), randomInt(random, 0, 59), 0);

	return time > now ? new Date(time.getTime() - config.DAY_MS) : time;
};

const capToNow = (time, earliest, now, random) =>
	time > now ? new Date(earliest.getTime() + random() * (now.getTime() - earliest.getTime())) : time;

const toSeededComments = (plannedComments, postTime, now, random) => {
	const createdAtById = new Map();

	return plannedComments.map((comment) => {
		const earliest = comment.parentCommentId ? createdAtById.get(String(comment.parentCommentId)) : postTime;
		const createdAt = capToNow(comment.at < earliest ? earliest : comment.at, earliest, now, random);

		createdAtById.set(String(comment._id), createdAt);

		return {
			_id: comment._id,
			userPostId: comment.userPostId,
			userId: comment.userId,
			text: comment.text,
			likes: comment.likes.map((like) => like.userId),
			parentCommentId: comment.parentCommentId,
			mentionedUserId: comment.mentionedUserId,
			createdAt,
		};
	});
};

const buildStoryPlans = (accounts, now, random) =>
	Object.entries(STARTER_STORIES_PER_TIER)
		.flatMap(([tier, count]) =>
			shuffle(
				accounts.filter((account) => account.tier === tier && account.stillPosts),
				random,
			).slice(0, count),
		)
		.map((account) => ({
			userId: account.id,
			source: pickOne(account.ownPhotos, random),
			createdAt: new Date(now.getTime() - random() * STORY_WINDOW_HOURS * config.HOUR_MS),
		}));

const buildDemoData = ({ users, assignments, photosManifest, captionBanks, replies, now }) => {
	const random = createRandom(RANDOM_SEED);
	const lookupPhoto = createPhotoLookup(photosManifest);
	const accounts = buildAccounts(users, assignments, random);
	const allAccountIds = accounts.map((account) => account.id);
	const usernames = new Map(accounts.map((account) => [String(account.id), account.username]));
	const { followers, following } = buildFollowGraph(accounts, random);
	const pickCaption = createCaptionPicker(captionBanks, random);
	const posts = [];
	const comments = [];
	const postedByAccount = new Map(accounts.map((account) => [account.id, []]));

	for (const account of accounts) {
		const days = account.tier === 'lurker' ? config.BACKLOG_DAYS : config.WINDOW_DAYS;

		for (const source of account.photosToPost) {
			const photo = lookupPhoto(source);
			const createdAt = randomPostingTime(now, days, random);
			const postId = new mongoose.Types.ObjectId();
			const caption = pickCaption(account, source);
			const engagement = planPostEngagement({
				postId,
				postTime: createdAt,
				owner: account,
				source,
				captionBanks,
				replies,
				allAccountIds,
				usernames,
				ownerFollowerIds: followers.get(account.id),
				random,
			});
			const postComments = toSeededComments(engagement.comments, createdAt, now, random);

			posts.push({
				_id: postId,
				imageIdentifier: photo.imageIdentifier,
				imageUrl: photo.imageUrl,
				imageWidth: photo.imageWidth,
				imageHeight: photo.imageHeight,
				caption,
				userId: account.id,
				likes: engagement.likes.map((like) => like.userId),
				commentsCount: postComments.length,
				createdAt,
				updatedAt: createdAt,
			});
			comments.push(...postComments);
			postedByAccount.get(account.id).push({ postId, source, caption, createdAt, permanent: account.tier === 'lurker' });
		}
	}

	const userDocuments = accounts.map((account) => {
		const avatar = account.avatar ? lookupPhoto(account.avatar) : null;

		return {
			_id: account.id,
			email: `${account.username}@${config.DEMO_EMAIL_DOMAIN}`,
			username: account.username,
			bio: account.bio,
			profilePicture: avatar ? { imageUrl: avatar.imageUrl, imageIdentifier: avatar.imageIdentifier } : undefined,
			posts: [...postedByAccount.get(account.id)].sort((a, b) => a.createdAt - b.createdAt).map((entry) => entry.postId),
			followers: followers.get(account.id),
			following: following.get(account.id),
		};
	});

	const accountStates = accounts.map((account) => ({
		userId: account.id,
		username: account.username,
		tier: account.tier,
		folder: account.folder,
		ownPhotos: account.ownPhotos,
		queue: account.laterPhotos,
		posted: postedByAccount.get(account.id).map(({ postId, source, caption, permanent }) => ({ postId, source, caption, permanent })),
	}));

	const storyPlans = buildStoryPlans(accounts, now, random).map((plan) => ({ ...plan, photo: lookupPhoto(plan.source) }));

	return { users: userDocuments, posts, comments, storyPlans, accountStates };
};

module.exports = {
	DEMO_EMAIL_DOMAIN: config.DEMO_EMAIL_DOMAIN,
	buildDemoData,
};
