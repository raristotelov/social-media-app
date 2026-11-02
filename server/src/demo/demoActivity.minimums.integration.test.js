const { cloudinary } = require('../config/cloudinary');
const StoryModel = require('../models/storyModel');
const UserPostModel = require('../models/userPostModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
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

jest.mock('./demoConfig', () => ({
	...jest.requireActual('./demoConfig'),
	STORIES_PER_DAY: [0, 0],
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 120 * 1000;
const SEED_NOW = new Date('2026-10-29T12:30:00.000Z');

jest.setTimeout(TEST_TIMEOUT_MS);

const fixture = loadFixture();

const prepareRun = async (lastCompletedHour) => {
	await seedDatabase(fixture, SEED_NOW);
	await DemoActivityRunModel.updateOne({}, { lastCompletedHour });
	loadDemoData.mockResolvedValue(fixture);
	installStoryUploadMock(cloudinary.uploader.upload);
};

const countOnUtcDay = (Model, day) =>
	Model.countDocuments({ createdAt: { $gte: new Date(`${day}T00:00:00.000Z`), $lt: new Date(`${day}T23:59:59.999Z`) } });

describe('runDemoActivity daily minimums when no story or post is drawn at random', () => {
	let mongoServer;

	beforeAll(async () => {
		mongoServer = await startDatabase();
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await stopDatabase(mongoServer);
	});

	describe.each([
		['a draw that never chooses anything', () => () => 0.999],
		['a seeded draw', () => createRandom(21)],
	])('on a day with %s', (description, makeRandom) => {
		beforeAll(async () => {
			await prepareRun(new Date('2026-11-03T07:00:00.000Z'));
			await runDemoActivity({ now: new Date('2026-11-03T23:30:00.000Z'), random: makeRandom() });
		});

		it('should top the day up to at least 15 stories', async () => {
			expect(await countOnUtcDay(StoryModel, '2026-11-03')).toBeGreaterThanOrEqual(config.MIN_STORIES_PER_DAY);
		});

		it('should top the day up to at least 10 posts', async () => {
			expect(await countOnUtcDay(UserPostModel, '2026-11-03')).toBeGreaterThanOrEqual(config.MIN_POSTS_PER_DAY);
		});

		it('should create the topped-up stories inside the 22:00 hour', async () => {
			const outsideLastHour = await StoryModel.countDocuments({ createdAt: { $lt: new Date('2026-11-03T22:00:00.000Z') } });

			expect(outsideLastHour).toBe(0);
		});
	});

	describe('when the day to top up is already older than 24 hours', () => {
		beforeAll(async () => {
			await prepareRun(new Date('2026-11-03T07:00:00.000Z'));
			await runDemoActivity({ now: new Date('2026-11-05T12:30:00.000Z'), random: createRandom(22) });
		});

		it('should still top that day up to 10 posts', async () => {
			expect(await countOnUtcDay(UserPostModel, '2026-11-03')).toBeGreaterThanOrEqual(config.MIN_POSTS_PER_DAY);
		});

		it('should not create stories for that day, as they would already have expired', async () => {
			expect(await countOnUtcDay(StoryModel, '2026-11-03')).toBe(0);
		});

		it('should top up the following day, which is still within 24 hours, to at least 15 stories', async () => {
			expect(await countOnUtcDay(StoryModel, '2026-11-04')).toBeGreaterThanOrEqual(config.MIN_STORIES_PER_DAY);
		});
	});
});
