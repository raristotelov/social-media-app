const { cloudinary } = require('../config/cloudinary');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
const StoryModel = require('../models/storyModel');
const UserModel = require('../models/userModel');
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

jest.mock('./demoConfig', () => ({
	...jest.requireActual('./demoConfig'),
	STORIES_PER_DAY: [450, 450],
	FOLLOWS_PER_DAY: 360,
	UNFOLLOWS_PER_DAY: 0,
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 120 * 1000;
const SEED_NOW = new Date('2026-10-29T12:30:00.000Z');

jest.setTimeout(TEST_TIMEOUT_MS);

const fixture = loadFixture();

const loadFollowKeys = async () => {
	const users = await UserModel.find().select({ following: 1 }).lean();

	return new Set(users.flatMap((user) => user.following.map((followedId) => `${user._id}>${followedId}`)));
};

describe('runDemoActivity tier shares of stories and follows', () => {
	let mongoServer;
	let tierByUserId;
	let storyTierCounts;
	let storyTotal;
	let followTierCounts;
	let followTotal;

	beforeAll(async () => {
		mongoServer = await startDatabase();

		await seedDatabase(fixture, SEED_NOW);
		loadDemoData.mockResolvedValue(fixture);
		installStoryUploadMock(cloudinary.uploader.upload);
		await DemoActivityRunModel.updateOne({}, { lastCompletedHour: new Date('2026-11-03T07:00:00.000Z') });

		tierByUserId = new Map((await DemoAccountStateModel.find().lean()).map((state) => [String(state.userId), state.tier]));

		const followsBefore = await loadFollowKeys();

		await runDemoActivity({ now: new Date('2026-11-03T23:30:00.000Z'), random: createRandom(51) });

		const stories = await StoryModel.find().lean();

		storyTotal = stories.length;
		storyTierCounts = { creator: 0, casualPoster: 0, lurker: 0 };
		stories.forEach((story) => {
			storyTierCounts[tierByUserId.get(String(story.userId))] += 1;
		});

		const addedFollows = [...(await loadFollowKeys())].filter((key) => !followsBefore.has(key));

		followTotal = addedFollows.length;
		followTierCounts = { creator: 0, casualPoster: 0, lurker: 0 };
		addedFollows.forEach((key) => {
			followTierCounts[tierByUserId.get(key.split('>')[1])] += 1;
		});
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await stopDatabase(mongoServer);
	});

	describe('stories', () => {
		it('should create enough stories to measure the tier shares', () => {
			expect(storyTotal).toBeGreaterThan(300);
		});

		it('should make creators the clear majority, at roughly 60%', () => {
			expect(storyTierCounts.creator / storyTotal).toBeGreaterThan(0.52);
			expect(storyTierCounts.creator / storyTotal).toBeLessThan(0.68);
		});

		it('should give casual posters roughly 30%', () => {
			expect(storyTierCounts.casualPoster / storyTotal).toBeGreaterThan(0.22);
			expect(storyTierCounts.casualPoster / storyTotal).toBeLessThan(0.38);
		});

		it('should give lurkers roughly 10%', () => {
			expect(storyTierCounts.lurker / storyTotal).toBeGreaterThan(0.04);
			expect(storyTierCounts.lurker / storyTotal).toBeLessThan(0.16);
		});
	});

	describe('follows', () => {
		it('should create enough follows to measure the tier shares', () => {
			expect(followTotal).toBeGreaterThan(150);
		});

		it('should direct a majority of new follows towards creators, at roughly 60%', () => {
			expect(followTierCounts.creator / followTotal).toBeGreaterThan(0.5);
			expect(followTierCounts.creator / followTotal).toBeLessThan(0.7);
		});

		it('should direct roughly 25% towards casual posters', () => {
			expect(followTierCounts.casualPoster / followTotal).toBeGreaterThan(0.17);
			expect(followTierCounts.casualPoster / followTotal).toBeLessThan(0.33);
		});

		it('should direct roughly 15% towards lurkers', () => {
			expect(followTierCounts.lurker / followTotal).toBeGreaterThan(0.08);
			expect(followTierCounts.lurker / followTotal).toBeLessThan(0.22);
		});
	});
});
