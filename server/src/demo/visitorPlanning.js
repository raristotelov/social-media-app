const mongoose = require('mongoose');

const config = require('./demoConfig');
const { pickEngagers } = require('./contentPlanning');
const { shuffle, randomInt, pickOne } = require('./random');

const createUsernameCandidate = (random) =>
	`${pickOne(config.VISITOR_FIRST_NAMES, random)}${config.VISITOR_USERNAME_INFIX}${randomInt(random, ...config.VISITOR_USERNAME_NUMBER)}`;

const pickPersonasToFollow = (personas, random) => {
	const countsByTier = Object.entries(config.VISITOR_FOLLOWED_PERSONAS_BY_TIER);
	const total = countsByTier.reduce((sum, [, count]) => sum + count, 0);
	const preferred = countsByTier.flatMap(([tier, count]) =>
		shuffle(
			personas.filter((persona) => persona.tier === tier),
			random,
		).slice(0, count),
	);
	const preferredIds = new Set(preferred.map((persona) => String(persona.userId)));
	const fillers = shuffle(
		personas.filter((persona) => !preferredIds.has(String(persona.userId))),
		random,
	).slice(0, total - preferred.length);

	return [...preferred, ...fillers].map((persona) => persona.userId);
};

const pickFollowBacks = (followedIds, random) => shuffle(followedIds, random).slice(0, randomInt(random, ...config.VISITOR_FOLLOW_BACKS));

const planStarterPosts = ({ now, random }) => {
	const [minAgeDays, maxAgeDays] = config.VISITOR_STARTER_POST_AGE_DAYS;

	return Array.from({ length: randomInt(random, ...config.VISITOR_STARTER_POSTS) }, () => ({
		createdAt: new Date(now.getTime() - (minAgeDays + random() * (maxAgeDays - minAgeDays)) * config.DAY_MS),
		likeCount: randomInt(random, ...config.VISITOR_STARTER_POST_LIKES),
		commentCount: randomInt(random, ...config.VISITOR_STARTER_POST_COMMENTS),
	})).sort((a, b) => a.createdAt - b.createdAt);
};

const planStarterEngagement = ({ postId, createdAt, likeCount, commentCount, ownerId, now, followerIds, personaIds, genericComments, random }) => {
	const likeUserIds = pickEngagers({ ownerId, count: likeCount, preferredIds: followerIds, allIds: personaIds, random });
	const commenterIds = pickEngagers({ ownerId, count: commentCount, preferredIds: likeUserIds, allIds: personaIds, random });
	const comments = shuffle(genericComments, random)
		.slice(0, commenterIds.length)
		.map((text, index) => ({
			_id: new mongoose.Types.ObjectId(),
			userPostId: postId,
			userId: commenterIds[index],
			text,
			createdAt: new Date(createdAt.getTime() + random() * (now.getTime() - createdAt.getTime())),
		}));

	return { likeUserIds, comments };
};

module.exports = {
	createUsernameCandidate,
	pickPersonasToFollow,
	pickFollowBacks,
	planStarterPosts,
	planStarterEngagement,
};
