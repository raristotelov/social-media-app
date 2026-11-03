const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const CommentModel = require('../models/commentModel');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const StoryModel = require('../models/storyModel');
const StoryViewModel = require('../models/storyViewModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { deleteImage } = require('../services/imageStorageService');
const { clearDemoContent } = require('./clearDemoContent');

jest.mock('../services/imageStorageService', () => ({
	deleteImage: jest.fn(),
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

const ACCOUNT_TYPES_BY_DOMAIN = { 'demo.invalid': 'persona', 'visitor.demo.invalid': 'demo' };

const createUser = (username, { domain = 'example.com', ...extra } = {}) =>
	UserModel.create({
		email: `${username}@${domain}`,
		accountType: ACCOUNT_TYPES_BY_DOMAIN[domain] || 'user',
		username,
		password: 'hashed-password',
		...extra,
	});

const createPost = (author, extra = {}) =>
	UserPostModel.create({
		imageIdentifier: `post-${author.username}-${new mongoose.Types.ObjectId()}`,
		imageUrl: `https://cdn.example.com/${author.username}-${new mongoose.Types.ObjectId()}.jpg`,
		imageWidth: 100,
		imageHeight: 100,
		userId: author._id,
		...extra,
	});

const createStory = (author) =>
	StoryModel.create({
		imageIdentifier: `story-${author.username}`,
		imageUrl: `https://cdn.example.com/story-${author.username}.jpg`,
		imageWidth: 100,
		imageHeight: 100,
		userId: author._id,
	});

const createComment = (post, author, extra = {}) => CommentModel.create({ userPostId: post._id, userId: author._id, text: 'a comment', ...extra });

const ids = (documents) => documents.map((document) => String(document._id)).sort();

describe('clearDemoContent against a real database', () => {
	let mongoServer;

	beforeAll(async () => {
		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), UserPostModel.init(), CommentModel.init(), StoryModel.init(), StoryViewModel.init()]);
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await mongoose.disconnect();
		await mongoServer?.stop();
	});

	beforeEach(async () => {
		jest.clearAllMocks();
		deleteImage.mockResolvedValue(undefined);

		await Promise.all([
			UserModel.deleteMany({}),
			UserPostModel.deleteMany({}),
			CommentModel.deleteMany({}),
			StoryModel.deleteMany({}),
			StoryViewModel.deleteMany({}),
			DemoAccountStateModel.deleteMany({}),
			DemoScheduledEventModel.deleteMany({}),
			DemoActivityRunModel.deleteMany({}),
		]);
	});

	describe('when demo and real content exist', () => {
		let demoA;
		let demoB;
		let realOne;
		let realTwo;
		let visitor;
		let demoPost;
		let demoPostOnlyComment;
		let realPost;
		let visitorPost;
		let demoStoryA;
		let demoStoryB;
		let realStory;
		let visitorStory;
		let demoCommentOnRealPost;
		let realReplyToDemoComment;
		let realCommentMentioningDemo;
		let realCommentKept;
		let result;

		beforeEach(async () => {
			demoA = await createUser('demo_a', { domain: 'demo.invalid' });
			demoB = await createUser('demo_b', { domain: 'demo.invalid' });
			realOne = await createUser('real_one');
			realTwo = await createUser('real_two');
			visitor = await createUser('visitor_x', { domain: 'visitor.demo.invalid' });

			await UserModel.updateOne({ _id: realOne._id }, { followers: [demoA._id, realTwo._id], following: [demoA._id, demoB._id, realTwo._id] });
			await UserModel.updateOne({ _id: realTwo._id }, { followers: [realOne._id, demoB._id], following: [realOne._id, demoA._id] });
			await UserModel.updateOne({ _id: demoA._id }, { followers: [realOne._id, demoB._id], following: [realOne._id, realTwo._id] });
			await UserModel.updateOne({ _id: demoB._id }, { followers: [realTwo._id], following: [realOne._id, demoA._id] });
			await UserModel.updateOne({ _id: visitor._id }, { followers: [demoA._id, realOne._id], following: [demoB._id, realOne._id] });

			demoPost = await createPost(demoA, { likes: [demoB._id, realOne._id], commentsCount: 2 });
			demoPostOnlyComment = await createComment(demoPost, realOne);
			await createComment(demoPost, demoB);
			visitorPost = await createPost(visitor, { likes: [demoA._id, realOne._id], commentsCount: 0 });
			await UserModel.updateOne({ _id: demoA._id }, { posts: [demoPost._id] });

			realPost = await createPost(realOne, { likes: [demoA._id, realTwo._id, demoB._id], commentsCount: 4 });
			await UserModel.updateOne({ _id: realOne._id }, { posts: [realPost._id] });

			demoCommentOnRealPost = await createComment(realPost, demoA);
			realReplyToDemoComment = await createComment(realPost, realTwo, {
				parentCommentId: demoCommentOnRealPost._id,
				mentionedUserId: demoA._id,
				text: '@demo_a thanks',
			});
			realCommentMentioningDemo = await createComment(realPost, realTwo, { mentionedUserId: demoB._id, likes: [demoA._id, realOne._id] });
			realCommentKept = await createComment(realPost, realOne, { likes: [realTwo._id] });

			demoStoryA = await createStory(demoA);
			demoStoryB = await createStory(demoB);
			realStory = await createStory(realOne);
			visitorStory = await createStory(visitor);

			await StoryViewModel.create({ storyId: demoStoryA._id, viewerId: realOne._id });
			await StoryViewModel.create({ storyId: realStory._id, viewerId: demoA._id });
			await StoryViewModel.create({ storyId: realStory._id, viewerId: realTwo._id });
			await StoryViewModel.create({ storyId: visitorStory._id, viewerId: demoB._id });

			result = await clearDemoContent();
		});

		it('should return the number of demo accounts removed', () => {
			expect(result).toBe(2);
		});

		it('should delete the demo users', async () => {
			expect(await UserModel.find({ _id: { $in: [demoA._id, demoB._id] } })).toEqual([]);
		});

		it('should keep the real users and the visitor account', async () => {
			expect(ids(await UserModel.find({}))).toEqual(ids([realOne, realTwo, visitor]));
		});

		it('should not remove the @visitor.demo.invalid account', async () => {
			expect(await UserModel.findById(visitor._id)).not.toBeNull();
		});

		it('should keep the visitor posts and stories', async () => {
			expect(await UserPostModel.findById(visitorPost._id)).not.toBeNull();
			expect(await StoryModel.findById(visitorStory._id)).not.toBeNull();
		});

		it('should delete the demo users posts', async () => {
			expect(await UserPostModel.findById(demoPost._id)).toBeNull();
		});

		it('should delete every comment on demo posts, including real users comments', async () => {
			expect(await CommentModel.find({ userPostId: demoPost._id })).toEqual([]);
			expect(await CommentModel.findById(demoPostOnlyComment._id)).toBeNull();
		});

		it('should delete the demo users stories', async () => {
			expect(await StoryModel.find({ _id: { $in: [demoStoryA._id, demoStoryB._id] } })).toEqual([]);
		});

		it('should call deleteImage once for each demo story imageIdentifier', () => {
			expect(deleteImage.mock.calls.map(([identifier]) => identifier).sort()).toEqual(
				[demoStoryA.imageIdentifier, demoStoryB.imageIdentifier].sort(),
			);
		});

		it('should not call deleteImage for real or visitor stories', () => {
			expect(deleteImage).not.toHaveBeenCalledWith(realStory.imageIdentifier);
			expect(deleteImage).not.toHaveBeenCalledWith(visitorStory.imageIdentifier);
		});

		it('should delete story views of demo stories', async () => {
			expect(await StoryViewModel.find({ storyId: demoStoryA._id })).toEqual([]);
		});

		it('should delete story views made by demo users on real stories', async () => {
			expect(await StoryViewModel.find({ storyId: realStory._id, viewerId: demoA._id })).toEqual([]);
		});

		it('should delete story views made by demo users on visitor stories', async () => {
			expect(await StoryViewModel.find({ storyId: visitorStory._id, viewerId: demoB._id })).toEqual([]);
		});

		it('should keep story views made by real users on real stories', async () => {
			expect(await StoryViewModel.countDocuments({ storyId: realStory._id, viewerId: realTwo._id })).toBe(1);
		});

		it('should keep real users and their posts and stories', async () => {
			expect(await UserPostModel.findById(realPost._id)).not.toBeNull();
			expect(await StoryModel.findById(realStory._id)).not.toBeNull();
		});

		it('should remove demo likes from real posts and keep real likes', async () => {
			const post = await UserPostModel.findById(realPost._id);

			expect(post.likes.map(String)).toEqual([String(realTwo._id)]);
		});

		it('should remove demo likes from visitor posts and keep real likes', async () => {
			const post = await UserPostModel.findById(visitorPost._id);

			expect(post.likes.map(String)).toEqual([String(realOne._id)]);
		});

		it('should remove demo likes from real comments and keep real likes', async () => {
			const comment = await CommentModel.findById(realCommentMentioningDemo._id);

			expect(comment.likes.map(String)).toEqual([String(realOne._id)]);
		});

		it('should leave real comment likes by real users untouched', async () => {
			const comment = await CommentModel.findById(realCommentKept._id);

			expect(comment.likes.map(String)).toEqual([String(realTwo._id)]);
		});

		it('should remove demo users from real users followers and following', async () => {
			const [one, two] = await Promise.all([UserModel.findById(realOne._id), UserModel.findById(realTwo._id)]);

			expect(one.followers.map(String)).toEqual([String(realTwo._id)]);
			expect(one.following.map(String)).toEqual([String(realTwo._id)]);
			expect(two.followers.map(String)).toEqual([String(realOne._id)]);
			expect(two.following.map(String)).toEqual([String(realOne._id)]);
		});

		it('should remove demo users from the visitor followers and following', async () => {
			const user = await UserModel.findById(visitor._id);

			expect(user.followers.map(String)).toEqual([String(realOne._id)]);
			expect(user.following.map(String)).toEqual([String(realOne._id)]);
		});

		it('should remove a demo comment on a real post', async () => {
			expect(await CommentModel.findById(demoCommentOnRealPost._id)).toBeNull();
		});

		it('should remove a real users reply to a demo comment', async () => {
			expect(await CommentModel.findById(realReplyToDemoComment._id)).toBeNull();
		});

		it('should decrease the real post commentsCount by the number of comments removed', async () => {
			const post = await UserPostModel.findById(realPost._id);

			expect(post.commentsCount).toBe(2);
		});

		it('should keep the real comments on the real post', async () => {
			expect(ids(await CommentModel.find({ userPostId: realPost._id }))).toEqual(ids([realCommentMentioningDemo, realCommentKept]));
		});

		it('should keep a real comment that mentions a demo user and clear its mentionedUserId', async () => {
			const comment = await CommentModel.findById(realCommentMentioningDemo._id);

			expect(comment).not.toBeNull();
			expect(comment.mentionedUserId).toBeNull();
		});

		it('should not touch the mentionedUserId of comments that mention no demo user', async () => {
			const comment = await CommentModel.findById(realCommentKept._id);

			expect(comment.mentionedUserId).toBeNull();
		});
	});

	describe('when a demo reply targets a real comment', () => {
		it('should remove the demo reply and decrease the real post commentsCount by one', async () => {
			const demo = await createUser('demo_only', { domain: 'demo.invalid' });
			const real = await createUser('real_only');
			const post = await createPost(real, { commentsCount: 2 });
			const parent = await createComment(post, real);
			const demoReply = await createComment(post, demo, { parentCommentId: parent._id, mentionedUserId: real._id });

			await clearDemoContent();

			expect(await CommentModel.findById(demoReply._id)).toBeNull();
			expect(await CommentModel.findById(parent._id)).not.toBeNull();
			expect((await UserPostModel.findById(post._id)).commentsCount).toBe(1);
		});
	});

	describe('job state', () => {
		const createJobState = async (user) => {
			const post = await createPost(user);

			await DemoAccountStateModel.create({
				userId: user._id,
				username: user.username,
				tier: 'creator',
				queue: ['creator-posts/c01/a.jpg'],
				posted: [{ postId: post._id, source: 'creator-posts/c01/b.jpg', caption: 'A caption', permanent: false }],
			});
			await DemoScheduledEventModel.create({ dueAt: new Date(), type: 'postLike', userPostId: post._id, userId: user._id });
			await DemoActivityRunModel.create({ lastCompletedHour: new Date('2026-10-29T11:00:00.000Z') });
		};

		it('should delete every DemoAccountState, DemoScheduledEvent and DemoActivityRun document', async () => {
			const demo = await createUser('demo_state', { domain: 'demo.invalid' });

			await createJobState(demo);
			await DemoAccountStateModel.create({ userId: new mongoose.Types.ObjectId(), username: 'second', tier: 'lurker' });
			await DemoScheduledEventModel.create({
				dueAt: new Date(),
				type: 'postLike',
				userPostId: new mongoose.Types.ObjectId(),
				userId: new mongoose.Types.ObjectId(),
			});

			await clearDemoContent();

			expect(await DemoAccountStateModel.countDocuments()).toBe(0);
			expect(await DemoScheduledEventModel.countDocuments()).toBe(0);
			expect(await DemoActivityRunModel.countDocuments()).toBe(0);
		});

		it('should delete the job state even when no demo account exists any more', async () => {
			const real = await createUser('real_with_state');

			await createJobState(real);

			const result = await clearDemoContent();

			expect(result).toBe(0);
			expect(await DemoAccountStateModel.countDocuments()).toBe(0);
			expect(await DemoScheduledEventModel.countDocuments()).toBe(0);
			expect(await DemoActivityRunModel.countDocuments()).toBe(0);
		});

		it('should still delete the demo accounts and their posts', async () => {
			const demo = await createUser('demo_with_state', { domain: 'demo.invalid' });
			const post = await createPost(demo);

			await createJobState(demo);

			const result = await clearDemoContent();

			expect(result).toBe(1);
			expect(await UserModel.findById(demo._id)).toBeNull();
			expect(await UserPostModel.findById(post._id)).toBeNull();
		});

		it('should leave real users and their posts alone', async () => {
			const demo = await createUser('demo_state_two', { domain: 'demo.invalid' });
			const real = await createUser('real_state_two');
			const realPost = await createPost(real);

			await createJobState(demo);
			await clearDemoContent();

			expect(await UserModel.findById(real._id)).not.toBeNull();
			expect(await UserPostModel.findById(realPost._id)).not.toBeNull();
		});
	});

	describe('when no demo accounts exist', () => {
		it('should return 0 and change nothing', async () => {
			const real = await createUser('real_alone');
			const other = await createUser('real_other', { domain: 'visitor.demo.invalid' });
			const post = await createPost(real, { likes: [other._id], commentsCount: 1 });
			const comment = await createComment(post, other, { mentionedUserId: real._id });
			const story = await createStory(real);

			const result = await clearDemoContent();

			expect(result).toBe(0);
			expect(ids(await UserModel.find({}))).toEqual(ids([real, other]));
			expect((await UserPostModel.findById(post._id)).likes.map(String)).toEqual([String(other._id)]);
			expect((await UserPostModel.findById(post._id)).commentsCount).toBe(1);
			expect((await CommentModel.findById(comment._id)).mentionedUserId.toString()).toBe(String(real._id));
			expect(await StoryModel.findById(story._id)).not.toBeNull();
			expect(deleteImage).not.toHaveBeenCalled();
		});
	});
});
