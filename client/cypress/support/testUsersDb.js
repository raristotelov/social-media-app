const path = require('path');

const { TEST_EMAIL_PREFIX, TEST_EMAIL_DOMAIN } = require('./testUser');

const SERVER_ROOT = path.resolve(__dirname, '../../../server');

// The models are required from the server rather than redeclared, so collection
// names and schemas can never drift apart from the ones the app actually uses.
const UserModel = require(path.join(SERVER_ROOT, 'src/models/userModel'));
const UserPostModel = require(path.join(SERVER_ROOT, 'src/models/userPostModel'));
const CommentModel = require(path.join(SERVER_ROOT, 'src/models/commentModel'));
const StoryModel = require(path.join(SERVER_ROOT, 'src/models/storyModel'));
const StoryViewModel = require(path.join(SERVER_ROOT, 'src/models/storyViewModel'));

// Take mongoose from a model rather than requiring it here. The models resolve
// mongoose from server/node_modules, so requiring it from client/node_modules would
// give a second, separate instance — connecting that one leaves the models
// unconnected and every query hangs until it times out.
const mongoose = UserModel.base;

const testEmailPattern = new RegExp(`^${TEST_EMAIL_PREFIX.replace('+', '\\+')}.*${TEST_EMAIL_DOMAIN.replace('.', '\\.')}$`);

const loadServerEnv = () => {
	require('dotenv').config({ path: path.join(SERVER_ROOT, '.env') });
};

const getConnectionString = () => {
	if (process.env.MONGODB_URI) {
		return process.env.MONGODB_URI;
	}

	// Fall back to the server's own env file so the connection string lives in one
	// place instead of being duplicated into the client.
	loadServerEnv();

	if (!process.env.MONGODB_URI) {
		throw new Error('MONGODB_URI is not set. Cypress cleanup needs it — export it before running Cypress, or set it in server/.env.');
	}

	return process.env.MONGODB_URI;
};

const withConnection = async (work) => {
	await mongoose.connect(getConnectionString());

	try {
		return await work();
	} finally {
		await mongoose.disconnect();
	}
};

let imageStorageService;

// The server's Cloudinary config reads process.env the moment it is required, so the
// server's env file has to be loaded before the service is, not after.
const getImageStorageService = () => {
	if (!imageStorageService) {
		loadServerEnv();

		imageStorageService = require(path.join(SERVER_ROOT, 'src/services/imageStorageService'));
	}

	return imageStorageService;
};

let cloudinaryConfig;

const getCloudinaryConfig = () => {
	if (!cloudinaryConfig) {
		loadServerEnv();

		cloudinaryConfig = require(path.join(SERVER_ROOT, 'src/config/cloudinary'));
	}

	return cloudinaryConfig;
};

const getCloudinaryFolder = () => {
	const folder = getCloudinaryConfig().getUploadFolder();

	if (!folder) {
		throw new Error('CLOUDINARY_FOLDER is not set. Cypress needs it — export it before running Cypress, or set it in server/.env.');
	}

	return folder;
};

const isNotFoundError = (error) => error?.http_code === 404 || error?.error?.http_code === 404;

const cloudinaryAssetExists = async (publicId) => {
	try {
		await getCloudinaryConfig().cloudinary.api.resource(publicId);

		return true;
	} catch (error) {
		if (isNotFoundError(error)) {
			return false;
		}

		throw error;
	}
};

// Destroys exactly the given Cloudinary images, never a folder or prefix, because local
// development images live in the same folder. An image that is already gone counts as done.
const destroyImagesById = async (imageIdentifiers) => {
	if (!imageIdentifiers.length) {
		return;
	}

	const { deleteImage } = getImageStorageService();

	const results = await Promise.allSettled(imageIdentifiers.map((imageIdentifier) => deleteImage(imageIdentifier)));

	const failedIdentifiers = imageIdentifiers.filter((imageIdentifier, index) => results[index].status === 'rejected');

	if (failedIdentifiers.length) {
		const firstFailure = results.find((result) => result.status === 'rejected');

		throw new Error(
			`Could not delete Cloudinary image(s) ${failedIdentifiers.join(', ')}. The test accounts were left in place so the next cleanup can retry.`,
			{ cause: firstFailure.reason },
		);
	}
};

