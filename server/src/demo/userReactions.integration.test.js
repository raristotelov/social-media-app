const mongoose = require('mongoose');

const { cloudinary } = require('../config/cloudinary');
const CommentModel = require('../models/commentModel');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const config = require('./demoConfig');
const { runDemoActivity } = require('./demoActivity');
const { loadDemoData, loadGenericComments } = require('./loadDemoData');
const { createRandom } = require('./random');
const { scheduleReactions } = require('./reactionDelivery');
const { applyDueEvents } = require('./scheduledEvents');
const { reactToSignUp, reactToUpload } = require('./userReactions');
const { loadFixture, startDatabase, stopDatabase, seedDatabase, installStoryUploadMock } = require('./demoTestSupport');

jest.mock('../config/cloudinary', () => ({
	cloudinary: { uploader: { upload: jest.fn(), destroy: jest.fn() } },
	isConfigured: jest.fn(() => true),
	getUploadFolder: jest.fn(() => 'user-images'),
}));

jest.mock('./loadDemoData', () => ({
	loadDemoData: jest.fn(),
	loadVisitorData: jest.fn(),
	loadGenericComments: jest.fn(),
}));

jest.mock('./reactionDelivery', () => ({
	...jest.requireActual('./reactionDelivery'),
	scheduleReactions: jest.fn(),
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 120 * 1000;
const SEED_NOW = new Date('2026-11-03T02:30:00.000Z');
const NOW = new Date('2026-11-03T12:00:00.000Z');
const HOUR_MS = config.HOUR_MS;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIFTEEN_SECONDS_MS = 15 * 1000;
const GENERIC_COMMENTS = Array.from({ length: 30 }, (value, index) => `Generic comment ${index + 1}`);

jest.setTimeout(TEST_TIMEOUT_MS);

const fixture = loadFixture();

const TIMESTAMP_HEX_LENGTH = 8;

const objectIdAt = (date) => {
	const timestampHex = Math.floor(date.getTime() / 1000)
		.toString(16)
		.padStart(TIMESTAMP_HEX_LENGTH, '0');

	return new mongoose.Types.ObjectId(timestampHex + new mongoose.Types.ObjectId().toHexString().slice(TIMESTAMP_HEX_LENGTH));
};

const stringIds = (values) => values.map(String);

const ofType = (events, type) => events.filter((event) => event.type === type);

const createUser = (username, { createdAt = NOW, ...extra } = {}) =>
	UserModel.create({ _id: objectIdAt(createdAt), email: `${username}@example.com`, username, password: 'hashed-password', ...extra });

const createPost = (author) => {
	const identifier = `user-images/${new mongoose.Types.ObjectId()}`;

	return UserPostModel.create({
		imageIdentifier: identifier,
		imageUrl: `https://cdn.example.com/${identifier}.jpg`,
		imageWidth: 100,
		imageHeight: 100,
		userId: author._id,
	});
};

describe('reactions to uploads and sign-ups against a real database', () => {
	let mongoServer;
	let personaIds;

	beforeAll(async () => {
		mongoServer = await startDatabase();
		await seedDatabase(fixture, SEED_NOW);

		personaIds = (await DemoAccountStateModel.find().select({ userId: 1 }).lean()).map((state) => state.userId);
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await stopDatabase(mongoServer);
	});

	beforeEach(async () => {
		scheduleReactions.mockReset();
		loadGenericComments.mockReset();
		loadGenericComments.mockResolvedValue(GENERIC_COMMENTS);
		await DemoScheduledEventModel.deleteMany({});
	});

	afterEach(async () => {
		jest.restoreAllMocks();
		await UserModel.deleteMany({ accountType: { $in: ['user', 'demo'] } });
		await UserPostModel.deleteMany({ userId: { $nin: personaIds } });
		await CommentModel.deleteMany({ userId: { $nin: personaIds } });
		await UserModel.updateMany({ accountType: 'persona' }, { $pull: { followers: { $nin: personaIds } } });
	});

	describe('reactToUpload', () => {
		const followWithPersonas = async (owner, count) => {
			const followers = personaIds.slice(0, count);

			await UserModel.updateOne({ _id: owner._id }, { $set: { followers } });

			return followers;
		};

		describe.each([
			['a regular user', 'user'],
			['a demo visitor', 'demo'],
		])('for an upload by %s', (description, accountType) => {
			let owner;
			let post;
			let immediate;
			let later;

			beforeEach(async () => {
				owner = await createUser(`owner_${accountType}`, { accountType });
				await followWithPersonas(owner, 40);
				post = await createPost(owner);

				await reactToUpload(post, { now: NOW, random: createRandom(3) });

				immediate = scheduleReactions.mock.calls[0][0];
				later = await DemoScheduledEventModel.find().lean();
			});

			it('should schedule likes from 25 to 35 percent of the followers within 10 minutes', () => {
				const likes = ofType(immediate, 'postLike');

				expect(likes.length).toBeGreaterThanOrEqual(10);
				expect(likes.length).toBeLessThanOrEqual(14);
			});

			it('should schedule 1 to 3 comments within 10 minutes', () => {
				const comments = ofType(immediate, 'comment');

				expect(comments.length).toBeGreaterThanOrEqual(1);
				expect(comments.length).toBeLessThanOrEqual(3);
			});

			it('should schedule the first reactions between 15 seconds and 10 minutes after the upload', () => {
				immediate.forEach((event) => {
					expect(event.dueAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + FIFTEEN_SECONDS_MS);
					expect(event.dueAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + TEN_MINUTES_MS);
				});
			});

			it('should react to the new post', () => {
				immediate.forEach((event) => expect(String(event.userPostId)).toBe(String(post._id)));
				later.forEach((event) => expect(String(event.userPostId)).toBe(String(post._id)));
			});

			it('should store 1 to 5 more likes and 0 to 2 more comments for later', () => {
				expect(ofType(later, 'postLike').length).toBeGreaterThanOrEqual(1);
				expect(ofType(later, 'postLike').length).toBeLessThanOrEqual(5);
				expect(ofType(later, 'comment').length).toBeLessThanOrEqual(2);
			});

			it('should store the later reactions as due after 10 minutes and within 48 hours', () => {
				later.forEach((event) => {
					expect(event.dueAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + TEN_MINUTES_MS);
					expect(event.dueAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + 48 * HOUR_MS);
				});
			});

			it('should store the text and id of the later comments', () => {
				ofType(later, 'comment').forEach((event) => {
					expect(GENERIC_COMMENTS).toContain(event.text);
					expect(event.commentId).toBeDefined();
				});
			});

			it('should never react as the owner of the post', () => {
				[...immediate, ...later].forEach((event) => expect(String(event.userId)).not.toBe(String(owner._id)));
			});

			it('should leave the later reactions to the hourly job: they appear on the post once due', async () => {
				const likesBefore = (await UserPostModel.findById(post._id).lean()).likes.length;

				await applyDueEvents(new Date(NOW.getTime() + 49 * HOUR_MS));

				const updated = await UserPostModel.findById(post._id).lean();
				const comments = await CommentModel.find({ userPostId: post._id }).lean();

				expect(updated.likes.length - likesBefore).toBe(ofType(later, 'postLike').length);
				expect(comments).toHaveLength(ofType(later, 'comment').length);
				expect(updated.commentsCount).toBe(comments.length);
				expect(await DemoScheduledEventModel.countDocuments()).toBe(0);
			});
		});

		it('should react to an upload from an account of any age', async () => {
			const veteran = await createUser('veteran', { accountType: 'user', createdAt: new Date('2024-01-01T00:00:00.000Z') });
			const post = await createPost(veteran);

			await reactToUpload(post, { now: NOW, random: createRandom(4) });

			expect(scheduleReactions.mock.calls[0][0].length).toBeGreaterThanOrEqual(4);
		});

		it('should react to an upload from an account created a moment ago', async () => {
			const newcomer = await createUser('newcomer', { accountType: 'user', createdAt: NOW });
			const post = await createPost(newcomer);

			await reactToUpload(post, { now: NOW, random: createRandom(4) });

			expect(scheduleReactions.mock.calls[0][0].length).toBeGreaterThanOrEqual(4);
		});

		it('should react to a second upload as well as to the first', async () => {
			const owner = await createUser('twice', { accountType: 'user' });
			const first = await createPost(owner);
			const second = await createPost(owner);

			await reactToUpload(first, { now: NOW, random: createRandom(5) });
			await reactToUpload(second, { now: NOW, random: createRandom(6) });

			expect(scheduleReactions).toHaveBeenCalledTimes(2);
		});

		it('should schedule at least 3 likes for an account with no followers', async () => {
			const owner = await createUser('nofollowers', { accountType: 'user' });
			const post = await createPost(owner);

			await reactToUpload(post, { now: NOW, random: createRandom(7) });

			expect(ofType(scheduleReactions.mock.calls[0][0], 'postLike').length).toBeGreaterThanOrEqual(3);
		});

		it('should only count the personas among the followers when working out the share', async () => {
			const owner = await createUser('crowd', { accountType: 'user' });
			const regularFollowers = await Promise.all(
				Array.from({ length: 40 }, (value, index) => createUser(`fan_${index}`, { accountType: 'user' })),
			);

			await UserModel.updateOne({ _id: owner._id }, { $set: { followers: regularFollowers.map((fan) => fan._id) } });

			const post = await createPost(owner);

			await reactToUpload(post, { now: NOW, random: createRandom(8) });

			expect(ofType(scheduleReactions.mock.calls[0][0], 'postLike')).toHaveLength(3);
		});

		it('should only be liked by personas', async () => {
			const owner = await createUser('onlypersonas', { accountType: 'user' });
			const bystander = await createUser('bystander', { accountType: 'user' });

			await UserModel.updateOne({ _id: owner._id }, { $set: { followers: [bystander._id] } });

			const post = await createPost(owner);

			await reactToUpload(post, { now: NOW, random: createRandom(9) });

			const reactors = [...scheduleReactions.mock.calls[0][0], ...(await DemoScheduledEventModel.find().lean())].map((event) =>
				String(event.userId),
			);

			expect(reactors.every((id) => stringIds(personaIds).includes(id))).toBe(true);
		});

		describe('for an upload by a persona', () => {
			it('should schedule nothing', async () => {
				const persona = await UserModel.findOne({ accountType: 'persona' });
				const post = await createPost(persona);

				await reactToUpload(post, { now: NOW, random: createRandom(10) });

				expect(scheduleReactions).not.toHaveBeenCalled();
				expect(await DemoScheduledEventModel.countDocuments()).toBe(0);

				await UserPostModel.deleteOne({ _id: post._id });
			});
		});

		describe('when there are no personas', () => {
			it('should schedule nothing', async () => {
				const owner = await createUser('lonely', { accountType: 'user' });
				const post = await createPost(owner);
				const states = await DemoAccountStateModel.find().lean();

				await DemoAccountStateModel.deleteMany({});
				await reactToUpload(post, { now: NOW, random: createRandom(11) });
				await DemoAccountStateModel.insertMany(states);

				expect(scheduleReactions).not.toHaveBeenCalled();
				expect(await DemoScheduledEventModel.countDocuments()).toBe(0);
			});
		});

		describe('when planning fails', () => {
			it('should not throw, so the upload still succeeds', async () => {
				jest.spyOn(console, 'error').mockImplementation(() => {});
				loadGenericComments.mockRejectedValue(new Error('comment bank missing'));

				const owner = await createUser('unlucky', { accountType: 'user' });
				const post = await createPost(owner);

				await expect(reactToUpload(post, { now: NOW, random: createRandom(12) })).resolves.toBeUndefined();
			});

			it('should log the failure and schedule nothing', async () => {
				const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

				loadGenericComments.mockRejectedValue(new Error('comment bank missing'));

				const owner = await createUser('unlucky', { accountType: 'user' });
				const post = await createPost(owner);

				await reactToUpload(post, { now: NOW, random: createRandom(12) });

				expect(errorSpy).toHaveBeenCalledWith('Could not plan the reactions to an upload', expect.any(Error));
				expect(scheduleReactions).not.toHaveBeenCalled();
			});
		});
	});

	describe('reactToSignUp', () => {
		it('should schedule 1 to 3 personas to follow the new account', async () => {
			const user = await createUser('signup', { accountType: 'user' });

			await reactToSignUp(user._id, { now: NOW, random: createRandom(1) });

			const events = scheduleReactions.mock.calls[0][0];

			expect(events.length).toBeGreaterThanOrEqual(1);
			expect(events.length).toBeLessThanOrEqual(3);
			events.forEach((event) => {
				expect(event.type).toBe('follow');
				expect(String(event.targetUserId)).toBe(String(user._id));
				expect(stringIds(personaIds)).toContain(String(event.userId));
			});
		});

		it('should schedule the follows within the first 10 minutes', async () => {
			const user = await createUser('signup', { accountType: 'user' });

			await reactToSignUp(user._id, { now: NOW, random: createRandom(2) });

			scheduleReactions.mock.calls[0][0].forEach((event) => {
				expect(event.dueAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + FIFTEEN_SECONDS_MS);
				expect(event.dueAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + TEN_MINUTES_MS);
			});
		});

		it('should schedule nothing when there are no personas', async () => {
			const user = await createUser('signup', { accountType: 'user' });
			const states = await DemoAccountStateModel.find().lean();

			await DemoAccountStateModel.deleteMany({});
			await reactToSignUp(user._id, { now: NOW, random: createRandom(3) });
			await DemoAccountStateModel.insertMany(states);

			expect(scheduleReactions.mock.calls.flatMap(([events]) => events)).toEqual([]);
		});

		it('should not throw, and should log, when planning fails', async () => {
			const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			jest.spyOn(DemoAccountStateModel, 'find').mockImplementation(() => {
				throw new Error('database down');
			});

			const user = await createUser('signup', { accountType: 'user' });

			await expect(reactToSignUp(user._id, { now: NOW, random: createRandom(4) })).resolves.toBeUndefined();
			expect(errorSpy).toHaveBeenCalledWith('Could not plan the reactions to a sign-up', expect.any(Error));
			expect(scheduleReactions).not.toHaveBeenCalled();
		});
	});
});

describe('the hourly job following up on sign-ups against a real database', () => {
	const RUN_NOW = new Date('2026-11-03T04:30:00.000Z');
	let mongoServer;
	let personaIds;
	let signUp;
	let oldSignUp;
	let visitor;

	beforeAll(async () => {
		mongoServer = await startDatabase();
		await seedDatabase(fixture, SEED_NOW);
		loadDemoData.mockResolvedValue(fixture);
		installStoryUploadMock(cloudinary.uploader.upload);

		personaIds = (await DemoAccountStateModel.find().select({ userId: 1 }).lean()).map((state) => state.userId);
		signUp = await createUser('fresh_signup', { accountType: 'user', createdAt: new Date('2026-11-03T02:10:00.000Z') });
		oldSignUp = await createUser('old_signup', { accountType: 'user', createdAt: new Date('2026-10-20T02:10:00.000Z') });
		visitor = await createUser('fresh_demo_1', { accountType: 'demo', createdAt: new Date('2026-11-03T02:10:00.000Z') });

		await runDemoActivity({ now: RUN_NOW, random: () => 0 });
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await stopDatabase(mongoServer);
	});

	it('should give a sign-up within its first week persona followers', async () => {
		const stored = await UserModel.findById(signUp._id).lean();

		expect(stored.followers.length).toBeGreaterThanOrEqual(1);
		expect(stringIds(stored.followers).every((id) => stringIds(personaIds).includes(id))).toBe(true);
	});

	it('should add the sign-up to the following of those personas as well', async () => {
		const stored = await UserModel.findById(signUp._id).lean();
		const followers = await UserModel.find({ _id: { $in: stored.followers } }).lean();

		expect(followers.every((follower) => stringIds(follower.following).includes(String(signUp._id)))).toBe(true);
	});

	it('should leave a sign-up older than a week alone', async () => {
		expect((await UserModel.findById(oldSignUp._id).lean()).followers).toEqual([]);
	});

	it('should leave a demo visitor alone', async () => {
		expect((await UserModel.findById(visitor._id).lean()).followers).toEqual([]);
	});
});
