const mongoose = require('mongoose');

const { cloudinary } = require('../config/cloudinary');
const CommentModel = require('../models/commentModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const StoryModel = require('../models/storyModel');
const StoryViewModel = require('../models/storyViewModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const config = require('./demoConfig');
const { runDemoActivity } = require('./demoActivity');
const { removeExpiredVisitors } = require('./removeExpiredVisitors');
const { removeUsersWithContent } = require('./removeUsersWithContent');
const { startDatabase, stopDatabase } = require('./demoTestSupport');

jest.mock('../config/cloudinary', () => ({
	cloudinary: { uploader: { upload: jest.fn(), destroy: jest.fn() } },
	isConfigured: jest.fn(() => true),
	getUploadFolder: jest.fn(() => 'user-images'),
}));

jest.mock('./removeUsersWithContent', () => {
	const actual = jest.requireActual('./removeUsersWithContent');

	return { removeUsersWithContent: jest.fn(actual.removeUsersWithContent) };
});

jest.mock('./loadDemoData', () => ({
	loadDemoData: jest.fn(),
	loadVisitorData: jest.fn(),
	loadGenericComments: jest.fn(),
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 60 * 1000;
const NOW = new Date('2026-11-03T12:00:00.000Z');
const HOUR_MS = config.HOUR_MS;
const SHARED_AVATAR = 'demo-users/visitor-avatars/avatar-3';

jest.setTimeout(TEST_TIMEOUT_MS);

const TIMESTAMP_HEX_LENGTH = 8;

const objectIdAt = (date) => {
	const timestampHex = Math.floor(date.getTime() / 1000)
		.toString(16)
		.padStart(TIMESTAMP_HEX_LENGTH, '0');

	return new mongoose.Types.ObjectId(timestampHex + new mongoose.Types.ObjectId().toHexString().slice(TIMESTAMP_HEX_LENGTH));
};

const hoursBeforeNow = (hours) => new Date(NOW.getTime() - hours * HOUR_MS);

const createUserAt = (username, createdAt, extra = {}) =>
	UserModel.create({
		_id: objectIdAt(createdAt),
		email: `${username}@example.com`,
		username,
		password: 'hashed-password',
		...extra,
	});

const createPost = (author, identifier, extra = {}) =>
	UserPostModel.create({
		imageIdentifier: identifier,
		imageUrl: `https://cdn.example.com/${identifier}.jpg`,
		imageWidth: 100,
		imageHeight: 100,
		userId: author._id,
		...extra,
	});

const createStory = (author, identifier) =>
	StoryModel.create({
		imageIdentifier: identifier,
		imageUrl: `https://cdn.example.com/${identifier}.jpg`,
		imageWidth: 100,
		imageHeight: 100,
		userId: author._id,
	});

const link = async (follower, followee) => {
	await UserModel.updateOne({ _id: follower._id }, { $addToSet: { following: followee._id } });
	await UserModel.updateOne({ _id: followee._id }, { $addToSet: { followers: follower._id } });
};

const destroyedIdentifiers = () => cloudinary.uploader.destroy.mock.calls.map(([identifier]) => identifier);

const clearDatabase = () =>
	Promise.all([
		UserModel.deleteMany({}),
		UserPostModel.deleteMany({}),
		CommentModel.deleteMany({}),
		StoryModel.deleteMany({}),
		StoryViewModel.deleteMany({}),
		DemoScheduledEventModel.deleteMany({}),
		DemoActivityRunModel.deleteMany({}),
	]);

describe('removeExpiredVisitors against a real database', () => {
	let mongoServer;

	beforeAll(async () => {
		mongoServer = await startDatabase();
		await Promise.all([StoryViewModel.init(), DemoActivityRunModel.init()]);
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await stopDatabase(mongoServer);
	});

	beforeEach(async () => {
		jest.spyOn(console, 'error').mockImplementation(() => {});
		removeUsersWithContent.mockClear();
		cloudinary.uploader.destroy.mockReset();
		cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });
		await clearDatabase();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('which accounts it removes', () => {
		it('should remove a visitor older than 24 hours', async () => {
			const visitor = await createUserAt('old_demo_1', hoursBeforeNow(25), { accountType: 'demo' });

			await removeExpiredVisitors(NOW);

			expect(await UserModel.findById(visitor._id)).toBeNull();
		});

		it('should keep a visitor younger than 24 hours', async () => {
			const visitor = await createUserAt('new_demo_1', hoursBeforeNow(1), { accountType: 'demo' });

			await removeExpiredVisitors(NOW);

			expect(await UserModel.findById(visitor._id)).not.toBeNull();
		});

		it('should keep a visitor that is just under 24 hours old', async () => {
			const visitor = await createUserAt('almost_demo_1', new Date(NOW.getTime() - 24 * HOUR_MS + 60 * 1000), { accountType: 'demo' });

			await removeExpiredVisitors(NOW);

			expect(await UserModel.findById(visitor._id)).not.toBeNull();
		});

		it('should remove a visitor that is just over 24 hours old', async () => {
			const visitor = await createUserAt('over_demo_1', new Date(NOW.getTime() - 24 * HOUR_MS - 60 * 1000), { accountType: 'demo' });

			await removeExpiredVisitors(NOW);

			expect(await UserModel.findById(visitor._id)).toBeNull();
		});

		it('should return how many visitors it removed', async () => {
			await createUserAt('old_demo_1', hoursBeforeNow(30), { accountType: 'demo' });
			await createUserAt('old_demo_2', hoursBeforeNow(48), { accountType: 'demo' });
			await createUserAt('new_demo_1', hoursBeforeNow(2), { accountType: 'demo' });

			expect(await removeExpiredVisitors(NOW)).toBe(2);
		});

		it('should return 0 and change nothing when no visitor has expired', async () => {
			await createUserAt('new_demo_1', hoursBeforeNow(2), { accountType: 'demo' });

			expect(await removeExpiredVisitors(NOW)).toBe(0);
			expect(await UserModel.countDocuments()).toBe(1);
			expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
		});

		it('should return 0 when there are no visitors at all', async () => {
			expect(await removeExpiredVisitors(NOW)).toBe(0);
		});

		it('should never remove a regular user, however old', async () => {
			const user = await createUserAt('regular', hoursBeforeNow(24 * 400), { accountType: 'user' });

			await removeExpiredVisitors(NOW);

			expect(await UserModel.findById(user._id)).not.toBeNull();
		});

		it('should never remove a persona, however old', async () => {
			const persona = await createUserAt('persona', hoursBeforeNow(24 * 400), { accountType: 'persona' });

			await removeExpiredVisitors(NOW);

			expect(await UserModel.findById(persona._id)).not.toBeNull();
		});

		it('should never remove an old account whose email looks like a visitor email but is not of the demo type', async () => {
			const lookalike = await UserModel.create({
				_id: objectIdAt(hoursBeforeNow(100)),
				email: 'someone@visitor.demo.invalid',
				username: 'lookalike',
				password: 'hashed-password',
				accountType: 'user',
			});

			await removeExpiredVisitors(NOW);

			expect(await UserModel.findById(lookalike._id)).not.toBeNull();
		});

		it('should remove an old demo account whatever its email looks like', async () => {
			const visitor = await createUserAt('plain_email', hoursBeforeNow(30), { accountType: 'demo' });

			await removeExpiredVisitors(NOW);

			expect(await UserModel.findById(visitor._id)).toBeNull();
		});

		it('should treat an account without an account type as a regular user', async () => {
			const user = await createUserAt('untyped', hoursBeforeNow(100));

			await removeExpiredVisitors(NOW);

			expect(await UserModel.findById(user._id)).not.toBeNull();
		});
	});

	describe('everything a removed visitor created', () => {
		let visitor;
		let persona;
		let regular;
		let personaPost;
		let regularPost;
		let visitorPost;
		let visitorPost2;
		let visitorComment;
		let replyToVisitor;
		let personaCommentOnRegularPost;
		let regularCommentOnVisitorPost;
		let personaStory;
		let visitorStory;
		let remainingVisitor;

		beforeEach(async () => {
			visitor = await createUserAt('old_demo_1', hoursBeforeNow(30), {
				accountType: 'demo',
				profilePicture: { imageUrl: `https://cdn.example.com/${SHARED_AVATAR}.jpg`, imageIdentifier: SHARED_AVATAR },
			});
			persona = await createUserAt('persona', hoursBeforeNow(24 * 60), { accountType: 'persona' });
			regular = await createUserAt('regular', hoursBeforeNow(24 * 60), { accountType: 'user' });
			remainingVisitor = await createUserAt('new_demo_1', hoursBeforeNow(1), { accountType: 'demo' });

			await link(visitor, persona);
			await link(persona, visitor);
			await link(visitor, regular);
			await link(regular, visitor);
			await link(remainingVisitor, visitor);

			personaPost = await createPost(persona, 'demo-users/persona-post');
			regularPost = await createPost(regular, 'user-images/regular-post', { commentsCount: 3, likes: [visitor._id, persona._id] });
			visitorPost = await createPost(visitor, 'demo-users/visitor-post-copies/copy-1', { likes: [persona._id, regular._id], commentsCount: 2 });
			visitorPost2 = await createPost(visitor, 'demo-users/visitor-post-copies/copy-2');

			await UserModel.updateOne({ _id: visitor._id }, { posts: [visitorPost._id, visitorPost2._id] });

			visitorComment = await CommentModel.create({
				userPostId: regularPost._id,
				userId: visitor._id,
				text: 'a comment by the visitor',
				likes: [persona._id],
			});
			replyToVisitor = await CommentModel.create({
				userPostId: regularPost._id,
				userId: regular._id,
				text: 'a reply to the visitor',
				parentCommentId: visitorComment._id,
				mentionedUserId: visitor._id,
			});
			personaCommentOnRegularPost = await CommentModel.create({
				userPostId: regularPost._id,
				userId: persona._id,
				text: 'a comment by a persona',
				likes: [visitor._id, regular._id],
				mentionedUserId: visitor._id,
			});
			regularCommentOnVisitorPost = await CommentModel.create({
				userPostId: visitorPost._id,
				userId: regular._id,
				text: 'on the visitor post',
			});
			await CommentModel.create({ userPostId: visitorPost._id, userId: persona._id, text: 'another on the visitor post' });
			await UserPostModel.updateOne({ _id: personaPost._id }, { likes: [visitor._id, regular._id] });

			personaStory = await createStory(persona, 'demo-users/story-copies/persona-story');
			visitorStory = await createStory(visitor, 'user-images/visitor-story');

			await StoryViewModel.create({ storyId: personaStory._id, viewerId: visitor._id });
			await StoryViewModel.create({ storyId: personaStory._id, viewerId: regular._id });
			await StoryViewModel.create({ storyId: visitorStory._id, viewerId: regular._id });

			await DemoScheduledEventModel.create({ dueAt: hoursBeforeNow(-5), type: 'postLike', userPostId: visitorPost._id, userId: persona._id });
			await DemoScheduledEventModel.create({ dueAt: hoursBeforeNow(-6), type: 'postLike', userPostId: regularPost._id, userId: visitor._id });
			await DemoScheduledEventModel.create({ dueAt: hoursBeforeNow(-7), type: 'postLike', userPostId: personaPost._id, userId: regular._id });

			await removeExpiredVisitors(NOW);
		});

		it('should remove the visitor', async () => {
			expect(await UserModel.findById(visitor._id)).toBeNull();
		});

		it('should remove their posts', async () => {
			expect(await UserPostModel.countDocuments({ _id: { $in: [visitorPost._id, visitorPost2._id] } })).toBe(0);
		});

		it('should remove the comments others left on their posts', async () => {
			expect(await CommentModel.countDocuments({ userPostId: visitorPost._id })).toBe(0);
			expect(await CommentModel.findById(regularCommentOnVisitorPost._id)).toBeNull();
		});

		it('should remove the comments they wrote on other posts', async () => {
			expect(await CommentModel.findById(visitorComment._id)).toBeNull();
		});

		it('should remove the replies others wrote to their comments', async () => {
			expect(await CommentModel.findById(replyToVisitor._id)).toBeNull();
		});

		it('should take the removed comments off the comment count of other posts', async () => {
			expect((await UserPostModel.findById(regularPost._id)).commentsCount).toBe(1);
		});

		it('should keep the comments of other people on other posts', async () => {
			expect(await CommentModel.findById(personaCommentOnRegularPost._id)).not.toBeNull();
		});

		it('should remove their likes from other posts', async () => {
			expect(stringIds((await UserPostModel.findById(regularPost._id)).likes)).toEqual([String(persona._id)]);
			expect(stringIds((await UserPostModel.findById(personaPost._id)).likes)).toEqual([String(regular._id)]);
		});

		it('should remove their likes from other comments', async () => {
			expect(stringIds((await CommentModel.findById(personaCommentOnRegularPost._id)).likes)).toEqual([String(regular._id)]);
		});

		it('should clear the mention of the visitor in other comments', async () => {
			expect((await CommentModel.findById(personaCommentOnRegularPost._id)).mentionedUserId).toBeNull();
		});

		it('should remove them from the followers and following of everyone else', async () => {
			const others = await UserModel.find({ _id: { $ne: visitor._id } }).lean();

			others.forEach((user) => {
				expect(stringIds(user.followers)).not.toContain(String(visitor._id));
				expect(stringIds(user.following)).not.toContain(String(visitor._id));
			});
		});

		it('should remove their stories', async () => {
			expect(await StoryModel.findById(visitorStory._id)).toBeNull();
		});

		it('should remove the views of their stories', async () => {
			expect(await StoryViewModel.countDocuments({ storyId: visitorStory._id })).toBe(0);
		});

		it('should remove the views they made on other stories', async () => {
			expect(await StoryViewModel.countDocuments({ viewerId: visitor._id })).toBe(0);
			expect(await StoryViewModel.countDocuments({ storyId: personaStory._id })).toBe(1);
		});

		it('should keep the stories of other people', async () => {
			expect(await StoryModel.findById(personaStory._id)).not.toBeNull();
		});

		it('should remove the scheduled events on their posts and by them', async () => {
			expect(await DemoScheduledEventModel.countDocuments({ userPostId: visitorPost._id })).toBe(0);
			expect(await DemoScheduledEventModel.countDocuments({ userId: visitor._id })).toBe(0);
		});

		it('should keep the scheduled events of other accounts', async () => {
			expect(await DemoScheduledEventModel.countDocuments({ userPostId: personaPost._id })).toBe(1);
		});

		it('should keep the posts of other accounts', async () => {
			expect(await UserPostModel.countDocuments({ _id: { $in: [personaPost._id, regularPost._id] } })).toBe(2);
		});

		it('should delete the photo copies of their posts from Cloudinary', () => {
			expect(destroyedIdentifiers()).toEqual(
				expect.arrayContaining(['demo-users/visitor-post-copies/copy-1', 'demo-users/visitor-post-copies/copy-2']),
			);
		});

		it('should delete their story images from Cloudinary', () => {
			expect(destroyedIdentifiers()).toContain('user-images/visitor-story');
		});

		it('should never delete the shared avatar from Cloudinary', () => {
			expect(destroyedIdentifiers()).not.toContain(SHARED_AVATAR);
		});

		it('should delete nothing that belongs to other accounts', () => {
			expect(destroyedIdentifiers().sort()).toEqual(
				['demo-users/visitor-post-copies/copy-1', 'demo-users/visitor-post-copies/copy-2', 'user-images/visitor-story'].sort(),
			);
		});

		it('should keep the visitor that has not expired', async () => {
			expect(await UserModel.findById(remainingVisitor._id)).not.toBeNull();
		});

		it('should drop the expired visitor from the following of the visitor that remains', async () => {
			expect(stringIds((await UserModel.findById(remainingVisitor._id)).following)).toEqual([]);
		});
	});

	describe('a profile picture the visitor uploaded themself', () => {
		it('should be deleted from Cloudinary', async () => {
			await createUserAt('old_demo_1', hoursBeforeNow(30), {
				accountType: 'demo',
				profilePicture: { imageUrl: 'https://cdn.example.com/own.jpg', imageIdentifier: 'user-images/own-picture' },
			});

			await removeExpiredVisitors(NOW);

			expect(destroyedIdentifiers()).toEqual(['user-images/own-picture']);
		});
	});

	describe('when removing one visitor fails', () => {
		it('should still remove the other expired visitors', async () => {
			const failing = await createUserAt('failing_demo_1', hoursBeforeNow(30), { accountType: 'demo' });
			const fine = await createUserAt('fine_demo_1', hoursBeforeNow(31), { accountType: 'demo' });

			await createPost(failing, 'user-images/failing-post');
			cloudinary.uploader.destroy.mockImplementation(async (identifier) => {
				if (identifier === 'user-images/failing-post') {
					throw new Error('Cloudinary is down');
				}

				return { result: 'ok' };
			});

			const removed = await removeExpiredVisitors(NOW);

			expect(removed).toBe(1);
			expect(await UserModel.findById(fine._id)).toBeNull();
			expect(await UserModel.findById(failing._id)).not.toBeNull();
		});

		it('should log the failure instead of throwing', async () => {
			const failing = await createUserAt('failing_demo_1', hoursBeforeNow(30), { accountType: 'demo' });

			await createPost(failing, 'user-images/failing-post');
			cloudinary.uploader.destroy.mockRejectedValue(new Error('Cloudinary is down'));

			await expect(removeExpiredVisitors(NOW)).resolves.toBe(0);
			expect(console.error).toHaveBeenCalledWith(expect.stringContaining(String(failing._id)), expect.any(Error));
		});
	});

	describe('removing every expired visitor in one batch', () => {
		const createExpired = async (count) => {
			const visitors = [];

			for (let index = 0; index < count; index += 1) {
				const visitor = await createUserAt(`batch_demo_${index}`, hoursBeforeNow(30 + index), { accountType: 'demo' });

				await createPost(visitor, `user-images/batch-post-${index}`);
				visitors.push(visitor);
			}

			return visitors;
		};

		it('removes all of them with a single call', async () => {
			const visitors = await createExpired(5);

			await removeExpiredVisitors(NOW);

			expect(removeUsersWithContent).toHaveBeenCalledTimes(1);
			expect(removeUsersWithContent.mock.calls[0][0].map(String).sort()).toEqual(visitors.map((visitor) => String(visitor._id)).sort());
			expect(removeUsersWithContent.mock.calls[0][1]).toEqual({ deleteUploadedImages: true });
		});

		it('returns how many it removed', async () => {
			await createExpired(5);

			expect(await removeExpiredVisitors(NOW)).toBe(5);
		});

		it('removes their content and images too', async () => {
			await createExpired(3);

			await removeExpiredVisitors(NOW);

			expect(await UserModel.countDocuments({ accountType: 'demo' })).toBe(0);
			expect(await UserPostModel.countDocuments()).toBe(0);
			expect(destroyedIdentifiers().sort()).toEqual(['user-images/batch-post-0', 'user-images/batch-post-1', 'user-images/batch-post-2']);
		});

		it('leaves out the visitors that have not expired and everybody who is not a visitor', async () => {
			await createExpired(2);

			const fresh = await createUserAt('fresh_demo_1', hoursBeforeNow(1), { accountType: 'demo' });
			const regular = await createUserAt('regular_old', hoursBeforeNow(500), { accountType: 'user' });

			await removeExpiredVisitors(NOW);

			expect(removeUsersWithContent.mock.calls[0][0].map(String)).not.toContain(String(fresh._id));
			expect(await UserModel.findById(fresh._id)).not.toBeNull();
			expect(await UserModel.findById(regular._id)).not.toBeNull();
		});

		it('makes no call at all when nothing has expired', async () => {
			await createUserAt('fresh_demo_1', hoursBeforeNow(1), { accountType: 'demo' });

			expect(await removeExpiredVisitors(NOW)).toBe(0);
			expect(removeUsersWithContent).not.toHaveBeenCalled();
		});

		describe('when the batch fails', () => {
			it('retries the visitors one at a time', async () => {
				const visitors = await createExpired(3);

				removeUsersWithContent.mockRejectedValueOnce(new Error('batch failed'));

				const removed = await removeExpiredVisitors(NOW);

				expect(removed).toBe(3);
				expect(removeUsersWithContent).toHaveBeenCalledTimes(4);
				removeUsersWithContent.mock.calls.slice(1).forEach(([userIds]) => expect(userIds).toHaveLength(1));
				expect(
					removeUsersWithContent.mock.calls
						.slice(1)
						.map(([userIds]) => String(userIds[0]))
						.sort(),
				).toEqual(visitors.map((visitor) => String(visitor._id)).sort());
				expect(await UserModel.countDocuments({ accountType: 'demo' })).toBe(0);
			});

			it('logs that it is retrying', async () => {
				await createExpired(2);

				removeUsersWithContent.mockRejectedValueOnce(new Error('batch failed'));

				await removeExpiredVisitors(NOW);

				expect(console.error).toHaveBeenCalledWith(expect.stringContaining('one by one'), expect.any(Error));
			});

			it('removes the others and skips only the one that keeps failing', async () => {
				const visitors = await createExpired(3);
				const stubborn = visitors[1];

				cloudinary.uploader.destroy.mockImplementation(async (identifier) => {
					if (identifier === 'user-images/batch-post-1') {
						throw new Error('Cloudinary is down');
					}

					return { result: 'ok' };
				});

				const removed = await removeExpiredVisitors(NOW);

				expect(removed).toBe(2);
				expect(await UserModel.find({ accountType: 'demo' }).distinct('_id')).toEqual([stubborn._id]);
			});

			it('returns 0, and throws nothing, when every visitor keeps failing', async () => {
				await createExpired(2);

				cloudinary.uploader.destroy.mockRejectedValue(new Error('Cloudinary is down'));

				await expect(removeExpiredVisitors(NOW)).resolves.toBe(0);
				expect(await UserModel.countDocuments({ accountType: 'demo' })).toBe(2);
			});

			it('does not retry the visitors that a failed batch call already removed twice', async () => {
				await createExpired(2);

				removeUsersWithContent.mockRejectedValueOnce(new Error('batch failed'));

				await removeExpiredVisitors(NOW);
				removeUsersWithContent.mockClear();

				expect(await removeExpiredVisitors(NOW)).toBe(0);
				expect(removeUsersWithContent).not.toHaveBeenCalled();
			});
		});
	});

	describe('the hourly job', () => {
		it('should remove expired visitors before anything else, even when there is no activity run to continue', async () => {
			const expired = await createUserAt('old_demo_1', hoursBeforeNow(30), { accountType: 'demo' });
			const fresh = await createUserAt('new_demo_1', hoursBeforeNow(1), { accountType: 'demo' });

			const result = await runDemoActivity({ now: NOW });

			expect(result).toEqual({ hoursRun: 0 });
			expect(await UserModel.findById(expired._id)).toBeNull();
			expect(await UserModel.findById(fresh._id)).not.toBeNull();
		});
	});
});

function stringIds(values) {
	return values.map(String);
}
