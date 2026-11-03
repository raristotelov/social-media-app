const mongoose = require('mongoose');
const JWT = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const CommentModel = require('../models/commentModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { getFollowedUsersPosts } = require('./userPostService');

jest.mock('../demo/userReactions', () => ({
	reactToSignUp: jest.fn(),
	reactToUpload: jest.fn(),
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 60 * 1000;
const JWT_SECRET = 'feed-paging-integration-test-secret';
const PAGE_SIZE = constants.FEED_POSTS_PAGE_SIZE;
const BASE_TIME = new Date('2026-11-01T12:00:00.000Z').getTime();
const POSTS_PER_TIMESTAMP = 4;

jest.setTimeout(TEST_TIMEOUT_MS);

const idOf = (post) => String(post._id);

describe('the paged feed against a real database', () => {
	let mongoServer;
	let server;
	let baseUrl;
	let originalJwtSecret;
	let viewer;
	let author;
	let otherAuthor;
	let persona;
	let visitor;
	let counter = 0;

	const createUser = (username, accountType = 'user') =>
		UserModel.create({ email: `${username}@example.com`, username, password: 'hashed-password', accountType });

	const follow = async (follower, followee) => {
		await UserModel.updateOne({ _id: follower._id }, { $addToSet: { following: followee._id } });
		await UserModel.updateOne({ _id: followee._id }, { $addToSet: { followers: follower._id } });
	};

	const buildPostDocument = (owner, createdAt, extra = {}) => {
		counter += 1;

		return {
			imageIdentifier: `post-${counter}`,
			imageUrl: `https://cdn.example.com/post-${counter}.jpg`,
			imageWidth: 100,
			imageHeight: 100,
			userId: owner._id,
			createdAt,
			updatedAt: createdAt,
			...extra,
		};
	};

	const createPostsWithTies = async (owners, count, { firstIndex = 0 } = {}) => {
		const documents = Array.from({ length: count }, (value, index) => {
			const position = firstIndex + index;
			const createdAt = new Date(BASE_TIME - Math.floor(position / POSTS_PER_TIMESTAMP) * 1000);

			return buildPostDocument(owners[position % owners.length], createdAt);
		});

		return UserPostModel.insertMany(documents);
	};

	const expectedOrder = async (owners) => {
		const posts = await UserPostModel.find({ userId: { $in: owners.map((owner) => owner._id) } }).lean();

		return posts.sort((a, b) => b.createdAt - a.createdAt || String(b._id).localeCompare(String(a._id))).map(idOf);
	};

	const readAllPages = async (user = viewer) => {
		const pages = [];
		let cursor;

		do {
			const page = await getFollowedUsersPosts(user._id, { cursor });

			pages.push(page);
			cursor = page.nextCursor;
		} while (cursor);

		return pages;
	};

	const request = (path, as) =>
		fetch(`${baseUrl}${path}`, {
			headers: as ? { 'X-Authorization': JWT.sign({ userId: String(as._id), username: as.username }, JWT_SECRET) } : {},
		});

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), UserPostModel.init(), CommentModel.init()]);

		server = await new Promise((resolve) => {
			const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
		});
		baseUrl = `http://127.0.0.1:${server.address().port}`;
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		process.env.JWT_SECRET = originalJwtSecret;

		await new Promise((resolve) => server.close(resolve));
		await mongoose.disconnect();
		await mongoServer?.stop();
	});

	beforeEach(async () => {
		jest.spyOn(console, 'error').mockImplementation(() => {});
		await Promise.all([UserModel.deleteMany({}), UserPostModel.deleteMany({}), CommentModel.deleteMany({})]);

		viewer = await createUser('viewer');
		author = await createUser('author');
		otherAuthor = await createUser('other_author');
		persona = await createUser('persona', 'persona');
		visitor = await createUser('alex_demo_1', 'demo');

		await follow(viewer, author);
		await follow(viewer, otherAuthor);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('pages 30 posts at a time', () => {
		expect(PAGE_SIZE).toBe(30);
	});

	describe('the answer', () => {
		it('is an empty page for somebody who follows nobody', async () => {
			const loner = await createUser('loner');

			await expect(getFollowedUsersPosts(loner._id)).resolves.toEqual({ posts: [], hasMore: false, nextCursor: null });
		});

		it('is an empty page when the followed users have posted nothing', async () => {
			await expect(getFollowedUsersPosts(viewer._id)).resolves.toEqual({ posts: [], hasMore: false, nextCursor: null });
		});

		it('has the posts, hasMore and nextCursor and nothing else', async () => {
			await createPostsWithTies([author], 3);

			expect(Object.keys(await getFollowedUsersPosts(viewer._id)).sort()).toEqual(['hasMore', 'nextCursor', 'posts']);
		});

		it('gives every post its author, preview comments, likes and comment count', async () => {
			await createPostsWithTies([author], 1);

			const [post] = (await getFollowedUsersPosts(viewer._id)).posts;

			expect(post.userId.username).toBe('author');
			expect(post).toMatchObject({ previewComments: [], likes: [], commentsCount: 0 });
		});
	});

	describe('the boundaries between pages', () => {
		it('puts everything on one page, with no more to load, for fewer posts than a page', async () => {
			await createPostsWithTies([author], PAGE_SIZE - 1);

			const page = await getFollowedUsersPosts(viewer._id);

			expect(page.posts).toHaveLength(PAGE_SIZE - 1);
			expect(page).toMatchObject({ hasMore: false, nextCursor: null });
		});

		it('has no more to load for exactly one page of posts', async () => {
			await createPostsWithTies([author], PAGE_SIZE);

			const page = await getFollowedUsersPosts(viewer._id);

			expect(page.posts).toHaveLength(PAGE_SIZE);
			expect(page).toMatchObject({ hasMore: false, nextCursor: null });
		});

		it('has more to load for one post over a page, and that post is alone on the next page', async () => {
			await createPostsWithTies([author], PAGE_SIZE + 1);

			const first = await getFollowedUsersPosts(viewer._id);
			const second = await getFollowedUsersPosts(viewer._id, { cursor: first.nextCursor });

			expect(first.posts).toHaveLength(PAGE_SIZE);
			expect(first.hasMore).toBe(true);
			expect(first.nextCursor).toEqual(expect.any(String));
			expect(second.posts).toHaveLength(1);
			expect(second).toMatchObject({ hasMore: false, nextCursor: null });
		});

		it('has no more to load, and no cursor, on the last page', async () => {
			await createPostsWithTies([author, otherAuthor], PAGE_SIZE * 2 + 15);

			const pages = await readAllPages();

			expect(pages.map((page) => page.posts.length)).toEqual([PAGE_SIZE, PAGE_SIZE, 15]);
			expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
			expect(pages.map((page) => page.nextCursor === null)).toEqual([false, false, true]);
		});

		it('has no more to load for exactly two pages of posts', async () => {
			await createPostsWithTies([author], PAGE_SIZE * 2);

			const pages = await readAllPages();

			expect(pages.map((page) => page.posts.length)).toEqual([PAGE_SIZE, PAGE_SIZE]);
			expect(pages.map((page) => page.hasMore)).toEqual([true, false]);
		});

		it('builds the cursor from the creation time in milliseconds and the id of the last post of the page', async () => {
			await createPostsWithTies([author], PAGE_SIZE + 5);

			const { posts, nextCursor } = await getFollowedUsersPosts(viewer._id);
			const last = posts[posts.length - 1];

			expect(nextCursor).toBe(`${new Date(last.createdAt).getTime()}_${last._id}`);
		});
	});

	describe('across all the pages', () => {
		it('lists every post once, newest first, with no duplicate and no gap', async () => {
			await createPostsWithTies([author, otherAuthor], 75);

			const pages = await readAllPages();
			const listed = pages.flatMap((page) => page.posts.map(idOf));

			expect(listed).toEqual(await expectedOrder([author, otherAuthor]));
			expect(new Set(listed).size).toBe(75);
		});

		it('keeps posts with the same creation time together in a stable order across a page boundary', async () => {
			await createPostsWithTies([author, otherAuthor], 75);

			const [first, second] = await readAllPages();
			const lastOfFirst = first.posts[PAGE_SIZE - 1];
			const firstOfSecond = second.posts[0];

			expect(new Date(lastOfFirst.createdAt).getTime()).toBe(new Date(firstOfSecond.createdAt).getTime());
			expect(idOf(lastOfFirst) > idOf(firstOfSecond)).toBe(true);
		});

		it('handles every post having the very same creation time', async () => {
			const createdAt = new Date(BASE_TIME);

			await UserPostModel.insertMany(Array.from({ length: 70 }, () => buildPostDocument(author, createdAt)));

			const listed = (await readAllPages()).flatMap((page) => page.posts.map(idOf));

			expect(listed).toEqual(await expectedOrder([author]));
			expect(new Set(listed).size).toBe(70);
		});

		it('is newest first within a page', async () => {
			await createPostsWithTies([author, otherAuthor], 40);

			const { posts } = await getFollowedUsersPosts(viewer._id);
			const times = posts.map((post) => new Date(post.createdAt).getTime());

			expect(times).toEqual([...times].sort((a, b) => b - a));
		});

		it('only lists posts of the people the viewer follows', async () => {
			const stranger = await createUser('stranger');

			await createPostsWithTies([author], 40);
			await UserPostModel.insertMany(Array.from({ length: 40 }, () => buildPostDocument(stranger, new Date(BASE_TIME + 5000))));

			const listed = (await readAllPages()).flatMap((page) => page.posts);

			expect(listed).toHaveLength(40);
			expect(listed.every((post) => String(post.userId._id) === String(author._id))).toBe(true);
		});

		it('does not list the posts of the viewer', async () => {
			await createPostsWithTies([author], 5);
			await UserPostModel.insertMany([buildPostDocument(viewer, new Date(BASE_TIME + 5000))]);

			expect((await getFollowedUsersPosts(viewer._id)).posts).toHaveLength(5);
		});

		it('keeps the next page free of duplicates when new posts arrive after the first page was read', async () => {
			await createPostsWithTies([author], 45);

			const first = await getFollowedUsersPosts(viewer._id);

			await UserPostModel.insertMany(Array.from({ length: 5 }, () => buildPostDocument(author, new Date(BASE_TIME + 60000))));

			const second = await getFollowedUsersPosts(viewer._id, { cursor: first.nextCursor });
			const listed = [...first.posts, ...second.posts].map(idOf);

			expect(second.posts).toHaveLength(15);
			expect(new Set(listed).size).toBe(45);
		});

		it('leaves no gap when the last post of the page just read is deleted before the next page is asked for', async () => {
			await createPostsWithTies([author], 45);

			const first = await getFollowedUsersPosts(viewer._id);
			const lastOfFirst = first.posts[first.posts.length - 1];

			await UserPostModel.deleteOne({ _id: lastOfFirst._id });

			const second = await getFollowedUsersPosts(viewer._id, { cursor: first.nextCursor });
			const listed = [...first.posts.slice(0, -1), ...second.posts].map(idOf);

			expect(listed).toEqual((await expectedOrder([author])).concat([]).filter((id) => id !== idOf(lastOfFirst)));
		});

		it('skips posts of somebody the viewer unfollowed between pages', async () => {
			await createPostsWithTies([author, otherAuthor], 70);

			const first = await getFollowedUsersPosts(viewer._id);

			await UserModel.updateOne({ _id: viewer._id }, { $pull: { following: otherAuthor._id } });

			const second = await getFollowedUsersPosts(viewer._id, { cursor: first.nextCursor });

			expect(second.posts.every((post) => String(post.userId._id) === String(author._id))).toBe(true);
		});
	});

	describe('a bad cursor', () => {
		const VALID_ID = '64b7f0a1c2d3e4f5a6b7c8d1';

		it.each([
			['an empty string', ''],
			['a word', 'garbage'],
			['a timestamp alone', '1793000000000'],
			['a timestamp that is not a number', `abc_${VALID_ID}`],
			['a timestamp that is not a date', `99999999999999999999_${VALID_ID}`],
			['a missing timestamp', `_${VALID_ID}`],
			['an id that is not an object id', '1793000000000_not-an-id'],
			['a missing id', '1793000000000_'],
			['NaN as the timestamp', `NaN_${VALID_ID}`],
		])('is refused with a 400 BAD_REQUEST for %s', async (_name, cursor) => {
			await createPostsWithTies([author], 3);

			await expect(getFollowedUsersPosts(viewer._id, { cursor })).rejects.toMatchObject({ statusCode: 400, code: ERROR_CODES.BAD_REQUEST });
		});

		it.each([
			['a number', 123],
			['an object', { a: 1 }],
			['a list', ['a', 'b']],
			['null', null],
		])('is refused with a 400 BAD_REQUEST when it is %s', async (_name, cursor) => {
			await expect(getFollowedUsersPosts(viewer._id, { cursor })).rejects.toMatchObject({ statusCode: 400, code: ERROR_CODES.BAD_REQUEST });
		});

		it('is refused over HTTP with a 400 and the BAD_REQUEST code', async () => {
			const response = await request('/user-posts/followed-users-posts?cursor=garbage', viewer);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.BAD_REQUEST });
		});

		it('is refused over HTTP when the query names the cursor twice', async () => {
			const response = await request(`/user-posts/followed-users-posts?cursor=1_${VALID_ID}&cursor=2_${VALID_ID}`, viewer);

			expect(response.status).toBe(400);
		});

		it('is refused over HTTP when the cursor is empty', async () => {
			const response = await request('/user-posts/followed-users-posts?cursor=', viewer);

			expect(response.status).toBe(400);
		});

		it('is not read from the query string when it is absent: the first page is answered', async () => {
			await createPostsWithTies([author], 3);

			const response = await request('/user-posts/followed-users-posts', viewer);

			expect(response.status).toBe(200);
			expect((await response.json()).posts).toHaveLength(3);
		});

		it('is accepted when it names a post that no longer exists', async () => {
			await createPostsWithTies([author], 45);

			const [posts] = await readAllPages();
			const cursor = `${new Date(posts.posts[PAGE_SIZE - 1].createdAt).getTime()}_${new mongoose.Types.ObjectId()}`;

			await expect(getFollowedUsersPosts(viewer._id, { cursor })).resolves.toMatchObject({ posts: expect.any(Array) });
		});
	});

	describe('over HTTP', () => {
		it('answers the page shape with a cursor that continues the feed', async () => {
			await createPostsWithTies([author], 45);

			const first = await (await request('/user-posts/followed-users-posts', viewer)).json();
			const second = await (await request(`/user-posts/followed-users-posts?cursor=${encodeURIComponent(first.nextCursor)}`, viewer)).json();

			expect(first).toMatchObject({ hasMore: true });
			expect(first.posts).toHaveLength(PAGE_SIZE);
			expect(second.posts).toHaveLength(15);
			expect(second).toMatchObject({ hasMore: false, nextCursor: null });
			expect(new Set([...first.posts, ...second.posts].map((post) => post._id)).size).toBe(45);
		});

		it('answers 401 without a token', async () => {
			const response = await request('/user-posts/followed-users-posts');

			expect(response.status).toBe(401);
		});

		it('answers 401 for a token of a user that no longer exists', async () => {
			const ghost = { _id: new mongoose.Types.ObjectId(), username: 'ghost' };
			const response = await request('/user-posts/followed-users-posts', ghost);

			expect(response.status).toBe(401);
		});
	});

	describe('demo visitors', () => {
		it('never takes a page slot from the posts of an old follow of a visitor', async () => {
			await follow(viewer, visitor);
			await UserPostModel.insertMany(Array.from({ length: 40 }, () => buildPostDocument(visitor, new Date(BASE_TIME + 60000))));
			await createPostsWithTies([author], 35);

			const pages = await readAllPages();

			expect(pages.map((page) => page.posts.length)).toEqual([PAGE_SIZE, 5]);
			expect(pages.flatMap((page) => page.posts).every((post) => String(post.userId._id) !== String(visitor._id))).toBe(true);
		});

		it('leaves the likes and comments of visitors out of the posts on every page', async () => {
			const posts = await createPostsWithTies([author], 45);

			await UserPostModel.updateMany(
				{ _id: { $in: posts.map((post) => post._id) } },
				{ $set: { likes: [visitor._id, persona._id], commentsCount: 2 } },
			);
			await CommentModel.insertMany(posts.map((post) => ({ userPostId: post._id, userId: visitor._id, text: 'hello' })));

			const listed = (await readAllPages()).flatMap((page) => page.posts);

			expect(listed).toHaveLength(45);
			listed.forEach((post) => {
				expect(post.likes.map(String)).toEqual([String(persona._id)]);
				expect(post.commentsCount).toBe(1);
			});
		});

		it('leaves the comments of visitors out of the preview comments on every page', async () => {
			const posts = await createPostsWithTies([author], 35);

			await CommentModel.insertMany(posts.map((post) => ({ userPostId: post._id, userId: visitor._id, text: 'from the visitor' })));

			const listed = (await readAllPages()).flatMap((page) => page.posts);

			listed.forEach((post) => expect(post.previewComments).toEqual([]));
		});

		it('shows a visitor their own likes on the posts they follow, on every page', async () => {
			await follow(visitor, author);

			const posts = await createPostsWithTies([author], 35);

			await UserPostModel.updateMany({ _id: { $in: posts.map((post) => post._id) } }, { $set: { likes: [visitor._id] } });

			const listed = (await readAllPages(visitor)).flatMap((page) => page.posts);

			expect(listed).toHaveLength(35);
			listed.forEach((post) => expect(post.likes.map(String)).toEqual([String(visitor._id)]));
		});

		it('pages the feed of a visitor like any other', async () => {
			await follow(visitor, persona);
			await createPostsWithTies([persona], 65);

			const pages = await readAllPages(visitor);

			expect(pages.map((page) => page.posts.length)).toEqual([PAGE_SIZE, PAGE_SIZE, 5]);
		});
	});
});
