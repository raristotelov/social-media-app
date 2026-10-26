const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const CommentModel = require('../models/commentModel');
const { ERROR_CODES } = require('../config/errorCodes');
const { POPULAR_POSTS_PAGE_SIZE, MAX_SHOWN_POST_IDS } = require('../config/popularPosts');
const { addComment } = require('./commentService');
const { getPopularPosts, getNextPopularPosts } = require('./popularPostService');

const HOUR_MS = 60 * 60 * 1000;
const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

let postCounter = 0;

const newId = () => new mongoose.Types.ObjectId();

const hoursBefore = (date, hours) => new Date(date.getTime() - hours * HOUR_MS);

const hoursAgo = (hours) => hoursBefore(new Date(), hours);

const createUser = async (username) => {
	const user = await UserModel.create({ email: `${username}@example.com`, username, password: 'hashed-password' });

	return { _id: user._id, username };
};

const follow = (follower, followee) =>
	UserModel.bulkWrite([
		{ updateOne: { filter: { _id: follower._id }, update: { $addToSet: { following: followee._id } } } },
		{ updateOne: { filter: { _id: followee._id }, update: { $addToSet: { followers: follower._id } } } },
	]);

const buildPostDocument = (author, { createdAt = hoursAgo(1), likes = 0, caption } = {}) => {
	postCounter += 1;

	return {
		imageIdentifier: `post-${postCounter}`,
		imageUrl: `https://cdn.example.com/post-${postCounter}.jpg`,
		imageWidth: 100,
		imageHeight: 100,
		caption,
		userId: author._id,
		likes: Array.from({ length: likes }, newId),
		createdAt,
	};
};

const createPost = async (author, options) => {
	const post = await UserPostModel.create(buildPostDocument(author, options));

	return post;
};

const createPosts = (author, optionsList) => UserPostModel.insertMany(optionsList.map((options) => buildPostDocument(author, options)));

const createComment = (post, commenter, { parentCommentId } = {}) =>
	addComment({ userPostId: post._id, userId: commenter._id, text: 'a comment', parentCommentId });

const createComments = async (post, commenter, count) => {
	for (let index = 0; index < count; index += 1) {
		await createComment(post, commenter);
	}
};

const getStoredCommentsCount = async (post) => (await UserPostModel.findById(post._id).lean()).commentsCount;

const ids = (posts) => posts.map((post) => String(post._id));

const idsOf = (result) => ids(result.posts);

const authorIdsOf = (result) => result.posts.map((post) => String(post.userId._id));

const toShownIds = (...results) => results.flatMap((result) => idsOf(result));

const expectAppError = async (promise, { statusCode, code }) => {
	const error = await promise.then(
		() => null,
		(rejection) => rejection,
	);

	expect(error).not.toBeNull();
	expect(error.statusCode).toBe(statusCode);
	expect(error.code).toBe(code);
};

