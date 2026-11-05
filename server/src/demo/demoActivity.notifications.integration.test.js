const mongoose = require('mongoose');

const { cloudinary } = require('../config/cloudinary');
const NotificationModel = require('../models/notificationModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const config = require('./demoConfig');
const { runDemoActivity } = require('./demoActivity');
const { loadDemoData } = require('./loadDemoData');
const { createRandom } = require('./random');
const { loadFixture, startDatabase, stopDatabase, seedDatabase, installStoryUploadMock } = require('./demoTestSupport');

jest.mock('../config/cloudinary', () => ({
	cloudinary: { uploader: { upload: jest.fn() } },
}));

jest.mock('./loadDemoData', () => ({
	loadDemoData: jest.fn(),
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 120 * 1000;
const SEED_NOW = new Date('2026-10-29T12:30:00.000Z');
const SIGN_UP_COUNT = 60;
const MS_PER_SECOND = 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

const fixture = loadFixture();

const createSignUp = (index, signedUpAt) => {
	const userId = new mongoose.Types.ObjectId(mongoose.Types.ObjectId.generate(Math.floor(signedUpAt.getTime() / MS_PER_SECOND)));

	return UserModel.create({ _id: userId, email: `signup-${index}@example.com`, username: `signup-${index}`, password: 'hashed-password' });
};

describe('demo activity notifications', () => {
	let mongoServer;
	let signUps;

	beforeAll(async () => {
		mongoServer = await startDatabase();
		await NotificationModel.init();
		await seedDatabase(fixture, SEED_NOW);
		loadDemoData.mockResolvedValue(fixture);
		installStoryUploadMock(cloudinary.uploader.upload);

		const signedUpAt = new Date(SEED_NOW.getTime() - config.HOUR_MS);

		signUps = [];

		for (let index = 0; index < SIGN_UP_COUNT; index += 1) {
			signUps.push(await createSignUp(index, signedUpAt));
		}

		await runDemoActivity({ now: new Date(SEED_NOW.getTime() + 30 * config.HOUR_MS), random: createRandom(7) });
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await stopDatabase(mongoServer);
	});

	it('should give a new user a follow notification for each persona that followed them', async () => {
		const users = await UserModel.find({ _id: { $in: signUps.map((signUp) => signUp._id) } }).lean();
		const followedUsers = users.filter((user) => user.followers.length);

		expect(followedUsers.length).toBeGreaterThan(0);

		for (const user of followedUsers) {
			const notifications = await NotificationModel.find({ recipientId: user._id, type: 'follow' }).lean();

			expect(notifications.map((notification) => String(notification.actorId)).sort()).toEqual(user.followers.map(String).sort());
		}
	});

	it('should never notify a persona', async () => {
		const personas = await UserModel.find({ accountType: 'persona' }).select({ _id: 1 }).lean();

		await expect(NotificationModel.countDocuments({ recipientId: { $in: personas.map((persona) => persona._id) } })).resolves.toBe(0);
	});

	it('should leave no notification pointing at a post the rolling window removed', async () => {
		const postIds = (await UserPostModel.find().select({ _id: 1 }).lean()).map((post) => post._id);
		const notifications = await NotificationModel.find({ userPostId: { $exists: true } }).lean();

		expect(notifications.filter((notification) => !postIds.some((postId) => postId.equals(notification.userPostId)))).toEqual([]);
	});
});
