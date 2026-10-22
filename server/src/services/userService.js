const JWT = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const UserModel = require('../models/userModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { asFieldError } = require('../utils/fieldErrors');
const { createUserNotFoundError } = require('../utils/notFoundErrors');
const commentService = require('./commentService');
const imageStorageService = require('./imageStorageService');

const necessaryUserFields = ['_id', 'email', 'username', 'bio', 'theme', 'profilePicture', 'posts', 'followers', 'following'];

const USER_ROW_PROJECTION = {
	_id: 1,
	username: 1,
	'profilePicture.imageUrl': 1,
	followersCount: { $size: { $ifNull: ['$followers', []] } },
};

const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const assertValidUserIds = (userIds) => {
	if (!userIds.every((userId) => mongoose.isObjectIdOrHexString(userId))) {
		throw createUserNotFoundError();
	}
};

const assertUsersExist = async (userIds) => {
	assertValidUserIds(userIds);

	const uniqueUserIds = [...new Set(userIds)];
	const existingUsersCount = await UserModel.countDocuments({ _id: { $in: uniqueUserIds } });

	if (existingUsersCount !== uniqueUserIds.length) {
		throw createUserNotFoundError();
	}
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

const compareNewestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

const toProfileData = ({ user, requesterId, commentCounts, previewComments }) => {
	const profileData = user.toObject();

	if (String(user._id) !== String(requesterId)) {
		delete profileData.email;
	}

	return {
		...profileData,
		posts: profileData.posts
			.map((post) => ({
				...post,
				commentsCount: commentCounts[post._id.toString()] || 0,
				previewComments: previewComments[post._id.toString()] || [],
			}))
			.sort(compareNewestFirst),
	};
};

const getUsersProfileDataByUserIds = async ({ userIds: requestedUserIds, requesterId }) => {
	try {
		const userIds = [...new Set(requestedUserIds)];

		if (!userIds.every((userId) => mongoose.isObjectIdOrHexString(userId))) {
			throw new AppError('User not found', 404, { code: ERROR_CODES.USER_NOT_FOUND });
		}

		const usersResult = await UserModel.find({ _id: { $in: userIds } })
			.select({ _id: 1, username: 1, email: 1, posts: 1, bio: 1, theme: 1, profilePicture: 1, following: 1, followers: 1 })
			.populate({ path: 'posts' });

		if (usersResult.length !== userIds.length) {
			throw new AppError('User not found', 404, { code: ERROR_CODES.USER_NOT_FOUND });
		}

		const profilePostIds = usersResult.flatMap((user) => user.posts.map((post) => post._id));

		const [commentCounts, previewComments] = await Promise.all([
			commentService.getCommentCountsForPosts(profilePostIds),
			commentService.getPreviewCommentsForPosts(profilePostIds),
		]);

		const mappedUsers = usersResult.map((user) => toProfileData({ user, requesterId, commentCounts, previewComments }));

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
		const users = await UserModel.aggregate([
			{ $match: { username: { $regex: `^${escapeRegExp(searchWord)}`, $options: 'i' } } },
			{ $project: USER_ROW_PROJECTION },
		]);

		return users;
	} catch (error) {
		throw new AppError('Could not search users', 500, { cause: error });
	}
};

const getFollowListByUserId = async ({ userId, listField, requesterId }) => {
	try {
		assertValidUserIds([userId]);

		const user = await UserModel.findById(userId).select({ [listField]: 1 });

		if (!user) {
			throw createUserNotFoundError();
		}

		const listedUserIds = user[listField];

		const rows = await UserModel.aggregate([{ $match: { _id: { $in: listedUserIds } } }, { $project: USER_ROW_PROJECTION }]);

		const rowsById = new Map(rows.map((row) => [String(row._id), row]));
		const orderedRows = listedUserIds.map((listedUserId) => rowsById.get(String(listedUserId))).filter(Boolean);

		return [...orderedRows].sort((a, b) => Number(String(b._id) === String(requesterId)) - Number(String(a._id) === String(requesterId)));
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load the users list', 500, { cause: error });
	}
};

const getFollowers = ({ userId, requesterId }) => getFollowListByUserId({ userId, listField: 'followers', requesterId });

const getFollowing = ({ userId, requesterId }) => getFollowListByUserId({ userId, listField: 'following', requesterId });

const updateUserProfileData = async (userId, updatedProfileData, profilePictureFile) => {
	try {
		if (Object.prototype.hasOwnProperty.call(updatedProfileData, 'password')) {
			throw AppError.fromFields({ password: ERROR_CODES.PASSWORD_NOT_EDITABLE }, 400);
		}

		const hasDisallowedField = Object.keys(updatedProfileData).some((field) => !constants.ALLOWED_PROFILE_UPDATE_FIELDS.includes(field));

		if (hasDisallowedField) {
			throw new AppError('Only profile fields can be updated', 400, { code: ERROR_CODES.BAD_REQUEST });
		}

		const profileUpdate = { ...updatedProfileData };
		const isRemovingProfilePicture = profileUpdate.profilePicture === null;

		// A client-supplied Cloudinary id could point at another user's image, which would later be destroyed.
		if (Object.prototype.hasOwnProperty.call(profileUpdate, 'profilePicture') && !isRemovingProfilePicture) {
			throw new AppError('profilePicture can only be set by uploading a file', 400, { code: ERROR_CODES.BAD_REQUEST });
		}

		assertValidUserIds([userId]);

		let replacedProfilePicture = null;

		if (profilePictureFile || isRemovingProfilePicture) {
			const userWithProfilePicture = await UserModel.findOne({ _id: userId });

			if (!userWithProfilePicture) {
				throw createUserNotFoundError();
			}

			replacedProfilePicture = userWithProfilePicture.profilePicture;
		}

		let uploadedImage = null;

		if (profilePictureFile) {
			uploadedImage = await imageStorageService.uploadImage({ file: profilePictureFile, fieldName: constants.PROFILE_PICTURE_FIELD });
		}

		let user;

		try {
			if (uploadedImage) {
				profileUpdate.profilePicture = { imageUrl: uploadedImage.imageUrl, imageIdentifier: uploadedImage.imageIdentifier };
			}

			const userUpdate = { ...profileUpdate };

			if (isRemovingProfilePicture) {
				delete userUpdate.profilePicture;
				userUpdate.$unset = { profilePicture: 1 };
			}

			user = await UserModel.findOneAndUpdate({ _id: userId }, userUpdate, {
				new: true,
				runValidators: true,
				context: 'query',
			});

			if (!user) {
				throw createUserNotFoundError();
			}
		} catch (error) {
			if (uploadedImage) {
				await imageStorageService.discardUploadedImage(uploadedImage.imageIdentifier);
			}

			throw error;
		}

		if (replacedProfilePicture) {
			try {
				await imageStorageService.deleteImage(replacedProfilePicture.imageIdentifier);
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
	if (userId === userIdToFollow) {
		throw new AppError('Users cannot follow themselves', 400, { code: ERROR_CODES.BAD_REQUEST });
	}

	try {
		await assertUsersExist([userId, userIdToFollow]);

		const currentlyLoggedUser = await UserModel.findOneAndUpdate({ _id: userId }, { $addToSet: { following: userIdToFollow } }, { new: true });

		await UserModel.updateOne({ _id: userIdToFollow }, { $addToSet: { followers: userId } }, { new: true });

		const updatedUserData = getNeccessaryUserData(currentlyLoggedUser);

		return updatedUserData;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not follow user', 500, { cause: error });
	}
};

const unfollowUser = async (userId, userIdToUnfollow) => {
	try {
		await assertUsersExist([userId, userIdToUnfollow]);

		const currentlyLoggedUser = await UserModel.findOneAndUpdate({ _id: userId }, { $pull: { following: userIdToUnfollow } }, { new: true });

		await UserModel.updateOne({ _id: userIdToUnfollow }, { $pull: { followers: userId } }, { new: true });

		const updatedUserData = getNeccessaryUserData(currentlyLoggedUser);

		return updatedUserData;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not unfollow user', 500, { cause: error });
	}
};

module.exports = {
	signUp,
	login,
	getUsersProfileDataByUserIds,
	getUsersProfileDataBySearchWord,
	getFollowers,
	getFollowing,
	updateUserProfileData,
	followUser,
	unfollowUser,
};
