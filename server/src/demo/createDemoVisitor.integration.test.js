const bcrypt = require('bcrypt');

const { cloudinary } = require('../config/cloudinary');
const CommentModel = require('../models/commentModel');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const AppError = require('../utils/AppError');
const config = require('./demoConfig');
const { createDemoVisitor } = require('./createDemoVisitor');
const { loadVisitorData } = require('./loadDemoData');
const { createRandom } = require('./random');
const { runReaction, scheduleReactions } = require('./reactionDelivery');
const { createUsernameCandidate } = require('./visitorPlanning');
const { loadFixture, startDatabase, stopDatabase, seedDatabase } = require('./demoTestSupport');

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

jest.mock('./visitorPlanning', () => {
	const actual = jest.requireActual('./visitorPlanning');

	return { ...actual, createUsernameCandidate: jest.fn(actual.createUsernameCandidate) };
});

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 120 * 1000;
const SEED_NOW = new Date('2026-11-03T08:00:00.000Z');
const NOW = new Date('2026-11-03T12:00:00.000Z');
const COPY_FOLDER = 'demo-users/visitor-post-copies';
const AVATAR_PREFIX = 'demo-users/visitor-avatars/';
const POST_POOL_PREFIX = 'demo-users/visitor-posts/';
const GENERIC_COMMENTS = Array.from({ length: 30 }, (value, index) => `Generic comment ${index + 1}`);
const ACTUAL_CREATE_USERNAME_CANDIDATE = jest.requireActual('./visitorPlanning').createUsernameCandidate;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIFTEEN_SECONDS_MS = 15 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

const fixture = loadFixture();

const buildVisitorData = ({ postCount = 31, avatarCount = 20 } = {}) => ({
	postPhotos: Array.from({ length: postCount }, (value, index) => ({
		source: `visitor-posts/group/${index + 1}.jpg`,
		imageIdentifier: `${POST_POOL_PREFIX}group/${index + 1}`,
		imageUrl: `https://cdn.example.com/${POST_POOL_PREFIX}group/${index + 1}.jpg`,
		imageWidth: 800,
		imageHeight: 600,
	})),
	avatarPhotos: Array.from({ length: avatarCount }, (value, index) => ({
		source: `visitor-avatars/group/${index + 1}.jpg`,
		imageIdentifier: `${AVATAR_PREFIX}avatar-${index + 1}`,
		imageUrl: `https://cdn.example.com/${AVATAR_PREFIX}avatar-${index + 1}.jpg`,
		imageWidth: 400,
		imageHeight: 400,
	})),
	genericComments: GENERIC_COMMENTS,
});

const installUploadMock = () => {
	let uploads = 0;

	cloudinary.uploader.upload.mockReset();
	cloudinary.uploader.upload.mockImplementation(async () => {
		uploads += 1;

		return {
			public_id: `${COPY_FOLDER}/copy-${uploads}`,
			secure_url: `https://cdn.example.com/${COPY_FOLDER}/copy-${uploads}.jpg`,
			width: 800,
			height: 600,
		};
	});
};

const resetMocks = () => {
	installUploadMock();
	cloudinary.uploader.destroy.mockReset();
	cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });
	scheduleReactions.mockReset();
	loadVisitorData.mockReset();
	loadVisitorData.mockResolvedValue(buildVisitorData());
	createUsernameCandidate.mockReset();
	createUsernameCandidate.mockImplementation(ACTUAL_CREATE_USERNAME_CANDIDATE);
};

const stringIds = (values) => values.map(String);

const personaIdsInDatabase = async () => stringIds((await DemoAccountStateModel.find().select({ userId: 1 }).lean()).map((state) => state.userId));

const countVisitors = () => UserModel.countDocuments({ accountType: 'demo' });

