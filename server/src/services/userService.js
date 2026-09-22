const JWT = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const constants = require('../config/constants');
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

		Object.keys(error.errors).forEach((path) => {
			fields[path] = error.errors[path].message;
		});

		return new AppError(Object.values(fields).join(', '), 400, { cause: error, fields });
	}

	if (error.code === 11000) {
		const duplicatedField = Object.keys(error.keyPattern || {})[0];

		const duplicateMessages = {
			email: 'This email is already registered',
			username: 'This username is taken',
		};

		const message = duplicateMessages[duplicatedField] || 'Email or username already in use';

		return new AppError(message, 409, {
			cause: error,
			fields: duplicatedField ? { [duplicatedField]: message } : undefined,
		});
	}

	return null;
};

const signUp = async ({ email, username, password }) => {
	try {
		if (typeof password !== 'string' || password.length < constants.MIN_PASSWORD_LENGTH) {
			const message = `Password must be at least ${constants.MIN_PASSWORD_LENGTH} characters`;

			throw new AppError(message, 400, { fields: { password: message } });
		}

		if (Buffer.byteLength(password, 'utf8') > constants.MAX_PASSWORD_BYTES) {
			const message = `Password must be at most ${constants.MAX_PASSWORD_BYTES} bytes`;

			throw new AppError(message, 400, { fields: { password: message } });
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
		const dbUser = await UserModel.findOne({ email });

		if (!dbUser) {
			throw new AppError('Wrong email or password', 401);
		}

		const passwordIsCorrect = await bcrypt.compare(password, dbUser.password);

		if (!passwordIsCorrect) {
			throw new AppError('Wrong email or password', 401);
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

const getUsersProfileDataByUserIds = async ({ userIds }) => {
	try {
		const usersResult = await UserModel.find({ _id: { $in: userIds } })
			.select({ _id: 1, username: 1, email: 1, posts: 1, bio: 1, theme: 1, profilePicture: 1, following: 1, followers: 1 })
			.populate({ path: 'posts' })
			.populate({ path: 'profilePicture' });

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

const updateUserProfileData = async (userId, updatedProfileData) => {
	try {
		if (Object.prototype.hasOwnProperty.call(updatedProfileData, 'password')) {
			throw new AppError('Password cannot be changed here', 400, {
				fields: { password: 'Password cannot be changed from the profile form' },
			});
		}

		let profilePicture = null;

		if (updatedProfileData.profilePicture) {
			const updatedProfilePicture = updatedProfileData.profilePicture;

			const userWithProfilePicture = await UserModel.findOne({ _id: userId }).populate({ path: 'profilePicture' });

			if (userWithProfilePicture.profilePicture) {
				const replacedPicture = userWithProfilePicture.profilePicture;

				await imageStorageService.deleteImage(replacedPicture.imageIdentifier);

				await UserPostModel.deleteOne({ _id: replacedPicture._id });
			}

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

		const user = await UserModel.findOneAndUpdate({ _id: userId }, updatedProfileData, {
			new: true,
			runValidators: true,
			context: 'query',
		}).populate('profilePicture');

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
