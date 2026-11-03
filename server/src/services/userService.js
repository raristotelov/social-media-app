const JWT = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const UserModel = require('../models/userModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { asFieldError } = require('../utils/fieldErrors');
const { createUserNotFoundError } = require('../utils/notFoundErrors');
const { getPasswordRuleErrorCode } = require('../utils/passwordRules');
const { createDemoVisitor } = require('../demo/createDemoVisitor');
const { reactToSignUp } = require('../demo/userReactions');
const commentService = require('./commentService');
const imageStorageService = require('./imageStorageService');
const { USER_ROW_PROJECTION, getUserRowsInOrder } = require('./userRowService');
const { createPostVisibility, getHiddenVisitorIds, withoutHiddenIds } = require('./visitorVisibilityService');

const necessaryUserFields = ['_id', 'email', 'accountType', 'username', 'bio', 'theme', 'profilePicture', 'posts', 'followers', 'following'];

const FOLLOW_LIST_FIELDS = ['followers', 'following'];

const SEARCH_ROW_PROJECTION = {
	...USER_ROW_PROJECTION,
	followersCount: { $size: { $ifNull: ['$followers', []] } },
};

const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const signAuthToken = ({ _id, username }) =>
	JWT.sign({ userId: _id, username }, process.env.JWT_SECRET, {
		expiresIn: constants.JWT_EXPIRY,
	});

const getNeccessaryUserData = (user, hiddenVisitorIds = []) => {
	const userObject = {};

	for (let i = 0; i < necessaryUserFields.length; i += 1) {
		if (user[necessaryUserFields[i]]) {
			userObject[necessaryUserFields[i]] = user[necessaryUserFields[i]];
		}
	}

	for (const listField of FOLLOW_LIST_FIELDS) {
		if (userObject[listField]) {
			userObject[listField] = withoutHiddenIds(userObject[listField], hiddenVisitorIds);
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
		const passwordErrorCode = getPasswordRuleErrorCode(password);

		if (passwordErrorCode) {
			throw AppError.fromFields({ password: passwordErrorCode }, 400);
		}

		const hashedPassword = await bcrypt.hash(password, constants.SALT_ROUNDS);

		const user = new UserModel({ email, username, password: hashedPassword });

		await user.save();

		reactToSignUp(user._id);

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

const demoLogin = async () => {
	try {
		const visitor = await createDemoVisitor();

		return signAuthToken(visitor);
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not start the demo', 500, { cause: error });
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

const changePassword = async (userId, { currentPassword, newPassword } = {}) => {
	try {
		const fields = {};

		if (typeof currentPassword !== 'string' || !currentPassword) {
			fields.currentPassword = ERROR_CODES.PASSWORD_REQUIRED;
		}

		const newPasswordErrorCode = getPasswordRuleErrorCode(newPassword);

		if (newPasswordErrorCode) {
			fields.newPassword = newPasswordErrorCode;
		}

		if (Object.keys(fields).length) {
			throw AppError.fromFields(fields, 400);
		}

		assertValidUserIds([userId]);

		const user = await UserModel.findById(userId).select({ password: 1 });

		if (!user) {
			throw createUserNotFoundError();
		}

		const currentPasswordIsCorrect = await bcrypt.compare(currentPassword, user.password);

		if (!currentPasswordIsCorrect) {
			throw AppError.fromFields({ currentPassword: ERROR_CODES.CURRENT_PASSWORD_WRONG }, 400);
		}

		if (newPassword === currentPassword) {
			throw AppError.fromFields({ newPassword: ERROR_CODES.PASSWORD_UNCHANGED }, 400);
		}

		const hashedPassword = await bcrypt.hash(newPassword, constants.SALT_ROUNDS);

		const { matchedCount } = await UserModel.updateOne({ _id: userId, password: user.password }, { password: hashedPassword });

		if (!matchedCount) {
			throw AppError.fromFields({ currentPassword: ERROR_CODES.CURRENT_PASSWORD_WRONG }, 400);
		}
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not change password', 500, { cause: error });
	}
};

const compareNewestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

const toProfileData = ({ user, requesterId, previewComments, hiddenVisitorIds, applyVisibility }) => {
	const profileData = user.toObject();

	if (String(user._id) !== String(requesterId)) {
		delete profileData.email;
		delete profileData.accountType;
	}

	for (const listField of FOLLOW_LIST_FIELDS) {
		if (profileData[listField]) {
			profileData[listField] = withoutHiddenIds(profileData[listField], hiddenVisitorIds);
		}
	}

	return {
		...profileData,
		posts: profileData.posts
			.map((post) => ({
				...applyVisibility(post),
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

		const hiddenVisitorIds = await getHiddenVisitorIds(requesterId);

		if (withoutHiddenIds(userIds, hiddenVisitorIds).length !== userIds.length) {
			throw createUserNotFoundError();
		}

		const usersResult = await UserModel.find({ _id: { $in: userIds } })
			.select({ _id: 1, username: 1, email: 1, accountType: 1, posts: 1, bio: 1, theme: 1, profilePicture: 1, following: 1, followers: 1 })
			.populate({ path: 'posts' });

		if (usersResult.length !== userIds.length) {
			throw new AppError('User not found', 404, { code: ERROR_CODES.USER_NOT_FOUND });
		}

		const profilePostIds = usersResult.flatMap((user) => user.posts.map((post) => post._id));

		const applyVisibility = await createPostVisibility(profilePostIds, hiddenVisitorIds);
		const previewComments = await commentService.getPreviewCommentsForPosts(profilePostIds, hiddenVisitorIds);

		const mappedUsers = usersResult.map((user) => toProfileData({ user, requesterId, previewComments, hiddenVisitorIds, applyVisibility }));

		return mappedUsers;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError('Could not load users profile data', 500, { cause: error });
	}
};

const getUsersProfileDataBySearchWord = async ({ searchWord, requesterId }) => {
	try {
		const hiddenVisitorIds = await getHiddenVisitorIds(requesterId);
		const match = { username: { $regex: `^${escapeRegExp(searchWord)}`, $options: 'i' } };

		if (hiddenVisitorIds.length) {
			match._id = { $nin: hiddenVisitorIds };
		}

		const users = await UserModel.aggregate([{ $match: match }, { $project: SEARCH_ROW_PROJECTION }]);

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

		const hiddenVisitorIds = await getHiddenVisitorIds(requesterId);

		if (withoutHiddenIds([user._id], hiddenVisitorIds).length === 0) {
			throw createUserNotFoundError();
		}

		const listedUserIds = withoutHiddenIds(user[listField], hiddenVisitorIds);

		const orderedRows = await getUserRowsInOrder(listedUserIds);

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

		const updatedUserData = getNeccessaryUserData(user, await getHiddenVisitorIds(userId));

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

		const updatedUserData = getNeccessaryUserData(currentlyLoggedUser, await getHiddenVisitorIds(userId));

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

		const updatedUserData = getNeccessaryUserData(currentlyLoggedUser, await getHiddenVisitorIds(userId));

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
	demoLogin,
	changePassword,
	getUsersProfileDataByUserIds,
	getUsersProfileDataBySearchWord,
	getFollowers,
	getFollowing,
	updateUserProfileData,
	followUser,
	unfollowUser,
};
