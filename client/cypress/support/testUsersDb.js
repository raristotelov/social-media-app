const path = require('path');

const { TEST_EMAIL_PREFIX, TEST_EMAIL_DOMAIN } = require('./testUser');

const SERVER_ROOT = path.resolve(__dirname, '../../../server');

// The models are required from the server rather than redeclared, so collection
// names and schemas can never drift apart from the ones the app actually uses.
const UserModel = require(path.join(SERVER_ROOT, 'src/models/userModel'));
const UserPostModel = require(path.join(SERVER_ROOT, 'src/models/userPostModel'));
const CommentModel = require(path.join(SERVER_ROOT, 'src/models/commentModel'));

// Take mongoose from a model rather than requiring it here. The models resolve
// mongoose from server/node_modules, so requiring it from client/node_modules would
// give a second, separate instance — connecting that one leaves the models
// unconnected and every query hangs until it times out.
const mongoose = UserModel.base;

const testEmailPattern = new RegExp(`^${TEST_EMAIL_PREFIX.replace('+', '\\+')}.*${TEST_EMAIL_DOMAIN.replace('.', '\\.')}$`);

const getConnectionString = () => {
	if (process.env.MONGODB_URI) {
		return process.env.MONGODB_URI;
	}

	// Fall back to the server's own env file so the connection string lives in one
	// place instead of being duplicated into the client.
	require('dotenv').config({ path: path.join(SERVER_ROOT, '.env') });

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

// Removes the given accounts and every trace of them, including marks they left on
// other people's records.
const removeUsersById = async (testUserIds) => {
	if (!testUserIds.length) {
		return { users: 0, posts: 0, comments: 0 };
	}

	const testUserPosts = await UserPostModel.find({ userId: { $in: testUserIds } }).select({ _id: 1 });
	const testUserPostIds = testUserPosts.map((post) => post._id);

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
};
