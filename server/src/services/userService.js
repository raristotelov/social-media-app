const JWT = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const constants = require('../config/constants');
const { ERROR_CODES, VALIDATION_ERROR_CODES, DUPLICATE_KEY_ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const commentService = require('./commentService');
const imageStorageService = require('./imageStorageService');

const necessaryUserFields = ['_id', 'email', 'username', 'bio', 'theme', 'profilePicture', 'posts', 'followers', 'following', 'followedUsersPosts'];

const signAuthToken = ({ _id, username }) =>
	JWT.sign({ userId: _id, username }, process.env.JWT_SECRET, {
		expiresIn: constants.JWT_EXPIRY,
	});

const getNeccessaryUserData = (user) => {
	const userObject = {};

	for (let i = 0; i < necessaryUserFields.length; i += 1) {
		if (user[necessaryUserFields[i]]) {
			userObject[necessaryUserFields[i]] = user[necessaryUserFields[i]];
		}
	}

	return {
		user: userObject,
		jwt: signAuthToken(user),
	};
};

const asFieldError = (error) => {
	if (error.name === 'ValidationError') {
		const fields = {};

		for (const [path, pathError] of Object.entries(error.errors)) {
			const code = VALIDATION_ERROR_CODES[path]?.[pathError.kind];

			if (!code) {
				return null;
			}

			fields[path] = code;
		}

		return AppError.fromFields(fields, 400, { cause: error });
	}

	if (error.code === 11000) {
		const duplicatedField = Object.keys(error.keyPattern || {})[0];
		const code = DUPLICATE_KEY_ERROR_CODES[duplicatedField];

		if (!code) {
			return null;
		}

		return AppError.fromFields({ [duplicatedField]: code }, 409, { cause: error });
	}

	return null;
};

const signUp = async ({ email, username, password }) => {
	try {
		if (typeof password !== 'string' || !password) {
			throw AppError.fromFields({ password: ERROR_CODES.PASSWORD_REQUIRED }, 400);
		}

		if (password.length < constants.MIN_PASSWORD_LENGTH) {
			throw AppError.fromFields({ password: ERROR_CODES.PASSWORD_TOO_SHORT }, 400);
		}

		if (Buffer.byteLength(password, 'utf8') > constants.MAX_PASSWORD_BYTES) {
			throw AppError.fromFields({ password: ERROR_CODES.PASSWORD_TOO_LONG }, 400);
		}

		const hashedPassword = await bcrypt.hash(password, constants.SALT_ROUNDS);

		const user = new UserModel({ email, username, password: hashedPassword });

		await user.save();

		return signAuthToken(user);
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		const fieldError = asFieldError(error);

		if (fieldError) {
			throw fieldError;
		}

		throw new AppError('Could not sign up', 500, { cause: error });
	}
};

const login = async ({ email, password }) => {
	try {
		if (typeof email !== 'string' || typeof password !== 'string') {
			throw new AppError('Wrong email or password', 401, { code: ERROR_CODES.WRONG_CREDENTIALS });
		}

		const dbUser = await UserModel.findOne({ email });

		if (!dbUser) {
			throw new AppError('Wrong email or password', 401, { code: ERROR_CODES.WRONG_CREDENTIALS });
		}

		const passwordIsCorrect = await bcrypt.compare(password, dbUser.password);

		if (!passwordIsCorrect) {
			throw new AppError('Wrong email or password', 401, { code: ERROR_CODES.WRONG_CREDENTIALS });
		}

		return signAuthToken(dbUser);
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not log in', 500, { cause: error });
	}
};

const getFollowedUsersPostsByUserIds = async ({ userIds }) => {
	try {
		// Fetch all user with the users they follow
		const users = await UserModel.find({ _id: { $in: userIds } }).select({ _id: 1, following: 1 });

		const usersToFollowedUsersMap = {};

		// Create a mapping of user ids to their followed users
		for (let i = 0; i < userIds.length; i += 1) {
			usersToFollowedUsersMap[userIds[i]] = users[i].following;
		}

		// Get all followed users
		const allFollowedUsers = users.map((user) => user.following).flat();

		// Get all user posts of the followed users
		const followedUsersPostDocs = await UserPostModel.find({ userId: { $in: allFollowedUsers } }).populate({ path: 'userId' });

		// Attach a comment count to each post for the feed cards
		const postIds = followedUsersPostDocs.map((post) => post._id);
		const commentCounts = await commentService.getCommentCountsForPosts(postIds);
		const followedUsersPosts = followedUsersPostDocs.map((post) => ({
			...post.toObject(),
			commentsCount: commentCounts[post._id.toString()] || 0,
		}));

		const userToUserPostsMap = {};

		// Create a mapping for user ids to their posts
		for (let i = 0; i < followedUsersPosts.length; i += 1) {
			userToUserPostsMap[followedUsersPosts[i].userId._id] = followedUsersPosts[i];
		}

		const usersWithFollowedUsersPosts = {};

		for (let i = 0; i < userIds.length; i += 1) {
			const followedUsersPosts = usersToFollowedUsersMap[userIds[i]]
				.filter((userId) => userToUserPostsMap[userId])
				.map((userId) => userToUserPostsMap[userId])
				.flat();

			usersWithFollowedUsersPosts[userIds[i]] = followedUsersPosts;
		}

		return usersWithFollowedUsersPosts;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load followed users posts', 500, { cause: error });
	}
};

const getUsersProfileDataByUserIds = async ({ userIds: requestedUserIds }) => {
	try {
		const userIds = [...new Set(requestedUserIds)];

		if (!userIds.every((userId) => mongoose.isObjectIdOrHexString(userId))) {
			throw new AppError('User not found', 404, { code: ERROR_CODES.USER_NOT_FOUND });
		}

		const usersResult = await UserModel.find({ _id: { $in: userIds } })
			.select({ _id: 1, username: 1, email: 1, posts: 1, bio: 1, theme: 1, profilePicture: 1, following: 1, followers: 1 })
			.populate({ path: 'posts' })
			.populate({ path: 'profilePicture' });

		if (usersResult.length !== userIds.length) {
			throw new AppError('User not found', 404, { code: ERROR_CODES.USER_NOT_FOUND });
		}

		const usersWithFollowedUsersPostsResult = await getFollowedUsersPostsByUserIds({ userIds });

		const mappedUsers = usersResult.map((user) => ({
			...user.toObject(),
			followedUsersPosts: usersWithFollowedUsersPostsResult[user._id],
		}));

		return mappedUsers;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load users profile data', 500, { cause: error });
	}
};

const getUsersProfileDataBySearchWord = async ({ searchWord }) => {
	try {
		const users = await UserModel.find({ username: { $regex: `^${searchWord}`, $options: 'i' } })
			.select({ _id: 1, username: 1, email: 1, posts: 1, bio: 1, profilePicture: 1 })
			.populate({ path: 'posts' })
			.populate({ path: 'profilePicture' });

		return users;
	} catch (error) {
		throw new AppError('Could not search users', 500, { cause: error });
	}
};

const destroyProfilePicture = async (profilePicture) => {
	await imageStorageService.deleteImage(profilePicture.imageIdentifier);

	await UserPostModel.deleteOne({ _id: profilePicture._id });
};

const updateUserProfileData = async (userId, updatedProfileData) => {
	try {
		if (Object.prototype.hasOwnProperty.call(updatedProfileData, 'password')) {
			throw AppError.fromFields({ password: ERROR_CODES.PASSWORD_NOT_EDITABLE }, 400);
		}

		const isRemovingProfilePicture = updatedProfileData.profilePicture === null;

		let profilePicture = null;
		let replacedProfilePicture = null;

		if (updatedProfileData.profilePicture || isRemovingProfilePicture) {
			const userWithProfilePicture = await UserModel.findOne({ _id: userId }).populate({ path: 'profilePicture' });

			replacedProfilePicture = userWithProfilePicture.profilePicture;
		}

		if (updatedProfileData.profilePicture) {
			const updatedProfilePicture = updatedProfileData.profilePicture;

			profilePicture = new UserPostModel({
				imageIdentifier: updatedProfilePicture.imageIdentifier,
				imageUrl: updatedProfilePicture.imageUrl,
				userId,
			});

			await profilePicture.save();
		}

		if (profilePicture) {
			updatedProfileData.profilePicture = profilePicture._id;
		}

		let user;

		try {
			user = await UserModel.findOneAndUpdate({ _id: userId }, updatedProfileData, {
				new: true,
				runValidators: true,
				context: 'query',
			}).populate('profilePicture');
		} catch (error) {
			if (profilePicture) {
				await UserPostModel.deleteOne({ _id: profilePicture._id });
			}

			throw error;
		}

		if (replacedProfilePicture) {
			try {
				await destroyProfilePicture(replacedProfilePicture);
			} catch (error) {
				console.error(`Could not delete replaced profile picture ${replacedProfilePicture.imageIdentifier}`, error);
			}
		}

		const updatedUserData = getNeccessaryUserData(user);

		return updatedUserData;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		const fieldError = asFieldError(error);

		if (fieldError) {
			throw fieldError;
		}

		throw new AppError('Could not update user profile', 500, { cause: error });
	}
};

const followUser = async (userId, userIdToFollow) => {
	try {
		const currentlyLoggedUser = await UserModel.findOneAndUpdate(
			{ _id: userId },
			{ $push: { following: userIdToFollow } },
			{ new: true },
		).populate('profilePicture');

		await UserModel.updateOne({ _id: userIdToFollow }, { $push: { followers: userId } }, { new: true });

		const updatedUserData = getNeccessaryUserData(currentlyLoggedUser);

		return updatedUserData;
	} catch (error) {
		throw new AppError('Could not follow user', 500, { cause: error });
	}
};

const unfollowUser = async (userId, userIdToUnfollow) => {
	try {
		const currentlyLoggedUser = await UserModel.findOneAndUpdate(
			{ _id: userId },
			{ $pull: { following: userIdToUnfollow } },
			{ new: true },
		).populate('profilePicture');

		await UserModel.updateOne({ _id: userIdToUnfollow }, { $pull: { followers: userId } }, { new: true });

		const updatedUserData = getNeccessaryUserData(currentlyLoggedUser);

		return updatedUserData;
	} catch (error) {
		throw new AppError('Could not unfollow user', 500, { cause: error });
	}
};

module.exports = {
	signUp,
	login,
	getUsersProfileDataByUserIds,
	getUsersProfileDataBySearchWord,
	updateUserProfileData,
	followUser,
	unfollowUser,
};
