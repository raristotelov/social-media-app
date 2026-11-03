const mongoose = require('mongoose');

const config = require('./demoConfig');
const { pickEngagers, pickWeighted } = require('./contentPlanning');
const { shuffle, randomInt, pickOne } = require('./random');

const spreadTimes = ({ count, start, end, random }) => {
	const slot = (end.getTime() - start.getTime()) / Math.max(count, 1);

	return Array.from({ length: count }, (value, index) => new Date(start.getTime() + (index + random()) * slot));
};

const randomTimeBetween = (start, end, random) => new Date(start.getTime() + random() * (end.getTime() - start.getTime()));

const immediateWindow = (now) => ({
	start: new Date(now.getTime() + config.MIN_REACTION_DELAY_MS),
	end: new Date(now.getTime() + config.IMMEDIATE_REACTION_WINDOW_MS),
});

const toLikeEvent = (userPostId, userId) => ({ type: 'postLike', userPostId, userId });

const toCommentEvent = (userPostId, userId, text) => ({
	type: 'comment',
	userPostId,
	userId,
	text,
	commentId: new mongoose.Types.ObjectId(),
});

const withTimes = (events, times) => events.map((event, index) => ({ ...event, dueAt: times[index] }));

const planUploadReactions = ({ postId, ownerId, now, followerIds, personaIds, genericComments, random }) => {
	const settings = config.UPLOAD_REACTIONS;
	const likeShare = settings.likeShare[0] + random() * (settings.likeShare[1] - settings.likeShare[0]);
	const immediateLikeCount = Math.max(settings.minLikes, Math.round(followerIds.length * likeShare));
	const immediateCommentCount = randomInt(random, ...settings.comments);
	const laterLikeCount = randomInt(random, ...settings.laterLikes);
	const laterCommentCount = randomInt(random, ...settings.laterComments);

	const likerIds = pickEngagers({
		ownerId,
		count: immediateLikeCount + laterLikeCount,
		preferredIds: followerIds,
		allIds: personaIds,
		random,
	});
	const commenterIds = pickEngagers({
		ownerId,
		count: immediateCommentCount + laterCommentCount,
		preferredIds: followerIds,
		allIds: personaIds,
		random,
	});
	const texts = shuffle(genericComments, random);
	const commentEvents = commenterIds.map((userId, index) => toCommentEvent(postId, userId, texts[index]));
	const immediateEvents = shuffle(
		[...likerIds.slice(0, immediateLikeCount).map((userId) => toLikeEvent(postId, userId)), ...commentEvents.slice(0, immediateCommentCount)],
		random,
	);
	const laterEvents = [
		...likerIds.slice(immediateLikeCount).map((userId) => toLikeEvent(postId, userId)),
		...commentEvents.slice(immediateCommentCount),
	];
	const { start, end } = immediateWindow(now);
	const laterEnd = new Date(now.getTime() + settings.laterWindowHours * config.HOUR_MS);

	return {
		immediate: withTimes(immediateEvents, spreadTimes({ count: immediateEvents.length, start, end, random })),
		later: withTimes(
			laterEvents,
			laterEvents.map(() => randomTimeBetween(end, laterEnd, random)),
		),
	};
};

const planSignUpFollows = ({ userId, now, followerIds, personas, random }) => {
	const alreadyFollowing = new Set(followerIds.map(String));
	const candidates = personas.filter((persona) => !alreadyFollowing.has(String(persona.userId)));
	const count = Math.min(randomInt(random, ...config.SIGN_UP_FOLLOWS.initial), candidates.length);
	const chosen = [];

	for (let index = 0; index < count; index += 1) {
		const pickedIndex = pickWeighted(
			candidates,
			candidates.map((persona) => config.FOLLOW_TIER_WEIGHTS[persona.tier]),
			random,
		);

		chosen.push(...candidates.splice(pickedIndex, 1));
	}

	const { start, end } = immediateWindow(now);

	return withTimes(
		chosen.map((persona) => ({ type: 'follow', userId: persona.userId, targetUserId: userId })),
		spreadTimes({ count: chosen.length, start, end, random }),
	);
};

const pickUnusedPersona = ({ preferredIds, allIds, usedIds, random }) => {
	const used = new Set(usedIds.map(String));
	const unusedPreferred = preferredIds.filter((id) => !used.has(String(id)));
	const pool = unusedPreferred.length ? unusedPreferred : allIds.filter((id) => !used.has(String(id)));

	return pool.length ? pickOne(pool, random) : null;
};

const planStarterReactions = ({ ownerId, now, posts, followerIds, personaIds, genericComments, random }) => {
	const settings = config.VISITOR_START_REACTIONS;
	const likedBy = new Map(posts.map((post) => [String(post._id), [ownerId, ...post.likes]]));
	const commentedBy = new Map(posts.map((post) => [String(post._id), [ownerId, ...post.commenterIds]]));
	const events = [];
	const likeCount = posts.length ? randomInt(random, ...settings.likes) : 0;
	const commentCount = posts.length ? randomInt(random, ...settings.comments) : 0;
	const texts = shuffle(genericComments, random);

	for (let index = 0; index < likeCount; index += 1) {
		const post = pickOne(posts, random);
		const userId = pickUnusedPersona({ preferredIds: followerIds, allIds: personaIds, usedIds: likedBy.get(String(post._id)), random });

		if (userId) {
			likedBy.get(String(post._id)).push(userId);
			events.push(toLikeEvent(post._id, userId));
		}
	}

	for (let index = 0; index < commentCount; index += 1) {
		const post = pickOne(posts, random);
		const userId = pickUnusedPersona({ preferredIds: followerIds, allIds: personaIds, usedIds: commentedBy.get(String(post._id)), random });

		if (userId) {
			commentedBy.get(String(post._id)).push(userId);
			events.push(toCommentEvent(post._id, userId, texts[index]));
		}
	}

	const followerCount = randomInt(random, ...settings.followers);
	const followerCandidates = shuffle(
		personaIds.filter((id) => !followerIds.some((followerId) => String(followerId) === String(id))),
		random,
	);

	followerCandidates.slice(0, followerCount).forEach((userId) => {
		events.push({ type: 'follow', userId, targetUserId: ownerId });
	});

	const shuffledEvents = shuffle(events, random);
	const { start, end } = immediateWindow(now);

	return withTimes(shuffledEvents, spreadTimes({ count: shuffledEvents.length, start, end, random }));
};

module.exports = {
	planUploadReactions,
	planSignUpFollows,
	planStarterReactions,
};
