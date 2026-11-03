const crypto = require('node:crypto');

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const CommentModel = require('../models/commentModel');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { cloudinary } = require('../config/cloudinary');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const { discardUploadedImage } = require('../services/imageStorageService');
const AppError = require('../utils/AppError');
const config = require('./demoConfig');
const { loadVisitorData } = require('./loadDemoData');
const { pickOne, shuffle } = require('./random');
const { scheduleReactions } = require('./reactionDelivery');
const { planStarterReactions } = require('./reactionPlanning');
const { removeUsersWithContent } = require('./removeUsersWithContent');
const { createUsernameCandidate, pickPersonasToFollow, pickFollowBacks, planStarterPosts, planStarterEngagement } = require('./visitorPlanning');

const PASSWORD_BYTES = 32;

const isDuplicateKeyError = (error) => error?.code === constants.DUPLICATE_KEY_ERROR_CODE;

const assertDemoHasRoom = async () => {
	if ((await UserModel.countDocuments({ accountType: 'demo' })) >= config.VISITOR_MAX_ACCOUNTS) {
		throw new AppError('The demo is at capacity', 429, { code: ERROR_CODES.DEMO_UNAVAILABLE });
	}
};

const toProfilePicture = (avatar) => (avatar ? { imageUrl: avatar.imageUrl, imageIdentifier: avatar.imageIdentifier } : undefined);

const createVisitorUser = async ({ avatar, followedIds, followBackIds, random }) => {
	const password = await bcrypt.hash(crypto.randomBytes(PASSWORD_BYTES).toString('hex'), constants.SALT_ROUNDS);

	for (let attempt = 0; attempt < config.VISITOR_USERNAME_ATTEMPTS; attempt += 1) {
		const username = createUsernameCandidate(random);

		try {
			return await UserModel.create({
				email: `${username}@${config.VISITOR_EMAIL_DOMAIN}`,
				accountType: 'demo',
				username,
				password,
				profilePicture: toProfilePicture(avatar),
				following: followedIds,
				followers: followBackIds,
			});
		} catch (error) {
			if (!isDuplicateKeyError(error)) {
				throw error;
			}
		}
	}

	throw new AppError('Could not find a free demo username', 503);
};

const copyPhoto = (photo) =>
	cloudinary.uploader.upload(photo.imageUrl, {
		resource_type: 'image',
		asset_folder: config.VISITOR_POST_COPY_FOLDER,
	});

const copyPhotos = async (photos) => {
	const results = await Promise.allSettled(photos.map(copyPhoto));
	const failure = results.find((result) => result.status === 'rejected');

	if (failure) {
		await Promise.all(results.filter((result) => result.status === 'fulfilled').map((result) => discardUploadedImage(result.value.public_id)));

		throw failure.reason;
	}

	return results.map((result) => result.value);
};

const createStarterPosts = async ({ user, postPhotos, followBackIds, personaIds, genericComments, now, random }) => {
	const createdPosts = [];
	const plans = planStarterPosts({ now, random });
	const copies = await copyPhotos(shuffle(postPhotos, random).slice(0, plans.length));

	for (const [index, plan] of plans.entries()) {
		if (!copies[index]) {
			break;
		}

		const copy = copies[index];
		const postId = new mongoose.Types.ObjectId();
		const engagement = planStarterEngagement({
			postId,
			...plan,
			ownerId: user._id,
			now,
			followerIds: followBackIds,
			personaIds,
			genericComments,
			random,
		});
		let post;

		try {
			post = await UserPostModel.create({
				_id: postId,
				imageIdentifier: copy.public_id,
				imageUrl: copy.secure_url,
				imageWidth: copy.width,
				imageHeight: copy.height,
				userId: user._id,
				likes: engagement.likeUserIds,
				commentsCount: engagement.comments.length,
				createdAt: plan.createdAt,
				updatedAt: plan.createdAt,
			});
		} catch (error) {
			await Promise.all(copies.slice(index).map((unusedCopy) => discardUploadedImage(unusedCopy.public_id)));

			throw error;
		}

		if (engagement.comments.length) {
			await CommentModel.insertMany(engagement.comments);
		}

		createdPosts.push({ _id: post._id, likes: engagement.likeUserIds, commenterIds: engagement.comments.map((comment) => comment.userId) });
	}

	return createdPosts;
};

const fillVisitorContent = async ({ user, followedIds, followBackIds, personaIds, data, now, random }) => {
	await UserModel.updateMany({ _id: { $in: followedIds } }, { $addToSet: { followers: user._id } });
	await UserModel.updateMany({ _id: { $in: followBackIds } }, { $addToSet: { following: user._id } });

	const posts = await createStarterPosts({
		user,
		postPhotos: data.postPhotos,
		followBackIds,
		personaIds,
		genericComments: data.genericComments,
		now,
		random,
	});

	await UserModel.updateOne({ _id: user._id }, { $set: { posts: posts.map((post) => post._id) } });

	scheduleReactions(
		planStarterReactions({
			ownerId: user._id,
			now,
			posts,
			followerIds: followBackIds,
			personaIds,
			genericComments: data.genericComments,
			random,
		}),
	);
};

const createDemoVisitor = async ({ now = new Date(), random = Math.random } = {}) => {
	await assertDemoHasRoom();

	const data = await loadVisitorData();
	const personas = await DemoAccountStateModel.find().select({ userId: 1, tier: 1 }).lean();
	const personaIds = personas.map((persona) => persona.userId);
	const followedIds = pickPersonasToFollow(personas, random);
	const followBackIds = pickFollowBacks(followedIds, random);
	const avatar = data.avatarPhotos.length ? pickOne(data.avatarPhotos, random) : null;
	const user = await createVisitorUser({ avatar, followedIds, followBackIds, random });

	try {
		await fillVisitorContent({ user, followedIds, followBackIds, personaIds, data, now, random });
	} catch (error) {
		await removeUsersWithContent([user._id], { deleteUploadedImages: true }).catch((cleanupError) =>
			console.error(`Could not remove the half-created demo visitor ${user._id}`, cleanupError),
		);

		throw error;
	}

	return user;
};

module.exports = {
	createDemoVisitor,
};