describe('createDemoVisitor against a real database', () => {
	let mongoServer;

	beforeAll(async () => {
		mongoServer = await startDatabase();
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await stopDatabase(mongoServer);
	});

	describe('a created visitor', () => {
		let visitor;
		let storedVisitor;
		let personaIds;
		let posts;
		let comments;
		let events;

		beforeAll(async () => {
			await seedDatabase(fixture, SEED_NOW);
			resetMocks();

			personaIds = await personaIdsInDatabase();
			visitor = await createDemoVisitor({ now: NOW, random: createRandom(1) });
			storedVisitor = await UserModel.findById(visitor._id).lean();
			posts = await UserPostModel.find({ userId: visitor._id }).lean();
			comments = await CommentModel.find({ userPostId: { $in: posts.map((post) => post._id) } }).lean();
			events = scheduleReactions.mock.calls[0][0];
		});

		describe('the account', () => {
			it('should be of the demo type', () => {
				expect(storedVisitor.accountType).toBe('demo');
			});

			it('should have a username made of a first name, _demo_ and a number from 1 to 99', () => {
				const [firstName, number] = storedVisitor.username.split('_demo_');

				expect(config.VISITOR_FIRST_NAMES).toContain(firstName);
				expect(Number(number)).toBeGreaterThanOrEqual(1);
				expect(Number(number)).toBeLessThanOrEqual(99);
			});

			it('should have the email <username>@visitor.demo.invalid', () => {
				expect(storedVisitor.email).toBe(`${storedVisitor.username}@visitor.demo.invalid`);
			});

			it('should have a hashed password, never a plain one', () => {
				expect(storedVisitor.password).toMatch(/^\$2[aby]\$/);
			});

			it('should have a password that is not derived from the username', async () => {
				expect(await bcrypt.compare(storedVisitor.username, storedVisitor.password)).toBe(false);
			});

			it('should return the created user', () => {
				expect(String(visitor._id)).toBe(String(storedVisitor._id));
				expect(visitor.accountType).toBe('demo');
			});
		});

		describe('the avatar', () => {
			it('should be one of the photos in the shared avatar pool', () => {
				expect(storedVisitor.profilePicture.imageIdentifier).toMatch(new RegExp(`^${AVATAR_PREFIX}avatar-\\d+$`));
			});

			it('should carry both the image url and the identifier', () => {
				expect(storedVisitor.profilePicture.imageUrl).toContain(storedVisitor.profilePicture.imageIdentifier);
			});

			it('should not be uploaded again: the shared photo is used as it is', () => {
				const uploadedUrls = cloudinary.uploader.upload.mock.calls.map(([url]) => url);

				expect(uploadedUrls.some((url) => url.includes(AVATAR_PREFIX))).toBe(false);
			});
		});

		describe('the people the visitor follows', () => {
			it('should be 40 personas', () => {
				expect(storedVisitor.following).toHaveLength(40);
				expect(stringIds(storedVisitor.following).every((id) => personaIds.includes(id))).toBe(true);
			});

			it('should follow each of them once', () => {
				expect(new Set(stringIds(storedVisitor.following)).size).toBe(40);
			});

			it('should follow mostly creators', async () => {
				const states = await DemoAccountStateModel.find({ userId: { $in: storedVisitor.following } }).lean();

				expect(states.filter((state) => state.tier === 'creator').length).toBeGreaterThan(20);
			});

			it('should appear in the followers of every persona followed', async () => {
				const followedPersonas = await UserModel.find({ _id: { $in: storedVisitor.following } }).lean();

				expect(followedPersonas.every((persona) => stringIds(persona.followers).includes(String(visitor._id)))).toBe(true);
			});

			it('should not appear in the followers of the personas not followed', async () => {
				const followed = new Set(stringIds(storedVisitor.following));
				const otherIds = personaIds.filter((id) => !followed.has(id));
				const others = await UserModel.find({ _id: { $in: otherIds } }).lean();

				expect(others.some((persona) => stringIds(persona.followers).includes(String(visitor._id)))).toBe(false);
			});
		});

		describe('the personas that follow back', () => {
			it('should be 15 to 30 of the personas the visitor follows', () => {
				expect(storedVisitor.followers.length).toBeGreaterThanOrEqual(15);
				expect(storedVisitor.followers.length).toBeLessThanOrEqual(30);

				const followed = stringIds(storedVisitor.following);

				expect(stringIds(storedVisitor.followers).every((id) => followed.includes(id))).toBe(true);
			});

			it('should list the visitor in their following', async () => {
				const followBacks = await UserModel.find({ _id: { $in: storedVisitor.followers } }).lean();

				expect(followBacks.every((persona) => stringIds(persona.following).includes(String(visitor._id)))).toBe(true);
			});

			it('should leave the visitor out of the following of the personas that do not follow back', async () => {
				const followBacks = new Set(stringIds(storedVisitor.followers));
				const notFollowingBack = stringIds(storedVisitor.following).filter((id) => !followBacks.has(id));
				const personas = await UserModel.find({ _id: { $in: notFollowingBack } }).lean();

				expect(personas.some((persona) => stringIds(persona.following).includes(String(visitor._id)))).toBe(false);
			});
		});

		describe('the starter posts', () => {
			it('should number 2 or 3', () => {
				expect(posts.length).toBeGreaterThanOrEqual(2);
				expect(posts.length).toBeLessThanOrEqual(3);
			});

			it('should be listed on the profile of the visitor', () => {
				expect(stringIds(storedVisitor.posts).sort()).toEqual(stringIds(posts.map((post) => post._id)).sort());
			});

			it('should be dated 7 to 35 days before now', () => {
				posts.forEach((post) => {
					const ageDays = (NOW.getTime() - post.createdAt.getTime()) / config.DAY_MS;

					expect(ageDays).toBeGreaterThanOrEqual(7);
					expect(ageDays).toBeLessThanOrEqual(35);
				});
			});

			it('should set updatedAt equal to createdAt', () => {
				posts.forEach((post) => expect(post.updatedAt.getTime()).toBe(post.createdAt.getTime()));
			});

			it('should have 5 to 10 likes each', () => {
				posts.forEach((post) => {
					expect(post.likes.length).toBeGreaterThanOrEqual(5);
					expect(post.likes.length).toBeLessThanOrEqual(10);
				});
			});

			it('should be liked by personas only, never by the visitor', () => {
				posts.forEach((post) => {
					expect(stringIds(post.likes).every((id) => personaIds.includes(id))).toBe(true);
					expect(stringIds(post.likes)).not.toContain(String(visitor._id));
				});
			});

			it('should have 0 or 1 comments each, matching the stored comment count', () => {
				posts.forEach((post) => {
					const postComments = comments.filter((comment) => String(comment.userPostId) === String(post._id));

					expect(postComments.length).toBeLessThanOrEqual(1);
					expect(post.commentsCount).toBe(postComments.length);
				});
			});

			it('should have comments from personas using the generic comment bank', () => {
				comments.forEach((comment) => {
					expect(personaIds).toContain(String(comment.userId));
					expect(GENERIC_COMMENTS).toContain(comment.text);
				});
			});

			it('should have comments dated between the post and now', () => {
				comments.forEach((comment) => {
					const post = posts.find((candidate) => String(candidate._id) === String(comment.userPostId));

					expect(comment.createdAt.getTime()).toBeGreaterThanOrEqual(post.createdAt.getTime());
					expect(comment.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
				});
			});
		});

		describe('the photos of the starter posts', () => {
			it('should be copied to Cloudinary once per post', () => {
				expect(cloudinary.uploader.upload).toHaveBeenCalledTimes(posts.length);
			});

			it('should be copied from the shared visitor-posts library into the visitor-post-copies asset folder', () => {
				cloudinary.uploader.upload.mock.calls.forEach(([url, options]) => {
					expect(url).toContain(POST_POOL_PREFIX);
					expect(options).toEqual({ resource_type: 'image', asset_folder: COPY_FOLDER });
				});
			});

			it('should point each post at its own copy, never at the shared photo', () => {
				posts.forEach((post) => {
					expect(post.imageIdentifier.startsWith(`${COPY_FOLDER}/`)).toBe(true);
					expect(post.imageUrl).toContain(COPY_FOLDER);
					expect(post.imageIdentifier.startsWith(POST_POOL_PREFIX)).toBe(false);
				});
			});

			it('should use a different photo for each post', () => {
				const sources = cloudinary.uploader.upload.mock.calls.map(([url]) => url);

				expect(new Set(sources).size).toBe(sources.length);
			});

			it('should store the size reported for the copy', () => {
				posts.forEach((post) => {
					expect(post.imageWidth).toBe(800);
					expect(post.imageHeight).toBe(600);
				});
			});

			it('should not delete anything from Cloudinary on success', () => {
				expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
			});
		});

		describe('the reactions in the first minutes', () => {
			it('should be handed over to be delivered once', () => {
				expect(scheduleReactions).toHaveBeenCalledTimes(1);
			});

			it('should add 1 to 5 likes, 0 to 2 comments and 1 to 3 followers', () => {
				const count = (type) => events.filter((event) => event.type === type).length;

				expect(count('postLike')).toBeGreaterThanOrEqual(1);
				expect(count('postLike')).toBeLessThanOrEqual(5);
				expect(count('comment')).toBeLessThanOrEqual(2);
				expect(count('follow')).toBeGreaterThanOrEqual(1);
				expect(count('follow')).toBeLessThanOrEqual(3);
			});

			it('should be due within the first 10 minutes, not all at once', () => {
				const times = events.map((event) => event.dueAt.getTime());

				times.forEach((time) => {
					expect(time).toBeGreaterThanOrEqual(NOW.getTime() + FIFTEEN_SECONDS_MS);
					expect(time).toBeLessThanOrEqual(NOW.getTime() + TEN_MINUTES_MS);
				});
				expect(new Set(times).size).toBe(times.length);
			});

			it('should react to the starter posts of this visitor only', () => {
				const postIds = stringIds(posts.map((post) => post._id));

				events.filter((event) => event.type !== 'follow').forEach((event) => expect(postIds).toContain(String(event.userPostId)));
			});

			it('should leave the visitor with more likes, comments and followers once delivered', async () => {
				const followersBefore = (await UserModel.findById(visitor._id).lean()).followers.length;
				const likesBefore = (await UserPostModel.find({ userId: visitor._id }).lean()).reduce((sum, post) => sum + post.likes.length, 0);
				const commentsBefore = await CommentModel.countDocuments({ userPostId: { $in: posts.map((post) => post._id) } });

				for (const event of events) {
					await runReaction(event);
				}

				const followersAfter = (await UserModel.findById(visitor._id).lean()).followers.length;
				const likesAfter = (await UserPostModel.find({ userId: visitor._id }).lean()).reduce((sum, post) => sum + post.likes.length, 0);
				const commentsAfter = await CommentModel.countDocuments({ userPostId: { $in: posts.map((post) => post._id) } });

				expect(followersAfter - followersBefore).toBe(events.filter((event) => event.type === 'follow').length);
				expect(likesAfter - likesBefore).toBe(events.filter((event) => event.type === 'postLike').length);
				expect(commentsAfter - commentsBefore).toBe(events.filter((event) => event.type === 'comment').length);
			});
		});
	});

	describe('two visitors', () => {
		let first;
		let second;
		let firstPosts;
		let secondPosts;

		beforeAll(async () => {
			await seedDatabase(fixture, SEED_NOW);
			resetMocks();

			first = await createDemoVisitor({ now: NOW, random: createRandom(1) });
			second = await createDemoVisitor({ now: NOW, random: createRandom(2) });
			firstPosts = await UserPostModel.find({ userId: first._id }).lean();
			secondPosts = await UserPostModel.find({ userId: second._id }).lean();
		});

		it('should be two different accounts', () => {
			expect(String(first._id)).not.toBe(String(second._id));
			expect(first.username).not.toBe(second.username);
			expect(first.email).not.toBe(second.email);
		});

		it('should each have their own password', () => {
			expect(first.password).not.toBe(second.password);
		});

		it('should each have their own copies of the photos, with no copy shared', () => {
			const firstCopies = firstPosts.map((post) => post.imageIdentifier);
			const secondCopies = secondPosts.map((post) => post.imageIdentifier);

			expect(firstCopies.filter((identifier) => secondCopies.includes(identifier))).toEqual([]);
		});

		it('should both exist in the database', async () => {
			expect(await countVisitors()).toBe(2);
		});

		it('should keep the posts of one visitor out of the other', () => {
			expect(firstPosts.every((post) => String(post.userId) === String(first._id))).toBe(true);
			expect(secondPosts.every((post) => String(post.userId) === String(second._id))).toBe(true);
		});
	});

	describe('choosing a username', () => {
		beforeEach(async () => {
			await seedDatabase(fixture, SEED_NOW);
			resetMocks();
		});

		it('should try another username when the first one is taken', async () => {
			await UserModel.create({ email: 'taken@example.com', username: 'john_demo_2', password: 'hashed-password' });
			createUsernameCandidate.mockReturnValueOnce('john_demo_2').mockReturnValueOnce('john_demo_2').mockReturnValueOnce('mary_demo_5');

			const visitor = await createDemoVisitor({ now: NOW, random: createRandom(1) });

			expect(visitor.username).toBe('mary_demo_5');
			expect(visitor.email).toBe('mary_demo_5@visitor.demo.invalid');
		});

		it('should try another username when another visitor already has it', async () => {
			createUsernameCandidate.mockReturnValueOnce('john_demo_2');
			await createDemoVisitor({ now: NOW, random: createRandom(1) });

			createUsernameCandidate.mockReturnValueOnce('john_demo_2').mockReturnValueOnce('emma_demo_9');

			const second = await createDemoVisitor({ now: NOW, random: createRandom(2) });

			expect(second.username).toBe('emma_demo_9');
		});

		it('should give up with a 503 when every username it tries is taken', async () => {
			await UserModel.create({ email: 'taken@example.com', username: 'john_demo_2', password: 'hashed-password' });
			createUsernameCandidate.mockReturnValue('john_demo_2');

			const error = await createDemoVisitor({ now: NOW, random: createRandom(1) }).catch((rejection) => rejection);

			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(503);
			expect(createUsernameCandidate).toHaveBeenCalledTimes(config.VISITOR_USERNAME_ATTEMPTS);
		});

		it('should leave nothing behind when it gives up', async () => {
			await UserModel.create({ email: 'taken@example.com', username: 'john_demo_2', password: 'hashed-password' });
			createUsernameCandidate.mockReturnValue('john_demo_2');

			await createDemoVisitor({ now: NOW, random: createRandom(1) }).catch(() => null);

			expect(await countVisitors()).toBe(0);
			expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
			expect(scheduleReactions).not.toHaveBeenCalled();
		});

		it('should not retry when the failure is not a taken username', async () => {
			const createSpy = jest.spyOn(UserModel, 'create').mockRejectedValueOnce(new Error('database down'));

			await expect(createDemoVisitor({ now: NOW, random: createRandom(1) })).rejects.toThrow('database down');
			expect(createSpy).toHaveBeenCalledTimes(1);

			createSpy.mockRestore();
		});
	});

	describe('when something fails while filling the account', () => {
		let personasBefore;

		const snapshotPersonas = async () =>
			(await UserModel.find({ accountType: 'persona' }).sort({ _id: 1 }).lean()).map((user) => JSON.stringify(user));

		beforeEach(async () => {
			await seedDatabase(fixture, SEED_NOW);
			resetMocks();

			personasBefore = await snapshotPersonas();
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it('should remove the half-created visitor when a photo cannot be copied', async () => {
			let calls = 0;

			cloudinary.uploader.upload.mockImplementation(async () => {
				calls += 1;

				if (calls === 2) {
					throw new Error('Cloudinary rejected the copy');
				}

				return {
					public_id: `${COPY_FOLDER}/copy-${calls}`,
					secure_url: `https://cdn.example.com/${COPY_FOLDER}/copy-${calls}.jpg`,
					width: 800,
					height: 600,
				};
			});

			await expect(createDemoVisitor({ now: NOW, random: createRandom(1) })).rejects.toThrow('Cloudinary rejected the copy');

			expect(await countVisitors()).toBe(0);
		});

		it('should delete the copies that were made before the failing one', async () => {
			let calls = 0;

			cloudinary.uploader.upload.mockImplementation(async () => {
				calls += 1;

				if (calls === 2) {
					throw new Error('Cloudinary rejected the copy');
				}

				return {
					public_id: `${COPY_FOLDER}/copy-${calls}`,
					secure_url: `https://cdn.example.com/${COPY_FOLDER}/copy-${calls}.jpg`,
					width: 800,
					height: 600,
				};
			});

			await createDemoVisitor({ now: NOW, random: createRandom(1) }).catch(() => null);

			expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(`${COPY_FOLDER}/copy-1`, { invalidate: true });
		});

		it('should never delete the shared avatar of the removed visitor', async () => {
			cloudinary.uploader.upload.mockRejectedValue(new Error('Cloudinary is down'));

			await createDemoVisitor({ now: NOW, random: createRandom(1) }).catch(() => null);

			const destroyed = cloudinary.uploader.destroy.mock.calls.map(([identifier]) => identifier);

			expect(destroyed.some((identifier) => identifier.startsWith(AVATAR_PREFIX))).toBe(false);
		});

		it('should take the visitor back out of the follow lists of the personas', async () => {
			cloudinary.uploader.upload.mockRejectedValue(new Error('Cloudinary is down'));

			await createDemoVisitor({ now: NOW, random: createRandom(1) }).catch(() => null);

			expect(await snapshotPersonas()).toEqual(personasBefore);
		});

		it('should not schedule any reaction', async () => {
			cloudinary.uploader.upload.mockRejectedValue(new Error('Cloudinary is down'));

			await createDemoVisitor({ now: NOW, random: createRandom(1) }).catch(() => null);

			expect(scheduleReactions).not.toHaveBeenCalled();
		});

		it('should delete every copy and remove the visitor when a post cannot be saved', async () => {
			jest.spyOn(UserPostModel, 'create').mockRejectedValueOnce(new Error('write failed'));

			await expect(createDemoVisitor({ now: NOW, random: createRandom(1) })).rejects.toThrow('write failed');

			const destroyed = cloudinary.uploader.destroy.mock.calls.map(([identifier]) => identifier);
			const copied = cloudinary.uploader.upload.mock.calls.length;

			expect(destroyed.filter((identifier) => identifier.startsWith(`${COPY_FOLDER}/`))).toHaveLength(copied);
			expect(await countVisitors()).toBe(0);
			expect(await UserPostModel.countDocuments({ userId: { $exists: true }, imageIdentifier: { $regex: `^${COPY_FOLDER}` } })).toBe(0);
		});

		it('should not create a visitor when the photo library cannot be read', async () => {
			loadVisitorData.mockRejectedValue(new Error('photos.json is missing'));

			await expect(createDemoVisitor({ now: NOW, random: createRandom(1) })).rejects.toThrow('photos.json is missing');

			expect(await countVisitors()).toBe(0);
		});
	});

	describe('when the libraries or the personas are thin', () => {
		beforeEach(async () => {
			await seedDatabase(fixture, SEED_NOW);
			resetMocks();
		});

		it('should create a visitor without an avatar when the avatar library is empty', async () => {
			loadVisitorData.mockResolvedValue(buildVisitorData({ avatarCount: 0 }));

			const visitor = await createDemoVisitor({ now: NOW, random: createRandom(1) });
			const stored = await UserModel.findById(visitor._id).lean();

			expect(stored.profilePicture).toBeUndefined();
		});

		it('should create a visitor without posts when the post library is empty', async () => {
			loadVisitorData.mockResolvedValue(buildVisitorData({ postCount: 0 }));

			const visitor = await createDemoVisitor({ now: NOW, random: createRandom(1) });

			expect(await UserPostModel.countDocuments({ userId: visitor._id })).toBe(0);
			expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
		});

		it('should create only as many posts as there are photos in the library', async () => {
			loadVisitorData.mockResolvedValue(buildVisitorData({ postCount: 1 }));

			const visitor = await createDemoVisitor({ now: NOW, random: createRandom(1) });

			expect(await UserPostModel.countDocuments({ userId: visitor._id })).toBe(1);
		});

		it('should create a visitor that follows nobody when there are no personas', async () => {
			await DemoAccountStateModel.deleteMany({});

			const visitor = await createDemoVisitor({ now: NOW, random: createRandom(1) });
			const stored = await UserModel.findById(visitor._id).lean();

			expect(stored.following).toEqual([]);
			expect(stored.followers).toEqual([]);
		});

		it('should follow every persona when there are fewer than 40', async () => {
			const states = await DemoAccountStateModel.find().lean();

			await DemoAccountStateModel.deleteMany({ userId: { $nin: states.slice(0, 12).map((state) => state.userId) } });

			const visitor = await createDemoVisitor({ now: NOW, random: createRandom(1) });
			const stored = await UserModel.findById(visitor._id).lean();

			expect(stored.following).toHaveLength(12);
		});
	});

	describe('the capacity of the demo', () => {
		const MAX = config.VISITOR_MAX_ACCOUNTS;

		const addVisitors = (count, prefix = 'filler') =>
			UserModel.insertMany(
				Array.from({ length: count }, (value, index) => ({
					email: `${prefix}${index}_demo_1@visitor.demo.invalid`,
					username: `${prefix}${index}_demo_1`,
					password: 'hashed-password',
					accountType: 'demo',
				})),
			);

		beforeEach(async () => {
			await seedDatabase(fixture, SEED_NOW);
			resetMocks();
		});

		it('is 300 accounts', () => {
			expect(MAX).toBe(300);
		});

		it('refuses a new visitor with a 429 DEMO_UNAVAILABLE when 300 visitors are live', async () => {
			await addVisitors(MAX);

			const error = await createDemoVisitor({ now: NOW, random: createRandom(1) }).catch((rejection) => rejection);

			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(429);
			expect(error.code).toBe('DEMO_UNAVAILABLE');
		});

		it('still refuses when more than 300 visitors are live', async () => {
			await addVisitors(MAX + 5);

			await expect(createDemoVisitor({ now: NOW, random: createRandom(1) })).rejects.toMatchObject({
				statusCode: 429,
				code: 'DEMO_UNAVAILABLE',
			});
		});

		it('creates the 300th visitor when 299 are live', async () => {
			await addVisitors(MAX - 1);

			const visitor = await createDemoVisitor({ now: NOW, random: createRandom(1) });

			expect(visitor.accountType).toBe('demo');
			expect(await countVisitors()).toBe(MAX);
		});

		it('creates nothing, copies no photo and schedules no reaction when it refuses', async () => {
			await addVisitors(MAX);

			const personasBefore = await UserModel.find({ accountType: 'persona' }).sort({ _id: 1 }).lean();

			await createDemoVisitor({ now: NOW, random: createRandom(1) }).catch(() => null);

			expect(await countVisitors()).toBe(MAX);
			expect(await UserPostModel.countDocuments({ imageIdentifier: new RegExp(`^${COPY_FOLDER}`) })).toBe(0);
			expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
			expect(scheduleReactions).not.toHaveBeenCalled();
			expect(await UserModel.find({ accountType: 'persona' }).sort({ _id: 1 }).lean()).toEqual(personasBefore);
		});

		it('checks the capacity before reading the photo library', async () => {
			await addVisitors(MAX);

			await createDemoVisitor({ now: NOW, random: createRandom(1) }).catch(() => null);

			expect(loadVisitorData).not.toHaveBeenCalled();
		});

		it('does not count personas or regular users against the capacity', async () => {
			await addVisitors(MAX - 1);
			await UserModel.insertMany(
				Array.from({ length: 50 }, (value, index) => ({
					email: `regular${index}@example.com`,
					username: `regular${index}`,
					password: 'hashed-password',
					accountType: 'user',
				})),
			);

			await expect(createDemoVisitor({ now: NOW, random: createRandom(1) })).resolves.toMatchObject({ accountType: 'demo' });
		});

		it('has room again once a visitor is removed', async () => {
			await addVisitors(MAX);

			await UserModel.deleteOne({ accountType: 'demo' });

			await expect(createDemoVisitor({ now: NOW, random: createRandom(1) })).resolves.toMatchObject({ accountType: 'demo' });
		});

		it('keys on the account type: users with a visitor-looking email do not use up the capacity', async () => {
			await UserModel.insertMany(
				Array.from({ length: MAX }, (value, index) => ({
					email: `lookalike${index}@visitor.demo.invalid`,
					username: `lookalike${index}`,
					password: 'hashed-password',
					accountType: 'user',
				})),
			);

			await expect(createDemoVisitor({ now: NOW, random: createRandom(1) })).resolves.toMatchObject({ accountType: 'demo' });
		});
	});

	describe('keying on the account type', () => {
		it('should not count a regular user whose email looks like a visitor email as a visitor', async () => {
			await seedDatabase(fixture, SEED_NOW);
			resetMocks();

			await UserModel.create({
				email: 'lookalike@visitor.demo.invalid',
				username: 'lookalike',
				password: 'hashed-password',
				accountType: 'user',
			});

			const visitor = await createDemoVisitor({ now: NOW, random: createRandom(1) });

			expect(await countVisitors()).toBe(1);
			expect(String((await UserModel.findOne({ accountType: 'demo' }))._id)).toBe(String(visitor._id));
		});
	});
});
