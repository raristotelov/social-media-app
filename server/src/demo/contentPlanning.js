const mongoose = require('mongoose');

const config = require('./demoConfig');
const { shuffle, randomInt, pickOne } = require('./random');

const sourceFolder = (source) => source.split('/')[1];

const createPhotoLookup = (photosManifest) => {
	const lookup = new Map();

	for (const groups of Object.values(photosManifest)) {
		for (const photos of Object.values(groups)) {
			for (const photo of photos) {
				lookup.set(photo.source, photo);
			}
		}
	}

	return (source) => {
		const photo = lookup.get(source);

		if (!photo) {
			throw new Error(`${source} is not in photos.json; run the upload script first`);
		}

		return photo;
	};
};

const pickWeighted = (candidates, weights, random) => {
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	let target = random() * total;

	for (let index = 0; index < candidates.length; index += 1) {
		target -= weights[index];

		if (target < 0) {
			return index;
		}
	}

	return candidates.length - 1;
};

const createCaptionPicker = (captionBanks, random) => {
	const queues = new Map();

	return ({ username, folder: ownFolder }, source, previousCaption) => {
		const folder = sourceFolder(source);
		const bank = captionBanks.get(folder);

		if (!bank) {
			throw new Error(`No caption bank for ${folder}`);
		}

		if (random() < config.NO_CAPTION_SHARE) {
			return undefined;
		}

		const isOwnFolder = ownFolder === folder;
		const captions = isOwnFolder ? bank.owner : bank.guest;
		const key = `${username}|${folder}|${isOwnFolder ? 'owner' : 'guest'}`;

		if (!queues.get(key)?.length) {
			queues.set(key, shuffle(captions, random));
		}

		const caption = queues.get(key).pop();

		if (caption === previousCaption && captions.length > 1) {
			if (!queues.get(key).length) {
				queues.set(
					key,
					shuffle(
						captions.filter((candidate) => candidate !== previousCaption),
						random,
					),
				);
			}

			return queues.get(key).pop();
		}

		return caption;
	};
};

const pickEngagers = ({ ownerId, count, preferredIds, allIds, random }) => {
	const preferred = new Set(preferredIds.map(String));
	const others = allIds.filter((id) => String(id) !== String(ownerId) && !preferred.has(String(id)));

	return [...shuffle(preferredIds, random), ...shuffle(others, random)].slice(0, count);
};

const engagementDelay = (random) =>
	(random() < config.EARLY_ENGAGEMENT_SHARE
		? random() * config.EARLY_ENGAGEMENT_HOURS
		: config.EARLY_ENGAGEMENT_HOURS + random() * (config.LATE_ENGAGEMENT_HOURS - config.EARLY_ENGAGEMENT_HOURS)) * config.HOUR_MS;

const likeTimes = (postTime, count, random) => {
	const lateCount = count ? Math.min(randomInt(random, ...config.LATE_LIKES), count) : 0;
	const earlyWindow = config.EARLY_ENGAGEMENT_HOURS * config.HOUR_MS;
	const lateWindow = (config.LATE_ENGAGEMENT_HOURS - config.EARLY_ENGAGEMENT_HOURS) * config.HOUR_MS;

	return shuffle(
		Array.from({ length: count }, (value, index) =>
			index < lateCount
				? new Date(postTime.getTime() + earlyWindow + random() * lateWindow)
				: new Date(postTime.getTime() + random() ** 2 * earlyWindow),
		),
		random,
	);
};

const planPostEngagement = ({ postId, postTime, owner, source, captionBanks, replies, allAccountIds, usernames, ownerFollowerIds, random }) => {
	const tier = config.TIERS[owner.tier];
	const likerIds = pickEngagers({
		ownerId: owner.id,
		count: randomInt(random, ...tier.likes),
		preferredIds: ownerFollowerIds,
		allIds: allAccountIds,
		random,
	});
	const times = likeTimes(postTime, likerIds.length, random);
	const likes = likerIds.map((userId, index) => ({ userId, at: times[index] }));
	const bank = captionBanks.get(sourceFolder(source));
	const commentCount = Math.min(randomInt(random, ...tier.comments), bank.comments.length);
	const commenterIds = pickEngagers({
		ownerId: owner.id,
		count: commentCount,
		preferredIds: likerIds.length >= commentCount ? likerIds : ownerFollowerIds,
		allIds: allAccountIds,
		random,
	});
	const comments = [];

	shuffle(bank.comments, random)
		.slice(0, commentCount)
		.forEach((text, index) => {
			const userId = commenterIds[index];
			const at = new Date(postTime.getTime() + engagementDelay(random));
			const likeCandidates = shuffle(
				[owner.id, ...likerIds].filter((id) => String(id) !== String(userId)),
				random,
			);
			const comment = {
				_id: new mongoose.Types.ObjectId(),
				userPostId: postId,
				userId,
				text,
				parentCommentId: null,
				mentionedUserId: null,
				at,
				likes:
					random() < config.COMMENT_LIKE_CHANCE
						? likeCandidates.slice(0, randomInt(random, 1, config.MAX_COMMENT_LIKES)).map((likerId) => ({
								userId: likerId,
								at: new Date(at.getTime() + random() * config.MAX_COMMENT_LIKE_DELAY_HOURS * config.HOUR_MS),
							}))
						: [],
			};

			comments.push(comment);

			if (random() < tier.replyChance) {
				const replyAt = new Date(at.getTime() + random() * config.MAX_REPLY_DELAY_HOURS * config.HOUR_MS);

				comments.push({
					_id: new mongoose.Types.ObjectId(),
					userPostId: postId,
					userId: owner.id,
					text: `@${usernames.get(String(userId))} ${pickOne(replies, random)}`,
					parentCommentId: comment._id,
					mentionedUserId: userId,
					at: replyAt,
					likes: [],
				});
			}
		});

	return { likes, comments };
};

module.exports = {
	sourceFolder,
	createPhotoLookup,
	pickWeighted,
	createCaptionPicker,
	planPostEngagement,
};