describe('popularPostService against a real database', () => {
	let mongoServer;
	let author;
	let commenter;

	beforeAll(async () => {
		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), UserPostModel.init(), CommentModel.init()]);
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await mongoose.disconnect();
		await mongoServer?.stop();
	});

	beforeEach(async () => {
		await Promise.all([UserModel.deleteMany({}), UserPostModel.deleteMany({}), CommentModel.deleteMany({})]);

		author = await createUser('author');
		commenter = await createUser('commenter');
	});

	describe('the ranking order', () => {
		it('puts the post with the higher score first: (likes + 2 x comments) / (hours + 2)^1.5', async () => {
			const strongAndFresh = await createPost(author, { likes: 10, createdAt: hoursAgo(1) });
			const commentedAndFresh = await createPost(author, { likes: 0, createdAt: hoursAgo(1) });
			const veryLikedButOld = await createPost(author, { likes: 100, createdAt: hoursAgo(48) });
			const likedAndAging = await createPost(author, { likes: 10, createdAt: hoursAgo(10) });
			const untouched = await createPost(author, { likes: 0, createdAt: hoursAgo(1) });

			await createComments(commentedAndFresh, commenter, 3);

			const result = await getPopularPosts({});

			expect(idsOf(result).slice(0, 4)).toEqual(ids([strongAndFresh, commentedAndFresh, veryLikedButOld, likedAndAging]));
			expect(idsOf(result)[4]).toBe(String(untouched._id));
		});

		it('ranks a newer post with fewer likes above an older one with more', async () => {
			const older = await createPost(author, { likes: 20, createdAt: hoursAgo(30) });
			const newer = await createPost(author, { likes: 5, createdAt: hoursAgo(2) });

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([newer, older]));
		});

		it('lets a post fade as it ages, with the same likes', async () => {
			const fresh = await createPost(author, { likes: 8, createdAt: hoursAgo(1) });
			const day = await createPost(author, { likes: 8, createdAt: hoursAgo(24) });
			const week = await createPost(author, { likes: 8, createdAt: hoursAgo(24 * 7) });

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([fresh, day, week]));
		});

		it('counts a comment as two likes', async () => {
			const twoComments = await createPost(author, { likes: 0 });
			const threeLikes = await createPost(author, { likes: 3 });

			await createComments(twoComments, commenter, 2);

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([twoComments, threeLikes]));
		});

		it('ranks one comment below three likes, since it counts as only two', async () => {
			const oneComment = await createPost(author, { likes: 0 });
			const threeLikes = await createPost(author, { likes: 3 });

			await createComments(oneComment, commenter, 1);

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([threeLikes, oneComment]));
		});

		it('adds likes and comments together', async () => {
			const mixed = await createPost(author, { likes: 3 });
			const likesOnly = await createPost(author, { likes: 4 });

			await createComments(mixed, commenter, 1);

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([mixed, likesOnly]));
		});

		it('counts replies as comments, as the comment count on the card does', async () => {
			const withReplies = await createPost(author, { likes: 0 });
			const threeLikes = await createPost(author, { likes: 3 });
			const topLevel = await createComment(withReplies, commenter);

			await createComment(withReplies, commenter, { parentCommentId: topLevel._id });

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([withReplies, threeLikes]));
		});

		it('only counts the comments of that post', async () => {
			const quiet = await createPost(author, { likes: 1 });
			const busy = await createPost(author, { likes: 0 });

			await createComments(busy, commenter, 5);

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([busy, quiet]));
			expect(result.posts.find((post) => String(post._id) === String(quiet._id)).commentsCount).toBe(0);
		});

		it('ranks by the count stored on the post, raised by each comment added through the service', async () => {
			const commented = await createPost(author, { likes: 0 });
			const threeLikes = await createPost(author, { likes: 3 });

			await createComments(commented, commenter, 2);

			expect(await getStoredCommentsCount(commented)).toBe(2);
			expect(idsOf(await getPopularPosts({}))).toEqual(ids([commented, threeLikes]));
		});

		it('does not rank by comment documents that never raised the stored count', async () => {
			const unCounted = await createPost(author, { likes: 0 });
			const oneLike = await createPost(author, { likes: 1 });

			await CommentModel.create([
				{ userPostId: unCounted._id, userId: commenter._id, text: 'a' },
				{ userPostId: unCounted._id, userId: commenter._id, text: 'b' },
				{ userPostId: unCounted._id, userId: commenter._id, text: 'c' },
			]);

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([oneLike, unCounted]));
			expect(result.posts.find((post) => String(post._id) === String(unCounted._id)).commentsCount).toBe(0);
		});

		it('ranks by a stored count set directly on the post', async () => {
			const counted = await createPost(author, { likes: 0 });
			const threeLikes = await createPost(author, { likes: 3 });

			await UserPostModel.updateOne({ _id: counted._id }, { $set: { commentsCount: 2 } });

			expect(idsOf(await getPopularPosts({}))).toEqual(ids([counted, threeLikes]));
		});

		it('treats a post stored without a commentsCount as having no comments', async () => {
			const noCountField = await createPost(author, { likes: 0 });
			const oneLike = await createPost(author, { likes: 1 });

			await UserPostModel.collection.updateOne({ _id: noCountField._id }, { $unset: { commentsCount: '' } });

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([oneLike, noCountField]));
		});

		it('breaks a tie by putting the newest post first', async () => {
			const createdAt = hoursAgo(5);
			const first = await createPost(author, { likes: 2, createdAt });
			const second = await createPost(author, { likes: 2, createdAt });
			const third = await createPost(author, { likes: 2, createdAt });

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([third, second, first]));
		});

		it('still lists posts with no likes and no comments, after the ones that have some', async () => {
			const untouched = await createPost(author, { likes: 0 });
			const liked = await createPost(author, { likes: 1, createdAt: hoursAgo(100) });

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([liked, untouched]));
		});

		it('handles a post with a missing likes array as having no likes', async () => {
			const noLikesField = await createPost(author, { likes: 0 });

			await UserPostModel.collection.updateOne({ _id: noLikesField._id }, { $unset: { likes: '' } });

			const result = await getPopularPosts({});

			expect(idsOf(result)).toEqual(ids([noLikesField]));
		});
	});

	describe('who is left out', () => {
		let me;
		let followedA;
		let followedB;
		let stranger;
		let ownPost;
		let followedPostA;
		let followedPostB;
		let strangerPost;
		let followerPost;
		let follower;

		beforeEach(async () => {
			me = await createUser('me');
			followedA = await createUser('followedA');
			followedB = await createUser('followedB');
			stranger = await createUser('stranger');
			follower = await createUser('follower');

			await follow(me, followedA);
			await follow(me, followedB);
			await follow(follower, me);

			ownPost = await createPost(me, { likes: 9 });
			followedPostA = await createPost(followedA, { likes: 9 });
			followedPostB = await createPost(followedB, { likes: 9 });
			strangerPost = await createPost(stranger, { likes: 1 });
			followerPost = await createPost(follower, { likes: 1 });
		});

		it('leaves out the posts of the logged-in user and of everyone they follow, however popular', async () => {
			const result = await getPopularPosts({ userId: me._id.toString() });

			expect(new Set(idsOf(result))).toEqual(new Set(ids([strangerPost, followerPost])));
		});

		it('keeps the posts of someone who follows the user, since the user does not follow them back', async () => {
			const result = await getPopularPosts({ userId: me._id.toString() });

			expect(idsOf(result)).toContain(String(followerPost._id));
		});

		it('shows a guest every post, including the ones a member would not see', async () => {
			const result = await getPopularPosts({});

			expect(new Set(idsOf(result))).toEqual(new Set(ids([ownPost, followedPostA, followedPostB, strangerPost, followerPost])));
		});

		it('leaves out the same posts from every later batch', async () => {
			const result = await getNextPopularPosts({
				userId: me._id.toString(),
				snapshotTime: new Date().toISOString(),
				shownPostIds: [],
			});

			expect(new Set(idsOf(result))).toEqual(new Set(ids([strangerPost, followerPost])));
		});

		it('leaves out only the own posts of a user who follows nobody', async () => {
			const result = await getPopularPosts({ userId: stranger._id.toString() });

			expect(idsOf(result)).not.toContain(String(strangerPost._id));
			expect(result.posts).toHaveLength(4);
		});

		it('picks up a newly followed author on the next request', async () => {
			await follow(me, stranger);

			const result = await getPopularPosts({ userId: me._id.toString() });

			expect(idsOf(result)).toEqual([String(followerPost._id)]);
		});

		it('returns an empty page when everything is own or followed', async () => {
			await UserPostModel.deleteMany({ userId: { $in: [stranger._id, follower._id] } });

			const result = await getPopularPosts({ userId: me._id.toString() });

			expect(result).toMatchObject({ posts: [], hasMore: false });
		});
	});

	describe('snapshot time', () => {
		it('ignores the posts created after the snapshot time', async () => {
			const snapshotTime = hoursAgo(5);
			const before = await createPost(author, { likes: 1, createdAt: hoursBefore(snapshotTime, 1) });

			await createPost(author, { likes: 500, createdAt: hoursAgo(1) });

			const result = await getNextPopularPosts({ snapshotTime: snapshotTime.toISOString(), shownPostIds: [] });

			expect(idsOf(result)).toEqual([String(before._id)]);
		});

		it('includes a post created exactly at the snapshot time', async () => {
			const snapshotTime = hoursAgo(5);
			const atSnapshot = await createPost(author, { likes: 1, createdAt: snapshotTime });

			const result = await getNextPopularPosts({ snapshotTime: snapshotTime.toISOString(), shownPostIds: [] });

			expect(idsOf(result)).toEqual([String(atSnapshot._id)]);
		});

		it('counts the comments made after the snapshot time, since the comment count is current', async () => {
			const snapshotTime = hoursAgo(3);
			const commentedLate = await createPost(author, { likes: 0, createdAt: hoursAgo(10) });
			const liked = await createPost(author, { likes: 1, createdAt: hoursAgo(10) });

			await createComments(commentedLate, commenter, 5);

			const result = await getNextPopularPosts({ snapshotTime: snapshotTime.toISOString(), shownPostIds: [] });

			expect(idsOf(result)).toEqual(ids([commentedLate, liked]));
		});

		it('shows a post that was commented on after the page opened at the top of the next batch', async () => {
			const ranked = await createPosts(
				author,
				Array.from({ length: POPULAR_POSTS_PAGE_SIZE + 5 }, (_item, index) => ({ likes: index + 1 })),
			);
			const lowestRanked = ranked[0];

			const first = await getPopularPosts({});

			await createComments(lowestRanked, commenter, 40);

			const second = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first) });

			expect(idsOf(second)[0]).toBe(String(lowestRanked._id));
		});

		it('measures the age of a commented post against the snapshot time', async () => {
			const snapshotTime = hoursAgo(100);
			const olderCommented = await createPost(author, { likes: 0, createdAt: hoursBefore(snapshotTime, 10) });
			const newerLiked = await createPost(author, { likes: 3, createdAt: hoursBefore(snapshotTime, 1) });

			await createComments(olderCommented, commenter, 4);

			const result = await getNextPopularPosts({ snapshotTime: snapshotTime.toISOString(), shownPostIds: [] });

			expect(idsOf(result)).toEqual(ids([newerLiked, olderCommented]));
		});

		it('measures the age of a post against the snapshot time, not against the current time', async () => {
			const snapshotTime = hoursAgo(100);
			const olderMoreLiked = await createPost(author, { likes: 30, createdAt: hoursBefore(snapshotTime, 10) });
			const newerLessLiked = await createPost(author, { likes: 10, createdAt: hoursBefore(snapshotTime, 1) });

			const result = await getNextPopularPosts({ snapshotTime: snapshotTime.toISOString(), shownPostIds: [] });

			expect(idsOf(result)).toEqual(ids([newerLessLiked, olderMoreLiked]));
		});

		it('echoes the snapshot time back unchanged', async () => {
			const snapshotTime = hoursAgo(2).toISOString();

			const result = await getNextPopularPosts({ snapshotTime, shownPostIds: [] });

			expect(result.snapshotTime).toBe(snapshotTime);
		});

		it('hands out the time of the request as the snapshot time on the first page', async () => {
			const before = Date.now();

			const result = await getPopularPosts({});

			const snapshot = new Date(result.snapshotTime).getTime();

			expect(snapshot).toBeGreaterThanOrEqual(before);
			expect(snapshot).toBeLessThanOrEqual(Date.now());
		});
	});

	describe('batches', () => {
		const TOTAL_POSTS = 70;

		const seedRankedPosts = async () => {
			const createdAt = hoursAgo(1);

			const posts = await createPosts(
				author,
				Array.from({ length: TOTAL_POSTS }, (_item, index) => ({ likes: index, createdAt })),
			);

			return [...posts].reverse();
		};

		it('holds 30 posts on the first page', async () => {
			await seedRankedPosts();

			const first = await getPopularPosts({});

			expect(first.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
			expect(first.hasMore).toBe(true);
		});

		it('walks through every post in rank order, with no repeat and no skip, across the batches', async () => {
			const ranked = await seedRankedPosts();

			const first = await getPopularPosts({});
			const second = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first) });
			const third = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first, second) });

			expect([first.posts.length, second.posts.length, third.posts.length]).toEqual([30, 30, 10]);
			expect([...idsOf(first), ...idsOf(second), ...idsOf(third)]).toEqual(ids(ranked));
		});

		it('reports hasMore on every batch but the last', async () => {
			await seedRankedPosts();

			const first = await getPopularPosts({});
			const second = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first) });
			const third = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first, second) });

			expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
		});

		it('returns an empty last batch when everything has been shown', async () => {
			await seedRankedPosts();

			const everything = await UserPostModel.find({}).select({ _id: 1 }).lean();

			const result = await getNextPopularPosts({ snapshotTime: new Date().toISOString(), shownPostIds: ids(everything) });

			expect(result).toMatchObject({ posts: [], hasMore: false });
		});

		it('ends quietly once the shown posts plus the batch reach the cap, though more posts exist', async () => {
			await createPosts(
				author,
				Array.from({ length: POPULAR_POSTS_PAGE_SIZE + 5 }, (_item, index) => ({ likes: index })),
			);
			const shownPostIds = Array.from({ length: MAX_SHOWN_POST_IDS - POPULAR_POSTS_PAGE_SIZE }, () => String(newId()));

			const result = await getNextPopularPosts({ snapshotTime: new Date().toISOString(), shownPostIds });

			expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
			expect(result.hasMore).toBe(false);
		});

		it('keeps going while the shown posts plus the batch stay one below the cap', async () => {
			await createPosts(
				author,
				Array.from({ length: POPULAR_POSTS_PAGE_SIZE + 5 }, (_item, index) => ({ likes: index })),
			);
			const shownPostIds = Array.from({ length: MAX_SHOWN_POST_IDS - POPULAR_POSTS_PAGE_SIZE - 1 }, () => String(newId()));

			const result = await getNextPopularPosts({ snapshotTime: new Date().toISOString(), shownPostIds });

			expect(result.hasMore).toBe(true);
		});

		it('reports hasMore false when exactly 30 posts exist', async () => {
			await createPosts(
				author,
				Array.from({ length: POPULAR_POSTS_PAGE_SIZE }, (_item, index) => ({ likes: index })),
			);

			const result = await getPopularPosts({});

			expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
			expect(result.hasMore).toBe(false);
		});

		it('reports hasMore true when 31 posts exist, and the next batch holds the last one', async () => {
			await createPosts(
				author,
				Array.from({ length: POPULAR_POSTS_PAGE_SIZE + 1 }, (_item, index) => ({ likes: index })),
			);

			const first = await getPopularPosts({});
			const second = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first) });

			expect(first.hasMore).toBe(true);
			expect(second.posts).toHaveLength(1);
			expect(second.hasMore).toBe(false);
		});

		it('keeps the loaded posts out of every later batch even when their score changes', async () => {
			const ranked = await seedRankedPosts();

			const first = await getPopularPosts({});

			await UserPostModel.updateOne({ _id: ranked[0]._id }, { $set: { likes: Array.from({ length: 1000 }, newId) } });

			const second = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first) });

			expect(idsOf(second)).not.toContain(String(ranked[0]._id));
		});

		it('shows a post whose likes rose after the page opened at the top of the next batch', async () => {
			const ranked = await seedRankedPosts();
			const climber = ranked[ranked.length - 1];

			const first = await getPopularPosts({});

			await UserPostModel.updateOne({ _id: climber._id }, { $set: { likes: Array.from({ length: 5000 }, newId) } });

			const second = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first) });

			expect(idsOf(second)[0]).toBe(String(climber._id));
		});

		it('does not skip any post when a post is deleted between batches', async () => {
			const ranked = await seedRankedPosts();

			const first = await getPopularPosts({});

			await UserPostModel.deleteOne({ _id: ranked[35]._id });

			const second = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first) });

			expect(idsOf(second)).toEqual(ids([...ranked.slice(30, 35), ...ranked.slice(36, 61)]));
		});

		it('leaves out a post created after the page opened from every later batch', async () => {
			await seedRankedPosts();

			const first = await getPopularPosts({});
			const newcomer = await createPost(author, { likes: 5000, createdAt: new Date(Date.now() + 1000) });

			const second = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first) });

			expect(idsOf(second)).not.toContain(String(newcomer._id));
		});

		it('ignores shown ids that name posts which no longer exist', async () => {
			const kept = await createPost(author, { likes: 1 });
			const deleted = await createPost(author, { likes: 2 });

			await UserPostModel.deleteOne({ _id: deleted._id });

			const result = await getNextPopularPosts({
				snapshotTime: new Date().toISOString(),
				shownPostIds: [String(deleted._id), String(newId())],
			});

			expect(idsOf(result)).toEqual([String(kept._id)]);
		});

		it('walks the posts of a member the same way, leaving out their own and followed posts in every batch', async () => {
			const ranked = await seedRankedPosts();
			const me = await createUser('me');
			const followed = await createUser('followed');

			await follow(me, followed);
			await createPost(me, { likes: 9999 });
			await createPost(followed, { likes: 9999 });

			const first = await getPopularPosts({ userId: me._id.toString() });
			const second = await getNextPopularPosts({
				userId: me._id.toString(),
				snapshotTime: first.snapshotTime,
				shownPostIds: toShownIds(first),
			});
			const third = await getNextPopularPosts({
				userId: me._id.toString(),
				snapshotTime: first.snapshotTime,
				shownPostIds: toShownIds(first, second),
			});

			expect([...idsOf(first), ...idsOf(second), ...idsOf(third)]).toEqual(ids(ranked));
		});
	});

	describe('the first post', () => {
		it('opens the page on the named post even when it ranks last', async () => {
			const top = await createPost(author, { likes: 50 });
			const last = await createPost(author, { likes: 0, createdAt: hoursAgo(500) });

			const result = await getPopularPosts({ firstPostId: last._id.toString() });

			expect(idsOf(result)).toEqual(ids([last, top]));
		});

		it('lists the named post once, not again at its own rank', async () => {
			const named = await createPost(author, { likes: 50 });
			await createPosts(author, [{ likes: 1 }, { likes: 2 }]);

			const result = await getPopularPosts({ firstPostId: named._id.toString() });

			expect(idsOf(result).filter((postId) => postId === String(named._id))).toHaveLength(1);
			expect(idsOf(result)).toHaveLength(3);
		});

		it('follows the named post with the rest in rank order', async () => {
			const named = await createPost(author, { likes: 0, createdAt: hoursAgo(300) });
			const best = await createPost(author, { likes: 20 });
			const middle = await createPost(author, { likes: 10 });
			const worst = await createPost(author, { likes: 1 });

			const result = await getPopularPosts({ firstPostId: named._id.toString() });

			expect(idsOf(result)).toEqual(ids([named, best, middle, worst]));
		});

		it('holds 30 posts including the named one', async () => {
			const named = await createPost(author, { likes: 0, createdAt: hoursAgo(300) });

			await createPosts(
				author,
				Array.from({ length: 40 }, (_item, index) => ({ likes: index + 1 })),
			);

			const result = await getPopularPosts({ firstPostId: named._id.toString() });

			expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
			expect(result.hasMore).toBe(true);
		});

		it('reports hasMore false when the named post and 29 others make up everything', async () => {
			const named = await createPost(author, { likes: 0 });

			await createPosts(
				author,
				Array.from({ length: POPULAR_POSTS_PAGE_SIZE - 1 }, (_item, index) => ({ likes: index + 1 })),
			);

			const result = await getPopularPosts({ firstPostId: named._id.toString() });

			expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
			expect(result.hasMore).toBe(false);
		});

		it('reports hasMore true when the named post and 30 others exist', async () => {
			const named = await createPost(author, { likes: 0 });

			await createPosts(
				author,
				Array.from({ length: POPULAR_POSTS_PAGE_SIZE }, (_item, index) => ({ likes: index + 1 })),
			);

			const result = await getPopularPosts({ firstPostId: named._id.toString() });

			expect(result.hasMore).toBe(true);
		});

		it('walks on from a named first post with no repeat and no skip', async () => {
			const named = await createPost(author, { likes: 0, createdAt: hoursAgo(300) });
			const posts = await createPosts(
				author,
				Array.from({ length: 45 }, (_item, index) => ({ likes: index + 1 })),
			);
			const ranked = [...posts].reverse();

			const first = await getPopularPosts({ firstPostId: named._id.toString() });
			const second = await getNextPopularPosts({ snapshotTime: first.snapshotTime, shownPostIds: toShownIds(first) });

			expect([...idsOf(first), ...idsOf(second)]).toEqual(ids([named, ...ranked]));
			expect(second.hasMore).toBe(false);
		});

		it("shows the named post even when it is the member's own or a followed author's", async () => {
			const me = await createUser('me');
			const followed = await createUser('followed');

			await follow(me, followed);

			const ownPost = await createPost(me, { likes: 0 });
			const followedPost = await createPost(followed, { likes: 0 });
			const strangerPost = await createPost(author, { likes: 1 });

			const ownFirst = await getPopularPosts({ userId: me._id.toString(), firstPostId: ownPost._id.toString() });
			const followedFirst = await getPopularPosts({ userId: me._id.toString(), firstPostId: followedPost._id.toString() });

			expect(idsOf(ownFirst)).toEqual(ids([ownPost, strangerPost]));
			expect(idsOf(followedFirst)).toEqual(ids([followedPost, strangerPost]));
		});

		it('opens a deleted post as POST_NOT_FOUND', async () => {
			const gone = await createPost(author, { likes: 1 });

			await UserPostModel.deleteOne({ _id: gone._id });

			await expectAppError(getPopularPosts({ firstPostId: gone._id.toString() }), { statusCode: 404, code: ERROR_CODES.POST_NOT_FOUND });
		});

		it.each([['not-an-id'], ['123'], ['zzzzzzzzzzzzzzzzzzzzzzzz']])('answers POST_NOT_FOUND for the malformed id %s', async (firstPostId) => {
			await expectAppError(getPopularPosts({ firstPostId }), { statusCode: 404, code: ERROR_CODES.POST_NOT_FOUND });
		});

		it('answers POST_NOT_FOUND for a well-formed id that names nothing', async () => {
			await expectAppError(getPopularPosts({ firstPostId: String(newId()) }), { statusCode: 404, code: ERROR_CODES.POST_NOT_FOUND });
		});

		it('treats a missing firstPostId as none', async () => {
			const only = await createPost(author, { likes: 1 });

			const result = await getPopularPosts({ firstPostId: undefined });

			expect(idsOf(result)).toEqual([String(only._id)]);
		});
	});

	describe('validation errors', () => {
		const snapshotTime = () => new Date().toISOString();

		it.each([[undefined], [null], [''], ['yesterday'], [12345], [{}]])(
			'answers BAD_REQUEST for the snapshot time %p',
			async (badSnapshotTime) => {
				await expectAppError(getNextPopularPosts({ snapshotTime: badSnapshotTime, shownPostIds: [] }), {
					statusCode: 400,
					code: ERROR_CODES.BAD_REQUEST,
				});
			},
		);

		it.each([[undefined], [null], ['abc'], [{}]])('answers BAD_REQUEST when shownPostIds is %p', async (shownPostIds) => {
			await expectAppError(getNextPopularPosts({ snapshotTime: snapshotTime(), shownPostIds }), {
				statusCode: 400,
				code: ERROR_CODES.BAD_REQUEST,
			});
		});

		it.each([[[123]], [[null]], [['not-an-id']], [[{ $ne: null }]], [[[String(newId())]]]])(
			'answers BAD_REQUEST when shownPostIds holds %p',
			async (shownPostIds) => {
				await expectAppError(getNextPopularPosts({ snapshotTime: snapshotTime(), shownPostIds }), {
					statusCode: 400,
					code: ERROR_CODES.BAD_REQUEST,
				});
			},
		);

		it('answers BAD_REQUEST for more than 10000 shown ids', async () => {
			const shownPostIds = Array.from({ length: MAX_SHOWN_POST_IDS + 1 }, () => String(newId()));

			await expectAppError(getNextPopularPosts({ snapshotTime: snapshotTime(), shownPostIds }), {
				statusCode: 400,
				code: ERROR_CODES.BAD_REQUEST,
			});
		});

		it('accepts exactly 10000 shown ids', async () => {
			const kept = await createPost(author, { likes: 1 });
			const shownPostIds = Array.from({ length: MAX_SHOWN_POST_IDS }, () => String(newId()));

			const result = await getNextPopularPosts({ snapshotTime: snapshotTime(), shownPostIds });

			expect(idsOf(result)).toEqual([String(kept._id)]);
		});
	});

	describe('a user who no longer exists', () => {
		it('answers UNAUTHENTICATED on the first page', async () => {
			await createPost(author, { likes: 1 });

			await expectAppError(getPopularPosts({ userId: String(newId()) }), { statusCode: 401, code: ERROR_CODES.UNAUTHENTICATED });
		});

		it('answers UNAUTHENTICATED on a later batch', async () => {
			await createPost(author, { likes: 1 });

			await expectAppError(getNextPopularPosts({ userId: String(newId()), snapshotTime: new Date().toISOString(), shownPostIds: [] }), {
				statusCode: 401,
				code: ERROR_CODES.UNAUTHENTICATED,
			});
		});

		it('answers UNAUTHENTICATED for a user deleted after posting', async () => {
			const gone = await createUser('gone');

			await UserModel.deleteOne({ _id: gone._id });

			await expectAppError(getPopularPosts({ userId: gone._id.toString() }), { statusCode: 401, code: ERROR_CODES.UNAUTHENTICATED });
		});
	});

	describe('the shape of a post', () => {
		it('carries the author with the username and profile picture, and never the email or password', async () => {
			await UserModel.updateOne(
				{ _id: author._id },
				{ $set: { profilePicture: { imageUrl: 'https://cdn.example.com/author.jpg', imageIdentifier: 'secret-id' } } },
			);
			await createPost(author, { likes: 1, caption: 'hello' });

			const [post] = (await getPopularPosts({})).posts;

			expect(post.userId.username).toBe('author');
			expect(post.userId.profilePicture.imageUrl).toBe('https://cdn.example.com/author.jpg');
			expect(post.userId.email).toBeUndefined();
			expect(post.userId.password).toBeUndefined();
		});

		it('carries the caption, image, likes and the comment count', async () => {
			const post = await createPost(author, { likes: 2, caption: 'hello' });

			await createComments(post, commenter, 3);

			const [shown] = (await getPopularPosts({})).posts;

			expect(shown).toMatchObject({ caption: 'hello', imageUrl: post.imageUrl, commentsCount: 3 });
			expect(shown.likes).toHaveLength(2);
		});

		it('carries the preview comments with their authors', async () => {
			const post = await createPost(author, { likes: 1 });

			await createComment(post, commenter);

			const [shown] = (await getPopularPosts({})).posts;

			expect(shown.previewComments).toHaveLength(1);
			expect(shown.previewComments[0].userId.username).toBe('commenter');
		});

		it('gives a post nobody commented on a zero count and no previews', async () => {
			await createPost(author, { likes: 1 });

			const [shown] = (await getPopularPosts({})).posts;

			expect(shown.commentsCount).toBe(0);
			expect(shown.previewComments).toEqual([]);
		});

		it('does not leak the scoring fields', async () => {
			await createPost(author, { likes: 1 });

			const [shown] = (await getPopularPosts({})).posts;

			['storedCommentsCount', 'likesCount', 'ageHours', 'popularityScore'].forEach((field) => {
				expect(shown).not.toHaveProperty(field);
			});
		});

		it('returns the page in the documented shape: posts, snapshotTime and hasMore', async () => {
			const result = await getPopularPosts({});

			expect(Object.keys(result).sort()).toEqual(['hasMore', 'posts', 'snapshotTime']);
		});

		it('lists the author of every post on a mixed page', async () => {
			const other = await createUser('other');

			await createPost(author, { likes: 3 });
			await createPost(other, { likes: 2 });

			const result = await getPopularPosts({});

			expect(authorIdsOf(result)).toEqual([String(author._id), String(other._id)]);
		});
	});

	describe('an empty database', () => {
		it('returns an empty first page', async () => {
			const result = await getPopularPosts({});

			expect(result.posts).toEqual([]);
			expect(result.hasMore).toBe(false);
		});

		it('returns an empty next batch', async () => {
			const result = await getNextPopularPosts({ snapshotTime: new Date().toISOString(), shownPostIds: [] });

			expect(result).toMatchObject({ posts: [], hasMore: false });
		});
	});
});
