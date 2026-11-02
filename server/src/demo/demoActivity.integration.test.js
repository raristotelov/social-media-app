const mongoose = require('mongoose');

const { cloudinary } = require('../config/cloudinary');
const CommentModel = require('../models/commentModel');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const StoryModel = require('../models/storyModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const config = require('./demoConfig');
const { createCaptionPicker } = require('./contentPlanning');
const { floorToHour, runDemoActivity } = require('./demoActivity');
const { loadDemoData } = require('./loadDemoData');
const { createRandom } = require('./random');
const { loadFixture, startDatabase, stopDatabase, seedDatabase, installStoryUploadMock, sourceOfPost } = require('./demoTestSupport');

jest.mock('../config/cloudinary', () => ({
	cloudinary: { uploader: { upload: jest.fn() } },
}));

jest.mock('./loadDemoData', () => ({
	loadDemoData: jest.fn(),
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 120 * 1000;
const HOUR_MS = config.HOUR_MS;
const DAY_MS = config.DAY_MS;
const SEED_NOW = new Date('2026-10-29T12:30:00.000Z');
const NIGHT_SEED_NOW = new Date('2026-10-29T03:59:00.000Z');
const NIGHT_RUN_NOW = new Date('2026-10-29T04:00:00.000Z');
const STORY_COPY_FOLDER = 'demo-users/story-copies';

jest.setTimeout(TEST_TIMEOUT_MS);

const fixture = loadFixture();

const hoursAfter = (date, hours) => new Date(date.getTime() + hours * HOUR_MS);

const daysBefore = (date, days) => new Date(date.getTime() - days * DAY_MS);

const stringIds = (values) => values.map(String);

const photoUrl = (source) => `https://cdn.example.com/demo-users/${source}`;

const loadStatesByUserId = async () => new Map((await DemoAccountStateModel.find().lean()).map((state) => [String(state.userId), state]));

const loadUsersById = async () => new Map((await UserModel.find().lean()).map((user) => [String(user._id), user]));

const countAll = async () => ({
	users: await UserModel.countDocuments(),
	posts: await UserPostModel.countDocuments(),
	comments: await CommentModel.countDocuments(),
	stories: await StoryModel.countDocuments(),
	events: await DemoScheduledEventModel.countDocuments(),
});

const setLastCompletedHour = (date) => DemoActivityRunModel.updateOne({}, { lastCompletedHour: date });

const prepareRun = async (seedNow) => {
	await seedDatabase(fixture, seedNow);
	loadDemoData.mockResolvedValue(fixture);
	installStoryUploadMock(cloudinary.uploader.upload);
};

const createManualPost = (userId, createdAt, extra = {}) => {
	const identifier = `manual-${new mongoose.Types.ObjectId()}`;

	return UserPostModel.create({
		imageIdentifier: identifier,
		imageUrl: `https://cdn.example.com/${identifier}.jpg`,
		imageWidth: 100,
		imageHeight: 100,
		userId,
		createdAt,
		updatedAt: createdAt,
		...extra,
	});
};

describe('runDemoActivity against a real database', () => {
	let mongoServer;

	beforeAll(async () => {
		mongoServer = await startDatabase();
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await stopDatabase(mongoServer);
	});

	describe('when there is no DemoActivityRun', () => {
		let before;
		let result;

		beforeAll(async () => {
			await prepareRun(SEED_NOW);
			await DemoActivityRunModel.deleteMany({});

			before = { counts: await countAll(), states: await loadStatesByUserId(), users: await loadUsersById() };
			result = await runDemoActivity({ now: hoursAfter(SEED_NOW, 30), random: createRandom(1) });
		});

		it('should return { hoursRun: 0 }', () => {
			expect(result).toEqual({ hoursRun: 0 });
		});

		it('should not create or remove any documents', async () => {
			expect(await countAll()).toEqual(before.counts);
		});

		it('should not change the account states', async () => {
			expect(await loadStatesByUserId()).toEqual(before.states);
		});

		it('should not change the follow graph', async () => {
			expect(await loadUsersById()).toEqual(before.users);
		});

		it('should not upload any story copy', () => {
			expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
		});

		it('should not create a DemoActivityRun', async () => {
			expect(await DemoActivityRunModel.countDocuments()).toBe(0);
		});
	});

	describe('catching up hours', () => {
		let firstResult;
		let lastCompletedAfterFirst;
		let afterFirst;
		let secondResult;
		let afterSecond;
		let thirdResult;
		let lastCompletedAfterThird;

		beforeAll(async () => {
			await prepareRun(SEED_NOW);

			firstResult = await runDemoActivity({ now: new Date('2026-10-29T17:45:00.000Z'), random: createRandom(2) });
			lastCompletedAfterFirst = (await DemoActivityRunModel.findOne()).lastCompletedHour;
			afterFirst = { counts: await countAll(), states: await loadStatesByUserId(), users: await loadUsersById() };

			secondResult = await runDemoActivity({ now: new Date('2026-10-29T17:45:00.000Z'), random: createRandom(3) });
			afterSecond = { counts: await countAll(), states: await loadStatesByUserId(), users: await loadUsersById() };

			thirdResult = await runDemoActivity({ now: new Date('2026-10-29T18:05:00.000Z'), random: createRandom(3) });
			lastCompletedAfterThird = (await DemoActivityRunModel.findOne()).lastCompletedHour;
		});

		it('should run exactly the completed hours since lastCompletedHour', () => {
			expect(firstResult).toEqual({ hoursRun: 5 });
		});

		it('should set lastCompletedHour to the last completed hour', () => {
			expect(lastCompletedAfterFirst).toEqual(new Date('2026-10-29T16:00:00.000Z'));
		});

		it('should run 0 hours when called again in the same hour', () => {
			expect(secondResult).toEqual({ hoursRun: 0 });
		});

		it('should change nothing when called again in the same hour', () => {
			expect(afterSecond).toEqual(afterFirst);
		});

		it('should run exactly one more hour when the next hour has completed', () => {
			expect(thirdResult).toEqual({ hoursRun: 1 });
			expect(lastCompletedAfterThird).toEqual(new Date('2026-10-29T17:00:00.000Z'));
		});

		it('should not run the hour that is still in progress', async () => {
			await prepareRun(SEED_NOW);

			expect(await runDemoActivity({ now: new Date('2026-10-29T12:59:00.000Z'), random: createRandom(2) })).toEqual({ hoursRun: 0 });
		});

		it('should expose floorToHour as the start of the hour in UTC', () => {
			expect(floorToHour(new Date('2026-10-29T17:45:12.345Z'))).toEqual(new Date('2026-10-29T17:00:00.000Z'));
		});
	});

	describe('catching up after a long gap (10 days)', () => {
		const now = new Date('2026-11-08T12:30:00.000Z');
		const firstCaughtUpHour = new Date('2026-11-05T12:00:00.000Z');
		let before;
		let result;

		beforeAll(async () => {
			await prepareRun(SEED_NOW);

			before = { users: await loadUsersById() };
			result = await runDemoActivity({ now, random: createRandom(7) });
		});

		it('should cap the catch-up at the last 72 hours', () => {
			expect(result).toEqual({ hoursRun: config.MAX_CATCH_UP_HOURS });
		});

		it('should set lastCompletedHour to the last completed hour', async () => {
			expect((await DemoActivityRunModel.findOne()).lastCompletedHour).toEqual(new Date('2026-11-08T11:00:00.000Z'));
		});

		it('should not create anything for hours older than the 72 hour cap', async () => {
			const posts = await UserPostModel.find({ createdAt: { $gt: SEED_NOW } }).lean();

			expect(posts.length).toBeGreaterThan(0);
			expect(posts.filter((post) => post.createdAt < firstCaughtUpHour)).toEqual([]);
		});

		it('should still create posts for caught-up hours older than 24 hours', async () => {
			const oldPosts = await UserPostModel.find({ createdAt: { $gte: firstCaughtUpHour, $lt: floorToHour(new Date(now.getTime() - DAY_MS)) } });

			expect(oldPosts.length).toBeGreaterThan(0);
		});

		it('should create stories only for hours within the last 24 hours', async () => {
			const stories = await StoryModel.find().lean();
			const oldestAllowed = floorToHour(new Date(now.getTime() - DAY_MS));

			expect(stories.length).toBeGreaterThan(0);
			expect(stories.filter((story) => story.createdAt < oldestAllowed)).toEqual([]);
		});

		it('should create no story for the caught-up hours older than 24 hours', async () => {
			const staleStories = await StoryModel.countDocuments({ createdAt: { $lt: floorToHour(new Date(now.getTime() - DAY_MS)) } });

			expect(staleStories).toBe(0);
		});

		it('should only add symmetric follow edges, both in followers and following', async () => {
			const users = await loadUsersById();
			const asymmetric = [...users.values()].filter(
				(user) =>
					user.following.some((followedId) => !stringIds(users.get(String(followedId)).followers).includes(String(user._id))) ||
					user.followers.some((followerId) => !stringIds(users.get(String(followerId)).following).includes(String(user._id))),
			);

			expect(asymmetric).toEqual([]);
		});

		it('should never create a self-follow', async () => {
			const users = await loadUsersById();

			expect(
				[...users.values()].filter(
					(user) => stringIds(user.following).includes(String(user._id)) || stringIds(user.followers).includes(String(user._id)),
				),
			).toEqual([]);
		});

		it('should never list the same account twice in followers or following', async () => {
			const users = await loadUsersById();

			expect(
				[...users.values()].filter(
					(user) =>
						new Set(stringIds(user.following)).size !== user.following.length ||
						new Set(stringIds(user.followers)).size !== user.followers.length,
				),
			).toEqual([]);
		});

		it('should add new follow edges', async () => {
			const users = await loadUsersById();
			const added = [...users.values()].flatMap((user) => {
				const previous = new Set(stringIds(before.users.get(String(user._id)).following));

				return stringIds(user.following).filter((followedId) => !previous.has(followedId));
			});

			expect(added.length).toBeGreaterThan(0);
		});

		it('should remove an edge from both sides when somebody unfollows', async () => {
			const users = await loadUsersById();
			const removed = [...users.values()].flatMap((user) => {
				const current = new Set(stringIds(user.following));

				return stringIds(before.users.get(String(user._id)).following)
					.filter((followedId) => !current.has(followedId))
					.map((followedId) => ({ followerId: String(user._id), followedId }));
			});

			expect(removed.length).toBeGreaterThan(0);
			expect(removed.filter(({ followerId, followedId }) => stringIds(users.get(followedId).followers).includes(followerId))).toEqual([]);
		});

		it('should leave no state.posted entry pointing at a post that no longer exists', async () => {
			const states = await loadStatesByUserId();
			const postIds = new Set(stringIds((await UserPostModel.find().select({ _id: 1 }).lean()).map((post) => post._id)));
			const dangling = [...states.values()].flatMap((state) => state.posted.filter((entry) => !postIds.has(String(entry.postId))));

			expect(dangling).toEqual([]);
		});
	});

	describe('an overnight run from the seed hour to the next morning', () => {
		const now = new Date('2026-10-30T09:15:00.000Z');
		let initialStates;
		let initialPostIds;
		let result;
		let newPosts;
		let newPostIds;
		let finalStates;

		beforeAll(async () => {
			await prepareRun(SEED_NOW);

			initialStates = await loadStatesByUserId();
			initialPostIds = new Set(stringIds((await UserPostModel.find().select({ _id: 1 }).lean()).map((post) => post._id)));
			result = await runDemoActivity({ now, random: createRandom(42) });
			newPosts = (await UserPostModel.find().lean()).filter((post) => !initialPostIds.has(String(post._id)));
			newPostIds = new Set(stringIds(newPosts.map((post) => post._id)));
			finalStates = await loadStatesByUserId();
		});

		it('should run every completed hour up to the morning', () => {
			expect(result).toEqual({ hoursRun: 21 });
		});

		describe('new posts', () => {
			it('should create new posts', () => {
				expect(newPosts.length).toBeGreaterThan(0);
			});

			it('should only post from accounts that had a photo queued', () => {
				const withoutQueue = newPosts.filter((post) => initialStates.get(String(post.userId)).queue.length === 0);

				expect(withoutQueue).toEqual([]);
			});

			it('should take the photos from the front of each account queue, in order', () => {
				const mismatches = [];

				for (const [userId, initial] of initialStates) {
					const postedSources = finalStates
						.get(userId)
						.posted.filter((entry) => newPostIds.has(String(entry.postId)))
						.map((entry) => entry.source);

					if (JSON.stringify(postedSources) !== JSON.stringify(initial.queue.slice(0, postedSources.length))) {
						mismatches.push(userId);
					}
				}

				expect(mismatches).toEqual([]);
			});

			it('should leave the rest of each queue in place behind the photos that were posted', () => {
				const mismatches = [];

				for (const [userId, initial] of initialStates) {
					const postedCount = finalStates.get(userId).posted.filter((entry) => newPostIds.has(String(entry.postId))).length;
					const remaining = initial.queue.slice(postedCount);

					if (JSON.stringify(finalStates.get(userId).queue.slice(0, remaining.length)) !== JSON.stringify(remaining)) {
						mismatches.push(userId);
					}
				}

				expect(mismatches).toEqual([]);
			});

			it('should record every new post in state.posted with its source and caption, not permanent', () => {
				const mismatches = newPosts.filter((post) => {
					const entry = finalStates.get(String(post.userId)).posted.find((candidate) => String(candidate.postId) === String(post._id));

					return !entry || entry.source !== sourceOfPost(post) || entry.caption !== post.caption || entry.permanent !== false;
				});

				expect(mismatches).toEqual([]);
			});

			it('should add every new post to the posts array of its user', async () => {
				const users = await loadUsersById();
				const missing = newPosts.filter((post) => !stringIds(users.get(String(post.userId)).posts).includes(String(post._id)));

				expect(missing).toEqual([]);
			});

			it('should create the posts within the posting hours, 08:00 to 22:59 UTC', () => {
				const outside = newPosts.filter(
					(post) => post.createdAt.getUTCHours() < config.FIRST_POSTING_HOUR || post.createdAt.getUTCHours() > config.LAST_POSTING_HOUR,
				);

				expect(outside).toEqual([]);
			});

			it('should never date a post after now', () => {
				expect(newPosts.filter((post) => post.createdAt > now)).toEqual([]);
			});

			it('should never date a post before the first caught-up hour', () => {
				expect(newPosts.filter((post) => post.createdAt < floorToHour(SEED_NOW))).toEqual([]);
			});

			it('should set updatedAt equal to createdAt on new posts', () => {
				expect(newPosts.filter((post) => post.updatedAt.getTime() !== post.createdAt.getTime())).toEqual([]);
			});

			it('should copy the photo url and dimensions from the manifest', () => {
				expect(
					newPosts.filter((post) => post.imageUrl !== photoUrl(sourceOfPost(post)) || post.imageWidth !== 800 || post.imageHeight !== 600),
				).toEqual([]);
			});

			it('should not use any imageIdentifier twice', async () => {
				const identifiers = (await UserPostModel.find().select({ imageIdentifier: 1 }).lean()).map((post) => post.imageIdentifier);

				expect(new Set(identifiers).size).toBe(identifiers.length);
			});

			it('should not repost a photo that is still posted', () => {
				const stillPosted = newPosts.filter((post) =>
					initialStates.get(String(post.userId)).posted.some((entry) => entry.source === sourceOfPost(post)),
				);

				expect(stillPosted).toEqual([]);
			});
		});

		describe('scheduled engagement', () => {
			it('should leave only events that are not yet due', async () => {
				const due = await DemoScheduledEventModel.countDocuments({ dueAt: { $lte: now } });

				expect(due).toBe(0);
			});

			it('should keep events for the new posts that are due later', async () => {
				expect(await DemoScheduledEventModel.countDocuments({ dueAt: { $gt: now } })).toBeGreaterThan(0);
			});

			it('should only hold events for the new posts', async () => {
				const events = await DemoScheduledEventModel.find().lean();

				expect(events.filter((event) => !newPostIds.has(String(event.userPostId)))).toEqual([]);
			});

			it('should have applied the due likes to the new posts', () => {
				expect(newPosts.reduce((sum, post) => sum + post.likes.length, 0)).toBeGreaterThan(0);
			});

			it('should never let an owner like their own new post', () => {
				expect(newPosts.filter((post) => stringIds(post.likes).includes(String(post.userId)))).toEqual([]);
			});

			it('should never hold the same like twice on a new post', () => {
				expect(newPosts.filter((post) => new Set(stringIds(post.likes)).size !== post.likes.length)).toEqual([]);
			});

			it('should have created the due comments on the new posts', async () => {
				expect(await CommentModel.countDocuments({ userPostId: { $in: [...newPostIds] } })).toBeGreaterThan(0);
			});

			it('should keep commentsCount equal to the number of comments including replies', async () => {
				const comments = await CommentModel.find({ userPostId: { $in: [...newPostIds] } }).lean();
				const countByPost = new Map();

				comments.forEach((comment) => countByPost.set(String(comment.userPostId), (countByPost.get(String(comment.userPostId)) || 0) + 1));

				expect(newPosts.filter((post) => post.commentsCount !== (countByPost.get(String(post._id)) || 0))).toEqual([]);
			});

			it('should date every applied comment after its post and not after now', async () => {
				const postsById = new Map(newPosts.map((post) => [String(post._id), post]));
				const comments = await CommentModel.find({ userPostId: { $in: [...newPostIds] } }).lean();

				expect(
					comments.filter((comment) => comment.createdAt > now || comment.createdAt < postsById.get(String(comment.userPostId)).createdAt),
				).toEqual([]);
			});

			it('should create replies only under an existing comment, authored by the post owner and dated after it', async () => {
				const postsById = new Map(newPosts.map((post) => [String(post._id), post]));
				const comments = await CommentModel.find({ userPostId: { $in: [...newPostIds] } }).lean();
				const commentsById = new Map(comments.map((comment) => [String(comment._id), comment]));
				const replies = comments.filter((comment) => comment.parentCommentId);
				const invalid = replies.filter((reply) => {
					const parent = commentsById.get(String(reply.parentCommentId));

					return (
						!parent ||
						String(reply.userId) !== String(postsById.get(String(reply.userPostId)).userId) ||
						String(reply.mentionedUserId) !== String(parent.userId) ||
						reply.createdAt < parent.createdAt
					);
				});

				expect(invalid).toEqual([]);
			});

			it('should have added comment likes', async () => {
				const comments = await CommentModel.find({ userPostId: { $in: [...newPostIds] } }).lean();

				expect(comments.filter((comment) => comment.likes.length > 0).length).toBeGreaterThan(0);
			});
		});

		describe('stories', () => {
			let stories;

			beforeAll(async () => {
				stories = await StoryModel.find().lean();
			});

			it('should create stories', () => {
				expect(stories.length).toBeGreaterThan(0);
			});

			it('should create one Cloudinary copy for every story', () => {
				expect(cloudinary.uploader.upload).toHaveBeenCalledTimes(stories.length);
			});

			it('should upload each copy into the story copies folder', () => {
				cloudinary.uploader.upload.mock.calls.forEach(([, options]) => {
					expect(options).toEqual({ resource_type: 'image', folder: STORY_COPY_FOLDER });
				});
			});

			it('should store the copy as the story image, never the post image', async () => {
				const postIdentifiers = new Set(
					(await UserPostModel.find().select({ imageIdentifier: 1 }).lean()).map((post) => post.imageIdentifier),
				);

				expect(
					stories.filter(
						(story) => postIdentifiers.has(story.imageIdentifier) || !story.imageIdentifier.startsWith(`${STORY_COPY_FOLDER}/`),
					),
				).toEqual([]);
			});

			it('should copy one of the account own photos for each story', () => {
				const mismatches = stories.filter((story) => {
					const copyNumber = Number(story.imageIdentifier.split('copy-')[1]);
					const [uploadedUrl] = cloudinary.uploader.upload.mock.calls[copyNumber - 1];
					const ownUrls = initialStates.get(String(story.userId)).ownPhotos.map(photoUrl);

					return !ownUrls.includes(uploadedUrl);
				});

				expect(mismatches).toEqual([]);
			});

			it('should only create stories for demo accounts', () => {
				expect(stories.filter((story) => !initialStates.has(String(story.userId)))).toEqual([]);
			});

			it('should only create lurker stories for lurkers who still have photos to post', () => {
				const invalid = stories.filter((story) => {
					const state = initialStates.get(String(story.userId));

					return state.tier === 'lurker' && state.queue.length === 0;
				});

				expect(invalid).toEqual([]);
			});

			it('should date every story within its hour of the run and not after now', () => {
				expect(stories.filter((story) => story.createdAt > now || story.createdAt < floorToHour(SEED_NOW))).toEqual([]);
			});
		});
	});

	describe('applying scheduled events once they are due', () => {
		const now = new Date('2026-10-29T12:30:00.000Z');
		let owner;
		let likerB;
		let commenterC;
		let post;
		let parentCommentId;
		let replyId;
		let lateCommentId;
		let result;

		const at = (minutes) => new Date(`2026-10-29T12:${String(minutes).padStart(2, '0')}:00.000Z`);

		beforeAll(async () => {
			await prepareRun(SEED_NOW);
			await setLastCompletedHour(new Date('2026-10-29T11:00:00.000Z'));

			[owner, likerB, commenterC] = (await DemoAccountStateModel.find().limit(3).lean()).map((state) => state.userId);
			post = await createManualPost(owner, at(0));
			parentCommentId = new mongoose.Types.ObjectId();
			replyId = new mongoose.Types.ObjectId();
			lateCommentId = new mongoose.Types.ObjectId();

			await DemoScheduledEventModel.insertMany([
				{ dueAt: at(5), type: 'postLike', userPostId: post._id, userId: likerB },
				{ dueAt: at(6), type: 'postLike', userPostId: post._id, userId: likerB },
				{ dueAt: at(10), type: 'comment', userPostId: post._id, userId: commenterC, commentId: parentCommentId, text: 'Great shot' },
				{ dueAt: at(15), type: 'commentLike', userPostId: post._id, userId: likerB, commentId: parentCommentId },
				{
					dueAt: at(20),
					type: 'comment',
					userPostId: post._id,
					userId: owner,
					commentId: replyId,
					text: 'Thanks',
					parentCommentId,
					mentionedUserId: commenterC,
				},
				{ dueAt: at(50), type: 'postLike', userPostId: post._id, userId: commenterC },
				{ dueAt: at(59), type: 'comment', userPostId: post._id, userId: likerB, commentId: lateCommentId, text: 'Later' },
			]);

			result = await runDemoActivity({ now, random: createRandom(5) });
		});

		it('should run no hours, only applying what is due', () => {
			expect(result).toEqual({ hoursRun: 0 });
		});

		it('should add the due like once even when it was scheduled twice', async () => {
			expect(stringIds((await UserPostModel.findById(post._id)).likes)).toEqual([String(likerB)]);
		});

		it('should create the due comment with its text, author and due time', async () => {
			const comment = await CommentModel.findById(parentCommentId);

			expect(comment).toEqual(expect.objectContaining({ text: 'Great shot', createdAt: at(10) }));
			expect(String(comment.userId)).toBe(String(commenterC));
			expect(String(comment.userPostId)).toBe(String(post._id));
		});

		it('should create the due reply with its parent and mention', async () => {
			const reply = await CommentModel.findById(replyId);

			expect(String(reply.parentCommentId)).toBe(String(parentCommentId));
			expect(String(reply.mentionedUserId)).toBe(String(commenterC));
			expect(String(reply.userId)).toBe(String(owner));
		});

		it('should set commentsCount to the number of comments created', async () => {
			expect((await UserPostModel.findById(post._id)).commentsCount).toBe(2);
		});

		it('should add the due comment like', async () => {
			expect(stringIds((await CommentModel.findById(parentCommentId)).likes)).toEqual([String(likerB)]);
		});

		it('should not apply an event that is due later in the hour', async () => {
			expect(stringIds((await UserPostModel.findById(post._id)).likes)).not.toContain(String(commenterC));
			expect(await CommentModel.findById(lateCommentId)).toBeNull();
		});

		it('should keep only the events that are not yet due', async () => {
			const remaining = await DemoScheduledEventModel.find().lean();

			expect(remaining.map((event) => event.dueAt.getTime()).sort()).toEqual([at(50).getTime(), at(59).getTime()]);
		});

		it('should not apply anything twice when run again at the same time', async () => {
			await runDemoActivity({ now, random: createRandom(6) });

			const updated = await UserPostModel.findById(post._id);

			expect(updated.commentsCount).toBe(2);
			expect(updated.likes).toHaveLength(1);
			expect(await DemoScheduledEventModel.countDocuments()).toBe(2);
		});
	});

	describe('applying a like once its time has come later in the same hour', () => {
		let post;
		let liker;
		let lateCommentId;

		beforeAll(async () => {
			await prepareRun(SEED_NOW);
			await setLastCompletedHour(new Date('2026-10-29T11:00:00.000Z'));

			const [ownerId, likerId] = (await DemoAccountStateModel.find().limit(2).lean()).map((state) => state.userId);

			liker = likerId;
			post = await createManualPost(ownerId, new Date('2026-10-29T12:00:00.000Z'));
			lateCommentId = new mongoose.Types.ObjectId();

			await DemoScheduledEventModel.insertMany([
				{ dueAt: new Date('2026-10-29T12:50:00.000Z'), type: 'postLike', userPostId: post._id, userId: likerId },
				{
					dueAt: new Date('2026-10-29T12:59:00.000Z'),
					type: 'comment',
					userPostId: post._id,
					userId: likerId,
					commentId: lateCommentId,
					text: 'Later',
				},
			]);

			await runDemoActivity({ now: new Date('2026-10-29T12:30:00.000Z'), random: createRandom(5) });
			await runDemoActivity({ now: new Date('2026-10-29T12:55:00.000Z'), random: createRandom(6) });
		});

		it('should add the like that became due after the first run', async () => {
			expect(stringIds((await UserPostModel.findById(post._id)).likes)).toEqual([String(liker)]);
		});

		it('should still hold the comment that is not due at 12:55', async () => {
			expect(await CommentModel.findById(lateCommentId)).toBeNull();
			expect(await DemoScheduledEventModel.countDocuments({ commentId: lateCommentId })).toBe(1);
		});
	});

	describe('events that can no longer be applied', () => {
		const now = new Date('2026-10-29T12:30:00.000Z');
		let userA;
		let userB;

		beforeAll(async () => {
			await prepareRun(SEED_NOW);
			await setLastCompletedHour(new Date('2026-10-29T11:00:00.000Z'));

			[userA, userB] = (await DemoAccountStateModel.find().limit(2).lean()).map((state) => state.userId);
		});

		it('should drop a comment for a post that no longer exists without creating it', async () => {
			const commentId = new mongoose.Types.ObjectId();

			await DemoScheduledEventModel.create({
				dueAt: new Date('2026-10-29T12:10:00.000Z'),
				type: 'comment',
				userPostId: new mongoose.Types.ObjectId(),
				userId: userB,
				commentId,
				text: 'Orphan',
			});

			await runDemoActivity({ now, random: createRandom(1) });

			expect(await CommentModel.findById(commentId)).toBeNull();
			expect(await DemoScheduledEventModel.countDocuments()).toBe(0);
		});

		it('should not create a reply whose parent comment does not exist', async () => {
			const post = await createManualPost(userA, new Date('2026-10-29T12:00:00.000Z'));
			const replyId = new mongoose.Types.ObjectId();

			await DemoScheduledEventModel.create({
				dueAt: new Date('2026-10-29T12:10:00.000Z'),
				type: 'comment',
				userPostId: post._id,
				userId: userA,
				commentId: replyId,
				text: 'Reply',
				parentCommentId: new mongoose.Types.ObjectId(),
				mentionedUserId: userB,
			});

			await runDemoActivity({ now, random: createRandom(1) });

			expect(await CommentModel.findById(replyId)).toBeNull();
			expect((await UserPostModel.findById(post._id)).commentsCount).toBe(0);
		});

		it('should not count a comment twice when it already exists', async () => {
			const post = await createManualPost(userA, new Date('2026-10-29T12:00:00.000Z'), { commentsCount: 1 });
			const comment = await CommentModel.create({ userPostId: post._id, userId: userB, text: 'Already there' });

			await DemoScheduledEventModel.create({
				dueAt: new Date('2026-10-29T12:10:00.000Z'),
				type: 'comment',
				userPostId: post._id,
				userId: userB,
				commentId: comment._id,
				text: 'Already there',
			});

			await runDemoActivity({ now, random: createRandom(1) });

			expect((await UserPostModel.findById(post._id)).commentsCount).toBe(1);
			expect(await CommentModel.countDocuments({ userPostId: post._id })).toBe(1);
		});
	});

	describe('daily minimums', () => {
		const lastCompletedBeforeDay = new Date('2026-11-03T07:00:00.000Z');
		const now = new Date('2026-11-03T23:30:00.000Z');
		const startOfDay = new Date('2026-11-03T00:00:00.000Z');
		const endOfDay = new Date('2026-11-04T00:00:00.000Z');
		const quietRandom = () => 0.999;

		describe.each([
			['an unlucky draw where nothing is chosen at random', () => quietRandom],
			['a seeded random draw', () => createRandom(11)],
		])('with %s', (description, makeRandom) => {
			let result;

			beforeAll(async () => {
				await prepareRun(SEED_NOW);
				await setLastCompletedHour(lastCompletedBeforeDay);
				result = await runDemoActivity({ now, random: makeRandom() });
			});

			it('should run the 15 posting hours of the day', () => {
				expect(result).toEqual({ hoursRun: 15 });
			});

			it('should have created at least 10 posts that UTC day by the end of the 22:00 hour', async () => {
				expect(await UserPostModel.countDocuments({ createdAt: { $gte: startOfDay, $lt: endOfDay } })).toBeGreaterThanOrEqual(
					config.MIN_POSTS_PER_DAY,
				);
			});

			it('should have created at least 15 stories that UTC day by the end of the 22:00 hour', async () => {
				expect(await StoryModel.countDocuments({ createdAt: { $gte: startOfDay, $lt: endOfDay } })).toBeGreaterThanOrEqual(
					config.MIN_STORIES_PER_DAY,
				);
			});

			it('should not create anything dated after the 22:00 hour', async () => {
				const lateDocuments =
					(await UserPostModel.countDocuments({ createdAt: { $gte: new Date('2026-11-03T23:00:00.000Z') } })) +
					(await StoryModel.countDocuments({ createdAt: { $gte: new Date('2026-11-03T23:00:00.000Z') } }));

				expect(lateDocuments).toBe(0);
			});
		});
	});

	describe('daily minimum of new follows', () => {
		const quietRandom = () => 0.999;
		const countFollowEdges = async () => [...(await loadUsersById()).values()].reduce((sum, user) => sum + user.following.length, 0);

		const runFrom = async ({ lastCompletedHour, now, random, run = {} }) => {
			await prepareRun(SEED_NOW);
			await DemoActivityRunModel.updateOne({}, { lastCompletedHour, ...run });

			const edgesBefore = await countFollowEdges();
			const result = await runDemoActivity({ now, random });

			return {
				result,
				added: (await countFollowEdges()) - edgesBefore,
				run: await DemoActivityRunModel.findOne().lean(),
			};
		};

		it('should create at least 5 follows on the day even when nothing is drawn at random', async () => {
			const { run, added } = await runFrom({
				lastCompletedHour: new Date('2026-11-03T07:00:00.000Z'),
				now: new Date('2026-11-03T23:30:00.000Z'),
				random: quietRandom,
			});

			expect(added).toBe(config.MIN_FOLLOWS_PER_DAY);
			expect(run.followCount).toBe(config.MIN_FOLLOWS_PER_DAY);
			expect(run.followDay).toEqual(new Date('2026-11-03T00:00:00.000Z'));
		});

		it('should create at least 5 follows on the day with a seeded draw', async () => {
			const { run } = await runFrom({
				lastCompletedHour: new Date('2026-11-03T07:00:00.000Z'),
				now: new Date('2026-11-03T23:30:00.000Z'),
				random: createRandom(31),
			});

			expect(run.followCount).toBeGreaterThanOrEqual(config.MIN_FOLLOWS_PER_DAY);
		});

		it('should only create the follows still missing when some were already made that day', async () => {
			const { run, added } = await runFrom({
				lastCompletedHour: new Date('2026-11-03T21:00:00.000Z'),
				now: new Date('2026-11-03T23:30:00.000Z'),
				random: quietRandom,
				run: { followDay: new Date('2026-11-03T00:00:00.000Z'), followCount: 3 },
			});

			expect(added).toBe(2);
			expect(run.followCount).toBe(5);
		});

		it('should create no extra follows when the day already has 5', async () => {
			const { run, added } = await runFrom({
				lastCompletedHour: new Date('2026-11-03T21:00:00.000Z'),
				now: new Date('2026-11-03T23:30:00.000Z'),
				random: quietRandom,
				run: { followDay: new Date('2026-11-03T00:00:00.000Z'), followCount: 8 },
			});

			expect(added).toBe(0);
			expect(run.followCount).toBe(8);
		});

		it('should start counting again from 0 when a new UTC day begins', async () => {
			const { run, added } = await runFrom({
				lastCompletedHour: new Date('2026-11-02T20:00:00.000Z'),
				now: new Date('2026-11-03T10:30:00.000Z'),
				random: quietRandom,
			});

			expect(added).toBe(config.MIN_FOLLOWS_PER_DAY);
			expect(run.followDay).toEqual(new Date('2026-11-03T00:00:00.000Z'));
			expect(run.followCount).toBe(0);
		});

		it('should ignore the count of an earlier day and top the new day up to 5', async () => {
			const { run, added } = await runFrom({
				lastCompletedHour: new Date('2026-11-03T21:00:00.000Z'),
				now: new Date('2026-11-03T23:30:00.000Z'),
				random: quietRandom,
				run: { followDay: new Date('2026-11-02T00:00:00.000Z'), followCount: 9 },
			});

			expect(added).toBe(config.MIN_FOLLOWS_PER_DAY);
			expect(run.followDay).toEqual(new Date('2026-11-03T00:00:00.000Z'));
			expect(run.followCount).toBe(config.MIN_FOLLOWS_PER_DAY);
		});

		it('should add the topped-up follows to both followers and following without self-follows', async () => {
			await runFrom({
				lastCompletedHour: new Date('2026-11-03T07:00:00.000Z'),
				now: new Date('2026-11-03T23:30:00.000Z'),
				random: quietRandom,
			});

			const users = await loadUsersById();
			const broken = [...users.values()].filter(
				(user) =>
					stringIds(user.following).includes(String(user._id)) ||
					user.following.some((followedId) => !stringIds(users.get(String(followedId)).followers).includes(String(user._id))),
			);

			expect(broken).toEqual([]);
		});
	});

	describe('stories in a catch-up run around the 24 hour boundary', () => {
		const now = new Date('2026-11-04T12:30:00.000Z');
		let stories;

		beforeAll(async () => {
			await prepareRun(SEED_NOW);
			await setLastCompletedHour(new Date('2026-11-03T07:00:00.000Z'));
			await runDemoActivity({ now, random: createRandom(41) });

			stories = await StoryModel.find().lean();
		});

		it('should create stories for the hours that are within the last 24 hours', () => {
			expect(stories.length).toBeGreaterThan(0);
		});

		it('should date no story more than 24 hours before now', () => {
			expect(stories.filter((story) => story.createdAt < new Date(now.getTime() - 24 * HOUR_MS))).toEqual([]);
		});

		it('should create no story in the hour that starts before the 24 hour limit but ends after it', () => {
			const boundaryHourStories = stories.filter(
				(story) => story.createdAt >= new Date('2026-11-03T12:00:00.000Z') && story.createdAt < new Date('2026-11-03T13:00:00.000Z'),
			);

			expect(boundaryHourStories).toEqual([]);
		});

		it('should create stories from the first full hour after the limit', () => {
			const afterBoundary = stories.filter(
				(story) => story.createdAt >= new Date('2026-11-03T13:00:00.000Z') && story.createdAt < new Date('2026-11-03T14:00:00.000Z'),
			);

			expect(afterBoundary.length).toBeGreaterThan(0);
		});
	});

	describe('when no account has a photo queued', () => {
		const now = new Date('2026-11-03T23:30:00.000Z');

		beforeAll(async () => {
			await prepareRun(SEED_NOW);
			await setLastCompletedHour(new Date('2026-11-03T07:00:00.000Z'));
			await DemoAccountStateModel.updateMany({}, { queue: [] });
			await runDemoActivity({ now, random: createRandom(12) });
		});

		it('should create no posts, not even to reach the daily minimum', async () => {
			expect(await UserPostModel.countDocuments({ createdAt: { $gt: SEED_NOW } })).toBe(0);
		});

		it('should still create stories', async () => {
			expect(await StoryModel.countDocuments()).toBeGreaterThanOrEqual(config.MIN_STORIES_PER_DAY);
		});
	});

	describe('a photo that comes back to be posted again', () => {
		const lastCompleted = new Date('2026-11-03T21:00:00.000Z');
		const now = new Date('2026-11-03T23:20:00.000Z');
		const fixedRandom = () => 0.5;
		let state;
		let source;
		let previousCaption;
		let newPost;

		beforeAll(async () => {
			await prepareRun(SEED_NOW);
			await setLastCompletedHour(lastCompleted);

			const creators = await DemoAccountStateModel.find({ tier: 'creator' }).lean();

			[state] = creators;
			[source] = state.queue;
			previousCaption = createCaptionPicker(fixture.captionBanks, fixedRandom)(
				{ username: state.username, folder: state.folder },
				source,
				undefined,
			);

			await DemoAccountStateModel.updateMany({ userId: { $ne: state.userId } }, { queue: [] });
			await DemoAccountStateModel.updateOne(
				{ userId: state.userId },
				{ queue: [source], previousCaptions: [{ source, caption: previousCaption }] },
			);
			await runDemoActivity({ now, random: fixedRandom });

			newPost = await UserPostModel.findOne({ imageIdentifier: `demo-users/${source}` }).lean();
		});

		it('should have a previous caption that the picker would otherwise have chosen again', () => {
			expect(previousCaption).toEqual(expect.any(String));
		});

		it('should repost the photo', () => {
			expect(newPost).not.toBeNull();
			expect(String(newPost.userId)).toBe(String(state.userId));
		});

		it('should give it a caption different from the previous one', () => {
			expect(newPost.caption).toEqual(expect.any(String));
			expect(newPost.caption).not.toBe(previousCaption);
		});

		it('should take the new caption from the bank of the photo folder', () => {
			const bank = fixture.captionBanks.get(source.split('/')[1]);

			expect([...bank.owner, ...bank.guest]).toContain(newPost.caption);
		});

		it('should forget the previous caption of that photo once it is posted again', async () => {
			const { previousCaptions } = await DemoAccountStateModel.findOne({ userId: state.userId }).lean();

			expect(previousCaptions.filter((entry) => entry.source === source)).toEqual([]);
		});

		it('should record the new caption in state.posted', async () => {
			const entry = (await DemoAccountStateModel.findOne({ userId: state.userId }).lean()).posted.find(
				(candidate) => candidate.source === source,
			);

			expect(entry.caption).toBe(newPost.caption);
		});
	});
});

describe('runDemoActivity rolling window against a real database', () => {
	let mongoServer;

	beforeAll(async () => {
		mongoServer = await startDatabase();
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await stopDatabase(mongoServer);
	});

	const runWindow = () => runDemoActivity({ now: NIGHT_RUN_NOW, random: createRandom(3) });

	const stateWithMostPosts = async (tier) => {
		const states = await DemoAccountStateModel.find({ tier }).lean();

		return states.sort((a, b) => b.posted.length - a.posted.length)[0];
	};

	const ageAllPosts = async (state, firstAgeInDays) => {
		for (const [index, entry] of state.posted.entries()) {
			const createdAt = daysBefore(NIGHT_RUN_NOW, firstAgeInDays + index);

			await UserPostModel.updateOne({ _id: entry.postId }, { createdAt, updatedAt: createdAt });
		}
	};

	describe('when a creator has posts older than 90 days beyond the 20 it keeps', () => {
		let state;
		let removedEntries;
		let keptEntries;
		let freshEvent;
		let queueBefore;

		beforeAll(async () => {
			await prepareRun(NIGHT_SEED_NOW);

			state = await stateWithMostPosts('creator');
			queueBefore = state.queue;

			const nearlyOld = state.posted[2];
			const oldest = state.posted[0];
			const nextOldest = state.posted[1];

			await UserPostModel.updateOne({ _id: oldest.postId }, { createdAt: daysBefore(NIGHT_RUN_NOW, 101) });
			await UserPostModel.updateOne({ _id: nextOldest.postId }, { createdAt: daysBefore(NIGHT_RUN_NOW, 100) });
			await UserPostModel.updateOne({ _id: nearlyOld.postId }, { createdAt: daysBefore(NIGHT_RUN_NOW, 89) });

			for (const entry of [oldest, nextOldest, nearlyOld]) {
				await DemoScheduledEventModel.create({
					dueAt: hoursAfter(NIGHT_RUN_NOW, 5),
					type: 'postLike',
					userPostId: entry.postId,
					userId: state.userId,
				});
			}

			removedEntries = [oldest, nextOldest];
			keptEntries = state.posted.filter((entry) => !removedEntries.includes(entry));
			freshEvent = await DemoScheduledEventModel.findOne({ userPostId: nearlyOld.postId }).lean();

			await runWindow();
		});

		it('should have started with more than 22 posts to remove from', () => {
			expect(state.posted.length).toBeGreaterThan(22);
		});

		it('should remove the posts older than 90 days', async () => {
			expect(await UserPostModel.countDocuments({ _id: { $in: removedEntries.map((entry) => entry.postId) } })).toBe(0);
		});

		it('should keep the posts younger than 90 days', async () => {
			expect(await UserPostModel.countDocuments({ _id: { $in: keptEntries.map((entry) => entry.postId) } })).toBe(keptEntries.length);
		});

		it('should remove all comments and replies of the removed posts', async () => {
			expect(await CommentModel.countDocuments({ userPostId: { $in: removedEntries.map((entry) => entry.postId) } })).toBe(0);
		});

		it('should keep the comments of the kept posts', async () => {
			expect(await CommentModel.countDocuments({ userPostId: { $in: keptEntries.map((entry) => entry.postId) } })).toBeGreaterThan(0);
		});

		it('should remove the scheduled events of the removed posts', async () => {
			expect(await DemoScheduledEventModel.countDocuments({ userPostId: { $in: removedEntries.map((entry) => entry.postId) } })).toBe(0);
		});

		it('should keep the scheduled events of the kept posts', async () => {
			expect(await DemoScheduledEventModel.findById(freshEvent._id)).not.toBeNull();
		});

		it('should remove the posts from the posts array of the user', async () => {
			const user = await UserModel.findById(state.userId).lean();

			expect(stringIds(user.posts).sort()).toEqual(stringIds(keptEntries.map((entry) => entry.postId)).sort());
		});

		it('should remove the posts from state.posted', async () => {
			const updated = await DemoAccountStateModel.findOne({ userId: state.userId }).lean();

			expect(stringIds(updated.posted.map((entry) => entry.postId)).sort()).toEqual(stringIds(keptEntries.map((entry) => entry.postId)).sort());
		});

		it('should put the photos back at the end of the queue', async () => {
			const updated = await DemoAccountStateModel.findOne({ userId: state.userId }).lean();

			expect(updated.queue.slice(0, queueBefore.length)).toEqual(queueBefore);
			expect(updated.queue.slice(queueBefore.length).sort()).toEqual(removedEntries.map((entry) => entry.source).sort());
		});

		it('should remember the caption each photo had, for the next caption pick', async () => {
			const updated = await DemoAccountStateModel.findOne({ userId: state.userId }).lean();
			const expected = removedEntries
				.map((entry) => ({ source: entry.source, caption: entry.caption }))
				.sort((a, b) => a.source.localeCompare(b.source));
			const actual = updated.previousCaptions
				.map((entry) => ({ source: entry.source, caption: entry.caption }))
				.sort((a, b) => a.source.localeCompare(b.source));

			expect(actual).toEqual(expected);
		});
	});

	describe.each([
		['creator', 20],
		['casualPoster', 5],
	])('when every post of a %s is older than 90 days', (tier, minimum) => {
		let state;
		let survivorIds;
		let removedEntries;

		beforeAll(async () => {
			await prepareRun(NIGHT_SEED_NOW);

			state = await stateWithMostPosts(tier);

			await ageAllPosts(state, 100);

			survivorIds = state.posted.slice(0, minimum).map((entry) => String(entry.postId));
			removedEntries = state.posted.slice(minimum);

			await runWindow();
		});

		it('should have more posts than the tier minimum so there is something to remove', () => {
			expect(state.posted.length).toBeGreaterThan(minimum);
		});

		it(`should never drop below ${minimum} posts`, async () => {
			expect(await UserPostModel.countDocuments({ userId: state.userId })).toBe(minimum);
		});

		it('should keep the newest posts', async () => {
			const remaining = await UserPostModel.find({ userId: state.userId }).select({ _id: 1 }).lean();

			expect(stringIds(remaining.map((post) => post._id)).sort()).toEqual([...survivorIds].sort());
		});

		it('should remove the surplus posts and queue their photos', async () => {
			const updated = await DemoAccountStateModel.findOne({ userId: state.userId }).lean();

			expect(updated.posted).toHaveLength(minimum);
			expect(updated.queue.slice(-removedEntries.length).sort()).toEqual(removedEntries.map((entry) => entry.source).sort());
		});

		it('should keep the user posts array at the minimum', async () => {
			expect((await UserModel.findById(state.userId).lean()).posts).toHaveLength(minimum);
		});
	});

	describe('when every post of a creator is older than 90 days but the creator has exactly 20 posts', () => {
		it('should keep all of them', async () => {
			await prepareRun(NIGHT_SEED_NOW);

			const states = await DemoAccountStateModel.find({ tier: 'creator' }).lean();
			const state = states.find((candidate) => candidate.posted.length === 20);

			expect(state).toBeDefined();

			await ageAllPosts(state, 100);
			await runWindow();

			expect(await UserPostModel.countDocuments({ userId: state.userId })).toBe(20);
		});
	});

	describe('lurker backlog', () => {
		beforeEach(async () => {
			await prepareRun(NIGHT_SEED_NOW);
		});

		it('should never remove permanent posts, however old', async () => {
			const lurkerStates = await DemoAccountStateModel.find({ tier: 'lurker' }).lean();
			const backlogIds = lurkerStates.flatMap((state) => state.posted.filter((entry) => entry.permanent).map((entry) => entry.postId));
			const cutoff = daysBefore(NIGHT_RUN_NOW, config.WINDOW_DAYS);

			expect(await UserPostModel.countDocuments({ _id: { $in: backlogIds }, createdAt: { $lt: cutoff } })).toBeGreaterThan(0);

			await UserPostModel.updateMany({ _id: { $in: backlogIds } }, { createdAt: daysBefore(NIGHT_RUN_NOW, 200) });
			await runWindow();

			expect(await UserPostModel.countDocuments({ _id: { $in: backlogIds } })).toBe(backlogIds.length);
		});

		it('should keep every permanent entry in state.posted and leave the queue alone', async () => {
			const before = await loadStatesByUserId();

			await runWindow();

			const after = await loadStatesByUserId();
			const changed = [...before.values()]
				.filter((state) => state.tier === 'lurker')
				.filter((state) => JSON.stringify(after.get(String(state.userId))) !== JSON.stringify(state));

			expect(changed).toEqual([]);
		});

		it('should remove an old non-permanent lurker post but keep the backlog', async () => {
			const lurkerStates = await DemoAccountStateModel.find({ tier: 'lurker' }).lean();
			const state = lurkerStates.find((candidate) => candidate.queue.length > 0);
			const [source, ...restOfQueue] = state.queue;
			const oldPost = await createManualPost(state.userId, daysBefore(NIGHT_RUN_NOW, 120), {
				imageIdentifier: `demo-users/${source}`,
				imageUrl: photoUrl(source),
			});

			await DemoAccountStateModel.updateOne(
				{ userId: state.userId },
				{ queue: restOfQueue, $push: { posted: { postId: oldPost._id, source, caption: 'Later photo', permanent: false } } },
			);
			await UserModel.updateOne({ _id: state.userId }, { $push: { posts: oldPost._id } });

			await runWindow();

			const updated = await DemoAccountStateModel.findOne({ userId: state.userId }).lean();

			expect(await UserPostModel.findById(oldPost._id)).toBeNull();
			expect(updated.queue).toEqual([...restOfQueue, source]);
			expect(updated.previousCaptions).toEqual([{ source, caption: 'Later photo' }]);
			expect(updated.posted.filter((entry) => entry.permanent)).toHaveLength(state.posted.length);
			expect(await UserPostModel.countDocuments({ userId: state.userId })).toBe(state.posted.length);
		});
	});

	describe('when nothing is older than 90 days', () => {
		it('should remove no post', async () => {
			await prepareRun(NIGHT_SEED_NOW);

			const cutoff = daysBefore(NIGHT_RUN_NOW, config.WINDOW_DAYS);
			const nonLurkerStates = await DemoAccountStateModel.find({ tier: { $ne: 'lurker' } }).lean();
			const recent = nonLurkerStates.flatMap((state) => state.posted.map((entry) => entry.postId));

			await UserPostModel.updateMany({ _id: { $in: recent } }, { createdAt: hoursAfter(cutoff, 24) });

			const before = await UserPostModel.countDocuments();

			await runWindow();

			expect(await UserPostModel.countDocuments()).toBe(before);
		});
	});
});
