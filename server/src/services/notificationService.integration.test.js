jest.mock('./imageStorageService');
jest.mock('../demo/userReactions', () => ({ reactToUpload: jest.fn(), reactToSignUp: jest.fn() }));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const CommentModel = require('../models/commentModel');
const NotificationModel = require('../models/notificationModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { applyEvent } = require('../demo/scheduledEvents');
const { applyFollow } = require('../demo/reactionDelivery');
const { removeUsersWithContent } = require('../demo/removeUsersWithContent');
const { followUser, unfollowUser } = require('./userService');
const { likeUserPost, unlikeUserPost, deleteUserPost } = require('./userPostService');
const { addComment, likeComment, unlikeComment } = require('./commentService');
const notificationService = require('./notificationService');

const { NOTIFICATION_TYPES } = constants;
const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;
const MINUTE_MS = 60 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

let postCounter = 0;

const createUser = (username, accountType = 'user') =>
	UserModel.create({ email: `${username}@example.com`, username, password: 'hashed-password', accountType });

const createPost = async (author) => {
	postCounter += 1;

	const createdPost = await UserPostModel.create({
		imageIdentifier: `post-${postCounter}`,
		imageUrl: `https://cdn.example.com/post-${postCounter}.jpg`,
		imageWidth: 100,
		imageHeight: 100,
		userId: author._id,
	});

	await UserModel.updateOne({ _id: author._id }, { $addToSet: { posts: createdPost._id } });

	return createdPost;
};

const createComment = (post, author, extra = {}) => CommentModel.create({ userPostId: post._id, userId: author._id, text: 'a comment', ...extra });

const id = (document) => String(document._id);

const notificationsFor = (recipient) => NotificationModel.find({ recipientId: recipient._id }).sort({ createdAt: 1, _id: 1 }).lean();

const typesFor = async (recipient) => (await notificationsFor(recipient)).map((notification) => notification.type);

const countAll = () => NotificationModel.countDocuments({});

const cutoffNow = () => new Date().toISOString();

const markAllReadNow = (recipient) => notificationService.markAllRead(id(recipient), { cutoff: cutoffNow() });

describe('notifications against a real database', () => {
	let mongoServer;
	let alice;
	let bob;
	let carol;
	let persona;
	let visitor;
	let post;

	let originalJwtSecret;

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = 'notifications-integration-test-secret';

		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), UserPostModel.init(), CommentModel.init(), NotificationModel.init()]);
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		process.env.JWT_SECRET = originalJwtSecret;

		await mongoose.disconnect();
		await mongoServer?.stop();
	});

	beforeEach(async () => {
		jest.clearAllMocks();
		await Promise.all([UserModel.deleteMany({}), UserPostModel.deleteMany({}), CommentModel.deleteMany({}), NotificationModel.deleteMany({})]);

		alice = await createUser('alice');
		bob = await createUser('bob');
		carol = await createUser('carol');
		persona = await createUser('persona', 'persona');
		visitor = await createUser('visitor', 'demo');
		post = await createPost(alice);
	});

	describe('follow', () => {
		it('notifies the followed user with the follower as actor', async () => {
			await followUser(id(bob), id(alice));

			const [notification] = await notificationsFor(alice);

			expect(notification).toMatchObject({ type: NOTIFICATION_TYPES.FOLLOW, actorId: bob._id, isRead: false });
		});

		it('creates nothing when a user follows themselves', async () => {
			await expect(followUser(id(alice), id(alice))).rejects.toBeInstanceOf(AppError);

			await expect(countAll()).resolves.toBe(0);
		});

		it('keeps one notification per follower however many times the follow is repeated', async () => {
			await followUser(id(bob), id(alice));
			await followUser(id(bob), id(alice));

			await expect(NotificationModel.countDocuments({ recipientId: alice._id })).resolves.toBe(1);
		});

		it('keeps the original unread state and time when the follow is repeated', async () => {
			await followUser(id(bob), id(alice));
			await markAllReadNow(alice);
			const [original] = await notificationsFor(alice);

			await followUser(id(bob), id(alice));

			const [afterRepeat] = await notificationsFor(alice);

			expect(afterRepeat).toMatchObject({ _id: original._id, isRead: true, createdAt: original.createdAt });
		});

		it('gives each follower their own notification', async () => {
			await followUser(id(bob), id(alice));
			await followUser(id(carol), id(alice));

			await expect(NotificationModel.countDocuments({ recipientId: alice._id })).resolves.toBe(2);
		});

		it('deletes the notification when the follow is undone', async () => {
			await followUser(id(bob), id(alice));
			await unfollowUser(id(bob), id(alice));

			await expect(countAll()).resolves.toBe(0);
		});

		it('keeps other followers notifications when one follower unfollows', async () => {
			await followUser(id(bob), id(alice));
			await followUser(id(carol), id(alice));
			await unfollowUser(id(bob), id(alice));

			const [remaining] = await notificationsFor(alice);

			expect(remaining.actorId).toEqual(carol._id);
		});

		it('creates nothing for a persona recipient', async () => {
			await followUser(id(bob), id(persona));

			await expect(countAll()).resolves.toBe(0);
		});

		it('creates nothing when a demo visitor follows', async () => {
			await followUser(id(visitor), id(alice));

			await expect(countAll()).resolves.toBe(0);
		});

		it('notifies a demo visitor who is followed by a persona', async () => {
			await applyFollow({ userId: persona._id, targetUserId: visitor._id });

			await expect(typesFor(visitor)).resolves.toEqual([NOTIFICATION_TYPES.FOLLOW]);
		});

		it('notifies a user who is followed by a persona', async () => {
			await followUser(id(persona), id(alice));

			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.FOLLOW]);
		});

		it('notifies when a scheduled persona follow is delivered', async () => {
			await applyFollow({ userId: persona._id, targetUserId: alice._id });

			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.FOLLOW]);
		});

		it('creates nothing when a scheduled follow targets a user that no longer exists', async () => {
			await applyFollow({ userId: persona._id, targetUserId: new mongoose.Types.ObjectId() });

			await expect(countAll()).resolves.toBe(0);
		});
	});

	describe('post likes', () => {
		it('notifies the post owner with the post attached', async () => {
			await likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id });

			const [notification] = await notificationsFor(alice);

			expect(notification).toMatchObject({ type: NOTIFICATION_TYPES.POST_LIKE, actorId: bob._id, userPostId: post._id });
		});

		it('creates nothing when users like their own post', async () => {
			await likeUserPost({ userPostId: post._id, userWhoLikedId: alice._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('keeps one notification per person per post when the like is repeated', async () => {
			await likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id });
			await likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id });

			await expect(countAll()).resolves.toBe(1);
		});

		it('keeps separate notifications for separate posts of the same owner', async () => {
			const otherPost = await createPost(alice);

			await likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id });
			await likeUserPost({ userPostId: otherPost._id, userWhoLikedId: bob._id });

			await expect(countAll()).resolves.toBe(2);
		});

		it('deletes the notification when the like is undone', async () => {
			await likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id });
			await unlikeUserPost({ userPostId: post._id, userWhoUnlikedId: bob._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('only deletes the notification of the person who unliked', async () => {
			await likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id });
			await likeUserPost({ userPostId: post._id, userWhoLikedId: carol._id });
			await unlikeUserPost({ userPostId: post._id, userWhoUnlikedId: bob._id });

			const [remaining] = await notificationsFor(alice);

			expect(remaining.actorId).toEqual(carol._id);
		});

		it('creates nothing when a demo visitor likes', async () => {
			await likeUserPost({ userPostId: post._id, userWhoLikedId: visitor._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('creates nothing when the post belongs to a persona', async () => {
			const personaPost = await createPost(persona);

			await likeUserPost({ userPostId: personaPost._id, userWhoLikedId: bob._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('notifies the owner when a persona likes their post', async () => {
			await likeUserPost({ userPostId: post._id, userWhoLikedId: persona._id });

			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.POST_LIKE]);
		});

		it('notifies the owner of a demo visitor post when a persona like is delivered', async () => {
			const visitorPost = await createPost(visitor);

			await applyEvent({ type: 'postLike', userId: persona._id, userPostId: visitorPost._id });

			await expect(typesFor(visitor)).resolves.toEqual([NOTIFICATION_TYPES.POST_LIKE]);
		});

		it('creates nothing when a delivered like was already there', async () => {
			await UserPostModel.updateOne({ _id: post._id }, { $push: { likes: persona._id } });

			await applyEvent({ type: 'postLike', userId: persona._id, userPostId: post._id });

			await expect(countAll()).resolves.toBe(0);
		});
	});

	describe('comment likes', () => {
		let comment;

		beforeEach(async () => {
			comment = await createComment(post, bob);
		});

		it('notifies the comment author with the post and comment attached', async () => {
			await likeComment({ commentId: comment._id, userId: carol._id });

			const [notification] = await notificationsFor(bob);

			expect(notification).toMatchObject({
				type: NOTIFICATION_TYPES.COMMENT_LIKE,
				actorId: carol._id,
				userPostId: post._id,
				commentId: comment._id,
			});
		});

		it('creates nothing when authors like their own comment', async () => {
			await likeComment({ commentId: comment._id, userId: bob._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('keeps one notification per person per comment when the like is repeated', async () => {
			await likeComment({ commentId: comment._id, userId: carol._id });
			await likeComment({ commentId: comment._id, userId: carol._id });

			await expect(countAll()).resolves.toBe(1);
		});

		it('deletes the notification when the like is undone', async () => {
			await likeComment({ commentId: comment._id, userId: carol._id });
			await unlikeComment({ commentId: comment._id, userId: carol._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('creates nothing when a demo visitor likes', async () => {
			await likeComment({ commentId: comment._id, userId: visitor._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('creates nothing when the comment belongs to a persona', async () => {
			const personaComment = await createComment(post, persona);

			await likeComment({ commentId: personaComment._id, userId: carol._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('notifies when a persona comment like is delivered to a user', async () => {
			await applyEvent({ type: 'commentLike', userId: persona._id, commentId: comment._id });

			await expect(typesFor(bob)).resolves.toEqual([NOTIFICATION_TYPES.COMMENT_LIKE]);
		});
	});

	describe('comments', () => {
		it('notifies the post owner with the post and comment attached', async () => {
			const comment = await addComment({ userPostId: post._id, userId: bob._id, text: 'nice one' });

			const [notification] = await notificationsFor(alice);

			expect(notification).toMatchObject({
				type: NOTIFICATION_TYPES.COMMENT,
				actorId: bob._id,
				userPostId: post._id,
				commentId: comment._id,
			});
		});

		it('creates nothing when owners comment on their own post', async () => {
			await addComment({ userPostId: post._id, userId: alice._id, text: 'my own words' });

			await expect(countAll()).resolves.toBe(0);
		});

		it('creates one notification for every comment, not one per person', async () => {
			await addComment({ userPostId: post._id, userId: bob._id, text: 'first' });
			await addComment({ userPostId: post._id, userId: bob._id, text: 'second' });

			await expect(countAll()).resolves.toBe(2);
		});

		it('creates nothing when a demo visitor comments', async () => {
			await addComment({ userPostId: post._id, userId: visitor._id, text: 'hello' });

			await expect(countAll()).resolves.toBe(0);
		});

		it('creates nothing when the post belongs to a persona', async () => {
			const personaPost = await createPost(persona);

			await addComment({ userPostId: personaPost._id, userId: bob._id, text: 'hello' });

			await expect(countAll()).resolves.toBe(0);
		});

		it('notifies the owner of a demo visitor post when a persona comment is delivered', async () => {
			const visitorPost = await createPost(visitor);

			await applyEvent({
				type: 'comment',
				userId: persona._id,
				userPostId: visitorPost._id,
				commentId: new mongoose.Types.ObjectId(),
				text: 'hello',
				dueAt: new Date(),
			});

			await expect(typesFor(visitor)).resolves.toEqual([NOTIFICATION_TYPES.COMMENT]);
		});

		it('notifies the owner when a delivered persona comment arrives', async () => {
			const commentId = new mongoose.Types.ObjectId();

			await applyEvent({ type: 'comment', userId: persona._id, userPostId: post._id, commentId, text: 'lovely', dueAt: new Date() });

			const [notification] = await notificationsFor(alice);

			expect(notification).toMatchObject({ type: NOTIFICATION_TYPES.COMMENT, actorId: persona._id, commentId });
		});

		it('creates no duplicate when a delivered persona comment already exists', async () => {
			const existing = await createComment(post, persona);

			await applyEvent({
				type: 'comment',
				userId: persona._id,
				userPostId: post._id,
				commentId: existing._id,
				text: 'again',
				dueAt: new Date(),
			});

			await expect(countAll()).resolves.toBe(0);
		});
	});

	describe('replies', () => {
		it('notifies the comment author with a reply and the post owner with a reply on post', async () => {
			const parent = await createComment(post, bob);

			await addComment({ userPostId: post._id, userId: carol._id, text: 'agreed', parentCommentId: parent._id });

			await expect(typesFor(bob)).resolves.toEqual([NOTIFICATION_TYPES.REPLY]);
			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.REPLY_ON_POST]);
		});

		it('attaches the reply comment and post to both notifications', async () => {
			const parent = await createComment(post, bob);
			const reply = await addComment({ userPostId: post._id, userId: carol._id, text: 'agreed', parentCommentId: parent._id });

			const notifications = await NotificationModel.find({}).lean();

			expect(notifications).toHaveLength(2);
			notifications.forEach((notification) =>
				expect(notification).toMatchObject({ actorId: carol._id, userPostId: post._id, commentId: reply._id }),
			);
		});

		it('creates only a reply when the comment author is the post owner', async () => {
			const parent = await createComment(post, alice);

			await addComment({ userPostId: post._id, userId: carol._id, text: 'agreed', parentCommentId: parent._id });

			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.REPLY]);
			await expect(countAll()).resolves.toBe(1);
		});

		it('creates nothing when the post owner replies to their own comment', async () => {
			const parent = await createComment(post, alice);

			await addComment({ userPostId: post._id, userId: alice._id, text: 'self reply', parentCommentId: parent._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('notifies only the comment author when the post owner replies to someone else', async () => {
			const parent = await createComment(post, bob);

			await addComment({ userPostId: post._id, userId: alice._id, text: 'thanks', parentCommentId: parent._id });

			await expect(typesFor(bob)).resolves.toEqual([NOTIFICATION_TYPES.REPLY]);
			await expect(countAll()).resolves.toBe(1);
		});

		it('notifies only the post owner when a commenter replies to their own comment', async () => {
			const parent = await createComment(post, bob);

			await addComment({ userPostId: post._id, userId: bob._id, text: 'addendum', parentCommentId: parent._id });

			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.REPLY_ON_POST]);
			await expect(countAll()).resolves.toBe(1);
		});

		it('creates nothing when a demo visitor replies', async () => {
			const parent = await createComment(post, bob);

			await addComment({ userPostId: post._id, userId: visitor._id, text: 'hi', parentCommentId: parent._id });

			await expect(countAll()).resolves.toBe(0);
		});

		it('skips a persona comment author but still notifies the post owner', async () => {
			const parent = await createComment(post, persona);

			await addComment({ userPostId: post._id, userId: carol._id, text: 'hi', parentCommentId: parent._id });

			await expect(typesFor(persona)).resolves.toEqual([]);
			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.REPLY_ON_POST]);
		});

		it('notifies a user whose comment gets a persona reply', async () => {
			const parent = await createComment(post, bob);

			await addComment({ userPostId: post._id, userId: persona._id, text: 'hi', parentCommentId: parent._id });

			await expect(typesFor(bob)).resolves.toEqual([NOTIFICATION_TYPES.REPLY]);
		});

		it('creates nothing when a delivered reply points at a comment that no longer exists', async () => {
			const missingParentId = new mongoose.Types.ObjectId();
			const reply = await createComment(post, carol, { parentCommentId: missingParentId });

			await notificationService.notifyComment({ commentId: reply._id });

			await expect(countAll()).resolves.toBe(0);
		});
	});

	describe('removal with the content', () => {
		it('deletes every notification pointing to a post when the post is deleted', async () => {
			const otherPost = await createPost(alice);
			const comment = await addComment({ userPostId: post._id, userId: bob._id, text: 'hello' });

			await likeUserPost({ userPostId: post._id, userWhoLikedId: carol._id });
			await likeComment({ commentId: comment._id, userId: carol._id });
			await likeUserPost({ userPostId: otherPost._id, userWhoLikedId: carol._id });
			await deleteUserPost({ userPostId: post._id, userId: alice._id });

			const remaining = await NotificationModel.find({}).lean();

			expect(remaining).toHaveLength(1);
			expect(remaining[0].userPostId).toEqual(otherPost._id);
		});

		it('keeps follow notifications when a post is deleted', async () => {
			await followUser(id(bob), id(alice));
			await deleteUserPost({ userPostId: post._id, userId: alice._id });

			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.FOLLOW]);
		});

		it('deletes the notifications a user gave and received when the account is removed', async () => {
			await followUser(id(bob), id(alice));
			await followUser(id(alice), id(carol));
			await followUser(id(carol), id(alice));

			await removeUsersWithContent([bob._id]);

			const remaining = await NotificationModel.find({}).lean();

			expect(remaining.map((notification) => String(notification.actorId)).sort()).toEqual([id(alice), id(carol)].sort());
		});

		it('deletes the notifications of the posts and comments of a removed account', async () => {
			const bobPost = await createPost(bob);
			const bobComment = await addComment({ userPostId: post._id, userId: bob._id, text: 'hello' });
			await addComment({ userPostId: bobPost._id, userId: carol._id, text: 'hey' });
			await addComment({ userPostId: post._id, userId: carol._id, text: 'reply', parentCommentId: bobComment._id });

			await likeUserPost({ userPostId: bobPost._id, userWhoLikedId: alice._id });
			await likeComment({ commentId: bobComment._id, userId: alice._id });

			await removeUsersWithContent([bob._id]);

			await expect(NotificationModel.find({}).lean()).resolves.toEqual([]);
		});

		it('keeps unrelated notifications when an account is removed', async () => {
			await followUser(id(carol), id(alice));
			await likeUserPost({ userPostId: post._id, userWhoLikedId: carol._id });

			await removeUsersWithContent([bob._id]);

			await expect(countAll()).resolves.toBe(2);
		});
	});

	describe('failures never fail the main action', () => {
		let consoleError;

		beforeEach(() => {
			consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it('still follows when the notification cannot be saved', async () => {
			jest.spyOn(NotificationModel, 'updateOne').mockRejectedValue(new Error('db down'));

			await expect(followUser(id(bob), id(alice))).resolves.toBeDefined();
			await expect(UserModel.exists({ _id: alice._id, followers: bob._id })).resolves.toBeTruthy();
			expect(consoleError).toHaveBeenCalled();
		});

		it('still likes a post when the notification cannot be saved', async () => {
			jest.spyOn(NotificationModel, 'updateOne').mockRejectedValue(new Error('db down'));

			await expect(likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id })).resolves.toBeDefined();
			await expect(UserPostModel.exists({ _id: post._id, likes: bob._id })).resolves.toBeTruthy();
		});

		it('still comments when the notification cannot be saved', async () => {
			jest.spyOn(NotificationModel, 'create').mockRejectedValue(new Error('db down'));

			await expect(addComment({ userPostId: post._id, userId: bob._id, text: 'hello' })).resolves.toBeDefined();
			await expect(CommentModel.countDocuments({ userPostId: post._id })).resolves.toBe(1);
		});

		it('still unfollows when the notification cannot be removed', async () => {
			await followUser(id(bob), id(alice));
			jest.spyOn(NotificationModel, 'deleteMany').mockRejectedValue(new Error('db down'));

			await expect(unfollowUser(id(bob), id(alice))).resolves.toBeDefined();
			await expect(UserModel.exists({ _id: alice._id, followers: bob._id })).resolves.toBeNull();
		});

		it('still deletes a post when its notifications cannot be removed', async () => {
			jest.spyOn(NotificationModel, 'deleteMany').mockRejectedValue(new Error('db down'));

			await expect(deleteUserPost({ userPostId: post._id, userId: alice._id })).resolves.toBeUndefined();
			await expect(UserPostModel.exists({ _id: post._id })).resolves.toBeNull();
		});

		it('still delivers a scheduled like when the actor lookup fails', async () => {
			jest.spyOn(UserModel, 'find').mockImplementation(() => {
				throw new Error('db down');
			});

			await expect(applyEvent({ type: 'postLike', userId: persona._id, userPostId: post._id })).resolves.toBeUndefined();
			await expect(UserPostModel.exists({ _id: post._id, likes: persona._id })).resolves.toBeTruthy();
		});
	});

	describe('the unique index on a notification', () => {
		const DUPLICATE_KEY_CODE = 11000;
		let consoleError;

		beforeEach(() => {
			consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it('keeps one row and logs no error when the same comment is notified concurrently', async () => {
			const comment = await createComment(post, bob);

			await Promise.all(Array.from({ length: 5 }, () => notificationService.notifyComment({ commentId: comment._id })));

			await expect(countAll()).resolves.toBe(1);
			expect(consoleError).not.toHaveBeenCalled();
		});

		it('keeps one row and logs no error when the same follow is notified concurrently', async () => {
			await Promise.all(Array.from({ length: 5 }, () => notificationService.notifyFollow({ actorId: bob._id, recipientId: alice._id })));

			await expect(countAll()).resolves.toBe(1);
			expect(consoleError).not.toHaveBeenCalled();
		});

		it('keeps one row and logs no error when the same post like is notified concurrently', async () => {
			await Promise.all(Array.from({ length: 5 }, () => notificationService.notifyPostLike({ actorId: bob._id, userPostId: post._id })));

			await expect(countAll()).resolves.toBe(1);
			expect(consoleError).not.toHaveBeenCalled();
		});

		it('rejects an identical row at the database level', async () => {
			const fields = { recipientId: alice._id, actorId: bob._id, type: NOTIFICATION_TYPES.COMMENT, userPostId: post._id };

			await NotificationModel.create(fields);

			await expect(NotificationModel.create(fields)).rejects.toMatchObject({ code: DUPLICATE_KEY_CODE });
		});

		it('treats a duplicate key error from a create as a no-op', async () => {
			const comment = await createComment(post, bob);
			jest.spyOn(NotificationModel, 'create').mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: DUPLICATE_KEY_CODE }));

			await notificationService.notifyComment({ commentId: comment._id });

			expect(consoleError).not.toHaveBeenCalled();
		});

		it('treats a duplicate key error from an upsert as a no-op', async () => {
			jest.spyOn(NotificationModel, 'updateOne').mockRejectedValue(
				Object.assign(new Error('E11000 duplicate key'), { code: DUPLICATE_KEY_CODE }),
			);

			await notificationService.notifyFollow({ actorId: bob._id, recipientId: alice._id });

			expect(consoleError).not.toHaveBeenCalled();
		});

		it('still surfaces an error from a create that is not a duplicate', async () => {
			const comment = await createComment(post, bob);
			jest.spyOn(NotificationModel, 'create').mockRejectedValue(Object.assign(new Error('write failed'), { code: 121 }));

			await notificationService.notifyComment({ commentId: comment._id });

			expect(consoleError).toHaveBeenCalledWith(
				'Could not create a comment notification',
				expect.objectContaining({ message: 'write failed' }),
			);
		});

		it('still surfaces an error from an upsert that is not a duplicate', async () => {
			jest.spyOn(NotificationModel, 'updateOne').mockRejectedValue(new Error('write failed'));

			await notificationService.notifyFollow({ actorId: bob._id, recipientId: alice._id });

			expect(consoleError).toHaveBeenCalledWith('Could not create a follow notification', expect.objectContaining({ message: 'write failed' }));
		});

		it('does not block a comment and a reply from the same actor on the same post', async () => {
			const parent = await createComment(post, carol);

			await addComment({ userPostId: post._id, userId: bob._id, text: 'a comment' });
			await addComment({ userPostId: post._id, userId: bob._id, text: 'a reply', parentCommentId: parent._id });

			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.COMMENT, NOTIFICATION_TYPES.REPLY_ON_POST]);
			await expect(typesFor(carol)).resolves.toEqual([NOTIFICATION_TYPES.REPLY]);
			expect(consoleError).not.toHaveBeenCalled();
		});

		it('does not block several replies from the same actor to the same comment', async () => {
			const parent = await createComment(post, carol);

			await addComment({ userPostId: post._id, userId: bob._id, text: 'first', parentCommentId: parent._id });
			await addComment({ userPostId: post._id, userId: bob._id, text: 'second', parentCommentId: parent._id });

			await expect(typesFor(carol)).resolves.toEqual([NOTIFICATION_TYPES.REPLY, NOTIFICATION_TYPES.REPLY]);
			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.REPLY_ON_POST, NOTIFICATION_TYPES.REPLY_ON_POST]);
		});

		it('does not block a post like and a comment from the same actor on the same post', async () => {
			await likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id });
			await addComment({ userPostId: post._id, userId: bob._id, text: 'nice' });

			await expect(typesFor(alice)).resolves.toEqual([NOTIFICATION_TYPES.POST_LIKE, NOTIFICATION_TYPES.COMMENT]);
		});
	});

	describe('getUnreadCount', () => {
		it('counts only the unread notifications of the user', async () => {
			await followUser(id(bob), id(alice));
			await likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id });
			await followUser(id(alice), id(bob));

			await expect(notificationService.getUnreadCount(id(alice))).resolves.toEqual({ count: 2 });
			await expect(notificationService.getUnreadCount(id(bob))).resolves.toEqual({ count: 1 });
		});

		it('answers zero when there are none', async () => {
			await expect(notificationService.getUnreadCount(id(alice))).resolves.toEqual({ count: 0 });
		});

		it('drops to zero after everything is marked read', async () => {
			await followUser(id(bob), id(alice));
			await markAllReadNow(alice);

			await expect(notificationService.getUnreadCount(id(alice))).resolves.toEqual({ count: 0 });
		});
	});

	describe('markAllRead', () => {
		it('marks only the notifications of the user', async () => {
			await followUser(id(bob), id(alice));
			await followUser(id(alice), id(bob));

			await markAllReadNow(alice);

			await expect(NotificationModel.countDocuments({ recipientId: alice._id, isRead: true })).resolves.toBe(1);
			await expect(NotificationModel.countDocuments({ recipientId: bob._id, isRead: false })).resolves.toBe(1);
		});

		it('is harmless when nothing is unread', async () => {
			await expect(markAllReadNow(alice)).resolves.toBeUndefined();
		});

		it('keeps notifications created after the cutoff unread', async () => {
			await followUser(id(bob), id(alice));
			const cutoff = new Date(Date.now() + MINUTE_MS).toISOString();
			await NotificationModel.create({
				recipientId: alice._id,
				actorId: carol._id,
				type: NOTIFICATION_TYPES.FOLLOW,
				createdAt: new Date(Date.now() + 2 * MINUTE_MS),
			});

			await notificationService.markAllRead(id(alice), { cutoff });

			await expect(notificationService.getUnreadCount(id(alice))).resolves.toEqual({ count: 1 });
			await expect(NotificationModel.exists({ recipientId: alice._id, actorId: carol._id, isRead: false })).resolves.toBeTruthy();
		});

		it('marks a notification created exactly at the cutoff as read', async () => {
			const createdAt = new Date(Date.now() - MINUTE_MS);

			await NotificationModel.create({ recipientId: alice._id, actorId: bob._id, type: NOTIFICATION_TYPES.FOLLOW, createdAt });

			await notificationService.markAllRead(id(alice), { cutoff: createdAt.toISOString() });

			await expect(notificationService.getUnreadCount(id(alice))).resolves.toEqual({ count: 0 });
		});

		it('keeps a notification that arrives between the page fetch and the mark unread', async () => {
			await followUser(id(bob), id(alice));
			const { fetchedAt } = await notificationService.getNotifications(id(alice));
			await NotificationModel.create({
				recipientId: alice._id,
				actorId: carol._id,
				type: NOTIFICATION_TYPES.FOLLOW,
				createdAt: new Date(fetchedAt.getTime() + MINUTE_MS),
			});

			await notificationService.markAllRead(id(alice), { cutoff: fetchedAt.toISOString() });

			await expect(notificationService.getUnreadCount(id(alice))).resolves.toEqual({ count: 1 });
		});

		it.each([
			['missing', undefined],
			['an empty string', ''],
			['not a date', 'yesterday'],
			['a number', 1700000000000],
			['an array', ['2026-01-01T00:00:00.000Z']],
			['null', null],
		])('rejects a cutoff that is %s with 400 and marks nothing', async (_name, cutoff) => {
			await followUser(id(bob), id(alice));

			await expect(notificationService.markAllRead(id(alice), { cutoff })).rejects.toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.BAD_REQUEST,
			});
			await expect(notificationService.getUnreadCount(id(alice))).resolves.toEqual({ count: 1 });
		});

		it('rejects a call without options with 400', async () => {
			await expect(notificationService.markAllRead(id(alice))).rejects.toMatchObject({ statusCode: 400 });
		});
	});

	describe('getNotifications', () => {
		const insertNotifications = async (count, { recipient = alice, actor = bob, createdAt = () => new Date() } = {}) => {
			const likedPosts = [];

			for (let index = 0; index < count; index += 1) {
				likedPosts.push(await createPost(recipient));
			}

			return NotificationModel.insertMany(
				likedPosts.map((likedPost, index) => ({
					recipientId: recipient._id,
					actorId: actor._id,
					type: NOTIFICATION_TYPES.POST_LIKE,
					userPostId: likedPost._id,
					createdAt: createdAt(index),
				})),
			);
		};

		it('answers an empty page with no notifications', async () => {
			await expect(notificationService.getNotifications(id(alice))).resolves.toEqual({
				notifications: [],
				hasMore: false,
				nextCursor: null,
				unreadSince: null,
				fetchedAt: expect.any(Date),
			});
		});

		it('stamps the first page with the server time taken when the call started', async () => {
			const before = Date.now();

			const { fetchedAt } = await notificationService.getNotifications(id(alice));

			expect(fetchedAt.getTime()).toBeGreaterThanOrEqual(before);
			expect(fetchedAt.getTime()).toBeLessThanOrEqual(Date.now());
		});

		it('stamps later pages with their own fetch time as well', async () => {
			await insertNotifications(25, { createdAt: (index) => new Date(Date.now() - index * MINUTE_MS) });

			const first = await notificationService.getNotifications(id(alice));
			const second = await notificationService.getNotifications(id(alice), { cursor: first.nextCursor });

			expect(second.fetchedAt).toBeInstanceOf(Date);
		});

		it('lists the newest notification first', async () => {
			await followUser(id(bob), id(alice));
			await NotificationModel.updateMany({}, { $set: { createdAt: new Date(Date.now() - MINUTE_MS) } });
			await likeUserPost({ userPostId: post._id, userWhoLikedId: carol._id });

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(notifications.map((notification) => notification.type)).toEqual([NOTIFICATION_TYPES.POST_LIKE, NOTIFICATION_TYPES.FOLLOW]);
		});

		it('describes a follow with the actor and no post or excerpt', async () => {
			const withPicture = await UserModel.create({
				email: 'pic@example.com',
				username: 'pic',
				password: 'hashed-password',
				profilePicture: { imageUrl: 'https://cdn.example.com/pic.jpg', imageIdentifier: 'secret-identifier' },
			});

			await followUser(id(withPicture), id(alice));

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(notifications).toEqual([
				{
					_id: notifications[0]._id,
					type: NOTIFICATION_TYPES.FOLLOW,
					createdAt: notifications[0].createdAt,
					actor: { _id: withPicture._id, username: 'pic', profilePicture: { imageUrl: 'https://cdn.example.com/pic.jpg' } },
					post: null,
					excerpt: null,
				},
			]);
		});

		it('describes a comment with the post thumbnail and an excerpt of the text', async () => {
			await addComment({ userPostId: post._id, userId: bob._id, text: 'nice one' });

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(notifications[0]).toMatchObject({
				type: NOTIFICATION_TYPES.COMMENT,
				post: { _id: post._id, imageUrl: post.imageUrl, userId: alice._id },
				excerpt: 'nice one',
			});
		});

		it('collapses whitespace in the excerpt', async () => {
			await addComment({ userPostId: post._id, userId: bob._id, text: 'one\n\ntwo   three' });

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(notifications[0].excerpt).toBe('one two three');
		});

		it('keeps a text of exactly the maximum length whole', async () => {
			const text = 'a'.repeat(constants.NOTIFICATION_EXCERPT_MAX_LENGTH);

			await addComment({ userPostId: post._id, userId: bob._id, text });

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(notifications[0].excerpt).toBe(text);
		});

		it('cuts a longer text at the maximum length and adds an ellipsis', async () => {
			await addComment({ userPostId: post._id, userId: bob._id, text: 'a'.repeat(constants.NOTIFICATION_EXCERPT_MAX_LENGTH + 20) });

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(notifications[0].excerpt).toBe(
				`${'a'.repeat(constants.NOTIFICATION_EXCERPT_MAX_LENGTH)}${constants.NOTIFICATION_EXCERPT_ELLIPSIS}`,
			);
		});

		it('never exposes the actor private fields', async () => {
			await followUser(id(bob), id(alice));

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(Object.keys(notifications[0].actor).sort()).toEqual(['_id', 'profilePicture', 'username']);
		});

		it('returns only the notifications of the requesting user', async () => {
			await followUser(id(bob), id(alice));
			await followUser(id(alice), id(carol));

			const { notifications } = await notificationService.getNotifications(id(carol));

			expect(notifications.map((notification) => String(notification.actor._id))).toEqual([id(alice)]);
		});

		it('returns a full page of 20 and no more when exactly 20 exist', async () => {
			await insertNotifications(constants.NOTIFICATIONS_PAGE_SIZE);

			const page = await notificationService.getNotifications(id(alice));

			expect(page.notifications).toHaveLength(constants.NOTIFICATIONS_PAGE_SIZE);
			expect(page).toMatchObject({ hasMore: false, nextCursor: null });
		});

		it('returns 20 with a cursor when more exist, then the rest with the cursor', async () => {
			await insertNotifications(25, { createdAt: (index) => new Date(Date.now() - index * MINUTE_MS) });

			const first = await notificationService.getNotifications(id(alice));
			const second = await notificationService.getNotifications(id(alice), { cursor: first.nextCursor });

			expect(first.notifications).toHaveLength(constants.NOTIFICATIONS_PAGE_SIZE);
			expect(first.hasMore).toBe(true);
			expect(second.notifications).toHaveLength(5);
			expect(second).toMatchObject({ hasMore: false, nextCursor: null });
		});

		it('pages through ties on the same timestamp without repeating or skipping any', async () => {
			const sameTime = new Date();

			await insertNotifications(45, { createdAt: () => sameTime });

			const first = await notificationService.getNotifications(id(alice));
			const second = await notificationService.getNotifications(id(alice), { cursor: first.nextCursor });
			const third = await notificationService.getNotifications(id(alice), { cursor: second.nextCursor });
			const ids = [...first.notifications, ...second.notifications, ...third.notifications].map((notification) => String(notification._id));

			expect(ids).toHaveLength(45);
			expect(new Set(ids).size).toBe(45);
		});

		it('rejects a malformed cursor with 400', async () => {
			await expect(notificationService.getNotifications(id(alice), { cursor: 'nonsense' })).rejects.toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.BAD_REQUEST,
			});
		});

		it('rejects a cursor that is not a string with 400', async () => {
			await expect(notificationService.getNotifications(id(alice), { cursor: ['a', 'b'] })).rejects.toMatchObject({ statusCode: 400 });
		});

		it('leaves out a notification whose actor was deleted without failing the list', async () => {
			await followUser(id(bob), id(alice));
			await followUser(id(carol), id(alice));
			await UserModel.deleteOne({ _id: bob._id });

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(notifications.map((notification) => String(notification.actor._id))).toEqual([id(carol)]);
		});

		it('leaves out a notification whose post was deleted without failing the list', async () => {
			await likeUserPost({ userPostId: post._id, userWhoLikedId: bob._id });
			await followUser(id(carol), id(alice));
			await UserPostModel.deleteOne({ _id: post._id });

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(notifications.map((notification) => notification.type)).toEqual([NOTIFICATION_TYPES.FOLLOW]);
		});

		it('leaves out a comment notification whose comment was deleted without failing the list', async () => {
			const comment = await addComment({ userPostId: post._id, userId: bob._id, text: 'hello' });

			await followUser(id(carol), id(alice));
			await CommentModel.deleteOne({ _id: comment._id });

			const { notifications } = await notificationService.getNotifications(id(alice));

			expect(notifications.map((notification) => notification.type)).toEqual([NOTIFICATION_TYPES.FOLLOW]);
		});

		it('still counts a notification with a missing reference as unread', async () => {
			await followUser(id(bob), id(alice));
			await UserModel.deleteOne({ _id: bob._id });

			await expect(notificationService.getUnreadCount(id(alice))).resolves.toEqual({ count: 1 });
		});

		describe('unreadSince', () => {
			it('is the creation time of the oldest unread notification on the first page', async () => {
				const oldest = new Date(Date.now() - 3 * MINUTE_MS);

				await insertNotifications(1, { createdAt: () => oldest });
				await insertNotifications(1, { createdAt: () => new Date() });

				const page = await notificationService.getNotifications(id(alice));

				expect(page.unreadSince).toEqual(oldest);
			});

			it('ignores notifications that are already read', async () => {
				await insertNotifications(1, { createdAt: () => new Date(Date.now() - 5 * MINUTE_MS) });
				await markAllReadNow(alice);
				await insertNotifications(1, { createdAt: () => new Date() });

				const page = await notificationService.getNotifications(id(alice));

				expect(page.unreadSince.getTime()).toBeGreaterThan(Date.now() - MINUTE_MS);
			});

			it('is null when everything is read', async () => {
				await followUser(id(bob), id(alice));
				await markAllReadNow(alice);

				const page = await notificationService.getNotifications(id(alice));

				expect(page.unreadSince).toBeNull();
			});

			it('is left out of later pages', async () => {
				await insertNotifications(25, { createdAt: (index) => new Date(Date.now() - index * MINUTE_MS) });

				const first = await notificationService.getNotifications(id(alice));
				const second = await notificationService.getNotifications(id(alice), { cursor: first.nextCursor });

				expect(second).not.toHaveProperty('unreadSince');
			});

			it('does not depend on other users unread notifications', async () => {
				await insertNotifications(1, { recipient: bob, actor: alice, createdAt: () => new Date(Date.now() - 9 * MINUTE_MS) });

				const page = await notificationService.getNotifications(id(alice));

				expect(page.unreadSince).toBeNull();
			});
		});
	});
});