// Removes the given accounts and every trace of them, including marks they left on
// other people's records.
const removeUsersById = async (testUserIds) => {
	if (!testUserIds.length) {
		return { users: 0, posts: 0, comments: 0, stories: 0, storyViews: 0 };
	}

	// Profile pictures live on the user, post images on their posts and story images on
	// their stories, so images are collected from all three.
	const testUserPosts = await UserPostModel.find({ userId: { $in: testUserIds } }).select({ _id: 1, imageIdentifier: 1 });
	const testUserPostIds = testUserPosts.map((post) => post._id);
	const testUserStories = await StoryModel.find({ userId: { $in: testUserIds } }).select({ _id: 1, imageIdentifier: 1 });
	const testUserStoryIds = testUserStories.map((story) => story._id);
	const testUsersWithPictures = await UserModel.find({ _id: { $in: testUserIds } }).select({ _id: 1, profilePicture: 1 });
	const testUserImageIdentifiers = [
		...testUserPosts.map((post) => post.imageIdentifier),
		...testUserStories.map((story) => story.imageIdentifier),
		...testUsersWithPictures.map((user) => user.profilePicture?.imageIdentifier),
	];

	// Images go first: if this throws, the database still points at them and a later
	// cleanup can find and retry them.
	await destroyImagesById([...new Set(testUserImageIdentifiers.filter(Boolean))]);

	// Comments written by a test user, plus anyone else's comments on their posts,
	// which would otherwise be orphaned.
	const commentsToDelete = await CommentModel.find({
		$or: [{ userId: { $in: testUserIds } }, { userPostId: { $in: testUserPostIds } }],
	}).select({ _id: 1 });
	const commentIdsToDelete = commentsToDelete.map((comment) => comment._id);

	const deletedComments = await CommentModel.deleteMany({
		$or: [{ _id: { $in: commentIdsToDelete } }, { parentCommentId: { $in: commentIdsToDelete } }],
	});

	const deletedPosts = await UserPostModel.deleteMany({ _id: { $in: testUserPostIds } });

	const deletedStoryViews = await StoryViewModel.deleteMany({
		$or: [{ storyId: { $in: testUserStoryIds } }, { viewerId: { $in: testUserIds } }],
	});
	const deletedStories = await StoryModel.deleteMany({ _id: { $in: testUserStoryIds } });

	await UserPostModel.updateMany({ likes: { $in: testUserIds } }, { $pull: { likes: { $in: testUserIds } } });
	await CommentModel.updateMany({ likes: { $in: testUserIds } }, { $pull: { likes: { $in: testUserIds } } });
	await UserModel.updateMany(
		{ $or: [{ followers: { $in: testUserIds } }, { following: { $in: testUserIds } }] },
		{ $pull: { followers: { $in: testUserIds }, following: { $in: testUserIds } } },
	);

	const deletedUsers = await UserModel.deleteMany({ _id: { $in: testUserIds } });

	return {
		users: deletedUsers.deletedCount,
		posts: deletedPosts.deletedCount,
		comments: deletedComments.deletedCount,
		stories: deletedStories.deletedCount,
		storyViews: deletedStoryViews.deletedCount,
	};
};

// Sweeps every test account. Used as a safety net for specs that died mid-run.
const cleanTestUsers = () =>
	withConnection(async () => {
		const testUsers = await UserModel.find({ email: testEmailPattern }).select({ _id: 1 });

		return removeUsersById(testUsers.map((user) => user._id));
	});

// Removes one account. Refuses any address outside the test convention, so a typo
// in a spec can never delete a real user.
const deleteTestUser = (email) => {
	if (!testEmailPattern.test(email)) {
		throw new Error(`Refusing to delete "${email}": only ${TEST_EMAIL_PREFIX}…${TEST_EMAIL_DOMAIN} accounts may be removed.`);
	}

	return withConnection(async () => {
		const testUsers = await UserModel.find({ email }).select({ _id: 1 });

		return removeUsersById(testUsers.map((user) => user._id));
	});
};

module.exports = {
	cleanTestUsers,
	deleteTestUser,
	getCloudinaryFolder,
	cloudinaryAssetExists,
};
