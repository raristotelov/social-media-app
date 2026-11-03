const mongoose = require('mongoose');
const JWT = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const CommentModel = require('../models/commentModel');
const StoryModel = require('../models/storyModel');
const StoryViewModel = require('../models/storyViewModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { ERROR_CODES } = require('../config/errorCodes');

jest.mock('../demo/userReactions', () => ({
	reactToSignUp: jest.fn(),
	reactToUpload: jest.fn(),
}));

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;
const JWT_SECRET = 'visitor-visibility-integration-test-secret';
const HOUR_MS = 60 * 60 * 1000;
const UNKNOWN_ID = '64b7f0a1c2d3e4f5a6b7c8ff';

jest.setTimeout(TEST_TIMEOUT_MS);

const ids = (users) => users.map((user) => String(user._id));

const usernames = (rows) => rows.map((row) => row.username);

describe('visitor visibility against a real database', () => {
	let mongoServer;
	let server;
	let baseUrl;
	let originalJwtSecret;
	let world;

	const request = (path, { as, method = 'GET', body } = {}) =>
		fetch(`${baseUrl}${path}`, {
			method,
			headers: {
				...(as ? { 'X-Authorization': JWT.sign({ userId: String(as._id), username: as.username }, JWT_SECRET) } : {}),
				...(body ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});

	const getJson = async (path, options) => (await request(path, options)).json();

	const getProfile = async (user, viewer) => {
		const [profile] = await getJson(`/users?userIds=${user._id}`, { as: viewer });

		return profile;
	};

	const createUser = (username, accountType, extra = {}) =>
		UserModel.create({ email: `${username}@example.com`, username, password: 'hashed-password', accountType, ...extra });

	const link = async (follower, followee) => {
		await UserModel.updateOne({ _id: follower._id }, { $addToSet: { following: followee._id } });
		await UserModel.updateOne({ _id: followee._id }, { $addToSet: { followers: follower._id } });
	};

	let postCounter = 0;

	const createPost = async (author, { likes = [], commentsCount = 0, hoursOld = 1 } = {}) => {
		postCounter += 1;

		const createdAt = new Date(Date.now() - hoursOld * HOUR_MS);
		const post = await UserPostModel.create({
			imageIdentifier: `post-${postCounter}`,
			imageUrl: `https://cdn.example.com/post-${postCounter}.jpg`,
			imageWidth: 100,
			imageHeight: 100,
			userId: author._id,
			likes: likes.map((user) => user._id),
			commentsCount,
			createdAt,
			updatedAt: createdAt,
		});

		await UserModel.updateOne({ _id: author._id }, { $push: { posts: post._id } });

		return post;
	};

	const createComment = (post, author, text, { likes = [], parent } = {}) =>
		CommentModel.create({
			userPostId: post._id,
			userId: author._id,
			text,
			likes: likes.map((user) => user._id),
			parentCommentId: parent ? parent._id : null,
		});

	const createStory = (author, name) =>
		StoryModel.create({
			imageIdentifier: `story-${name}`,
			imageUrl: `https://cdn.example.com/story-${name}.jpg`,
			imageWidth: 100,
			imageHeight: 100,
			userId: author._id,
		});

	const buildWorld = async () => {
		const personas = [];

		for (let index = 1; index <= 8; index += 1) {
			personas.push(await createUser(`persona${index}`, 'persona'));
		}

		const [p1, p2, p3, p4] = personas;
		const r1 = await createUser('regular1', 'user');
		const r2 = await createUser('regular2', 'user');
		const v1 = await createUser('alex_demo_1', 'demo', { email: 'alex_demo_1@visitor.demo.invalid' });
		const v2 = await createUser('alex_demo_2', 'demo', { email: 'alex_demo_2@visitor.demo.invalid' });

		for (const persona of personas.slice(0, 6)) {
			await link(v1, persona);
			await link(v2, persona);
		}

		await link(p1, v1);
		await link(p2, v1);
		await link(r1, p1);
		await link(r2, p1);

		const p1Post = await createPost(p1, { likes: [r1, v1, v2, r2], commentsCount: 5 });
		const cR1 = await createComment(p1Post, r1, 'comment by regular1', { likes: [r2, v1, v2] });
		const cV1 = await createComment(p1Post, v1, 'comment by visitor1');
		const cV2 = await createComment(p1Post, v2, 'comment by visitor2');
		const replyV1ToR1 = await createComment(p1Post, v1, 'reply by visitor1', { parent: cR1 });
		const replyR2ToV1 = await createComment(p1Post, r2, 'reply by regular2 to visitor1', { parent: cV1 });

		const p3Post = await createPost(p3, { likes: [v1, v2, r2], hoursOld: 5 });
		const p4Post = await createPost(p4, { likes: [r2, r1], hoursOld: 5 });
		const v1Post = await createPost(v1, { likes: [p1], commentsCount: 1 });
		const v2Post = await createPost(v2, { likes: [p1] });

		await createComment(v1Post, p1, 'comment on the visitor post');

		const r1Story = await createStory(r1, 'r1');
		const v1Story = await createStory(v1, 'v1');

		await StoryViewModel.create({ storyId: r1Story._id, viewerId: v1._id });
		await StoryViewModel.create({ storyId: r1Story._id, viewerId: p1._id });
		await StoryViewModel.create({ storyId: r1Story._id, viewerId: v2._id });
		await StoryViewModel.create({ storyId: v1Story._id, viewerId: v2._id });
		await StoryViewModel.create({ storyId: v1Story._id, viewerId: p1._id });
		await StoryViewModel.create({ storyId: v1Story._id, viewerId: r1._id });

		return {
			personas,
			p1,
			p2,
			p3,
			p4,
			r1,
			r2,
			v1,
			v2,
			p1Post,
			p3Post,
			p4Post,
			v1Post,
			v2Post,
			cR1,
			cV1,
			cV2,
			replyV1ToR1,
			replyR2ToV1,
			r1Story,
			v1Story,
		};
	};

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), UserPostModel.init(), CommentModel.init(), StoryModel.init(), StoryViewModel.init()]);

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

		await Promise.all([
			UserModel.deleteMany({}),
			UserPostModel.deleteMany({}),
			CommentModel.deleteMany({}),
			StoryModel.deleteMany({}),
			StoryViewModel.deleteMany({}),
		]);

		world = await buildWorld();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('search (GET /users?searchWord=)', () => {
		it.each([
			['a guest', () => undefined],
			['a regular user', () => world.r1],
			['a persona', () => world.p3],
			['another demo visitor', () => world.v2],
		])('should leave a visitor out of the results for %s', async (name, getViewer) => {
			const rows = await getJson('/users?searchWord=alex_demo_1', { as: getViewer() });

			expect(rows).toEqual([]);
		});

		it('should leave every visitor out of a broader search for a regular user', async () => {
			const rows = await getJson('/users?searchWord=alex', { as: world.r1 });

			expect(rows).toEqual([]);
		});

		it('should show a visitor themself in their own search', async () => {
			const rows = await getJson('/users?searchWord=alex_demo', { as: world.v1 });

			expect(usernames(rows)).toEqual(['alex_demo_1']);
		});

		it('should still find regular users and personas', async () => {
			const regulars = await getJson('/users?searchWord=regular', { as: world.r1 });
			const personas = await getJson('/users?searchWord=persona1', { as: world.r1 });

			expect(usernames(regulars).sort()).toEqual(['regular1', 'regular2']);
			expect(usernames(personas)).toEqual(['persona1']);
		});

		it('should leave visitors out when the viewer is a guest searching a persona prefix', async () => {
			const rows = await getJson('/users?searchWord=persona');

			expect(rows).toHaveLength(8);
		});

		it('should show a persona follower count without the visitors, for a regular user', async () => {
			const [row] = await getJson('/users?searchWord=persona1', { as: world.r1 });

			expect(row.followersCount).toBe(2);
		});

		it('should show a persona follower count with the viewer own visitor account counted', async () => {
			const [row] = await getJson('/users?searchWord=persona1', { as: world.v1 });

			expect(row.followersCount).toBe(3);
		});

		it('should show a persona follower count without the visitors, for a guest', async () => {
			const [row] = await getJson('/users?searchWord=persona1');

			expect(row.followersCount).toBe(2);
		});
	});

	describe('profiles (GET /users?userIds=)', () => {
		it.each([
			['a guest', () => undefined],
			['a regular user', () => world.r1],
			['a persona', () => world.p3],
			['another demo visitor', () => world.v2],
		])('should answer 404 USER_NOT_FOUND for the profile of a visitor, for %s', async (name, getViewer) => {
			const response = await request(`/users?userIds=${world.v1._id}`, { as: getViewer() });

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.USER_NOT_FOUND });
		});

		it('should answer 404 when a visitor is among several requested profiles', async () => {
			const response = await request(`/users?userIds=${world.p1._id},${world.v1._id}`, { as: world.r1 });

			expect(response.status).toBe(404);
		});

		it('should let a visitor open their own profile', async () => {
			const profile = await getProfile(world.v1, world.v1);

			expect(profile.username).toBe('alex_demo_1');
			expect(profile.accountType).toBe('demo');
			expect(profile.email).toBe('alex_demo_1@visitor.demo.invalid');
		});

		it('should show a visitor their own posts', async () => {
			const profile = await getProfile(world.v1, world.v1);

			expect(profile.posts.map((post) => String(post._id))).toEqual([String(world.v1Post._id)]);
		});

		it('should not reveal the account type or email of somebody else', async () => {
			const profile = await getProfile(world.p1, world.r1);

			expect(profile).not.toHaveProperty('accountType');
			expect(profile).not.toHaveProperty('email');
		});

		it('should reveal the account type and email to the owner of a regular profile', async () => {
			const profile = await getProfile(world.r1, world.r1);

			expect(profile.accountType).toBe('user');
			expect(profile.email).toBe('regular1@example.com');
		});

		describe('follower and following counts of a persona', () => {
			it('should leave every visitor out for a regular user', async () => {
				const profile = await getProfile(world.p1, world.r1);

				expect(profile.followers.map(String).sort()).toEqual(ids([world.r1, world.r2]).sort());
				expect(profile.following).toEqual([]);
			});

			it('should leave every visitor out for a guest', async () => {
				const profile = await getProfile(world.p1);

				expect(profile.followers.map(String).sort()).toEqual(ids([world.r1, world.r2]).sort());
				expect(profile.following).toEqual([]);
			});

			it('should include the viewer own visitor account but no other visitor', async () => {
				const profile = await getProfile(world.p1, world.v1);

				expect(profile.followers.map(String).sort()).toEqual(ids([world.r1, world.r2, world.v1]).sort());
				expect(profile.following.map(String)).toEqual(ids([world.v1]));
			});

			it('should go up by one for a visitor who follows a persona, and stay unchanged for another viewer', async () => {
				const fresh = world.personas[7];
				const beforeForRegular = (await getProfile(fresh, world.r1)).followers.length;
				const beforeForVisitor = (await getProfile(fresh, world.v1)).followers.length;

				const response = await request(`/users/${world.v1._id}/follow/${fresh._id}`, { as: world.v1, method: 'POST' });

				expect(response.status).toBe(200);
				expect((await getProfile(fresh, world.v1)).followers.length).toBe(beforeForVisitor + 1);
				expect((await getProfile(fresh, world.r1)).followers.length).toBe(beforeForRegular);
			});

			it('should not change what another visitor sees when a visitor follows a persona', async () => {
				const fresh = world.personas[7];
				const beforeForOtherVisitor = (await getProfile(fresh, world.v2)).followers.length;

				await request(`/users/${world.v1._id}/follow/${fresh._id}`, { as: world.v1, method: 'POST' });

				expect((await getProfile(fresh, world.v2)).followers.length).toBe(beforeForOtherVisitor);
			});

			it('should go back down when the visitor unfollows', async () => {
				const fresh = world.personas[7];
				const before = (await getProfile(fresh, world.v1)).followers.length;

				await request(`/users/${world.v1._id}/follow/${fresh._id}`, { as: world.v1, method: 'POST' });
				await request(`/users/${world.v1._id}/unfollow/${fresh._id}`, { as: world.v1, method: 'POST' });

				expect((await getProfile(fresh, world.v1)).followers.length).toBe(before);
			});
		});

		describe('the posts of a persona', () => {
			it('should leave the likes of visitors out for a regular user', async () => {
				const profile = await getProfile(world.p1, world.r1);
				const [post] = profile.posts;

				expect(post.likes.map(String).sort()).toEqual(ids([world.r1, world.r2]).sort());
			});

			it('should leave the comments of visitors, and the replies to them, out of the comment count', async () => {
				const profile = await getProfile(world.p1, world.r1);

				expect(profile.posts[0].commentsCount).toBe(1);
			});

			it('should leave the comments of visitors out of the preview comments', async () => {
				const profile = await getProfile(world.p1, world.r1);

				expect(profile.posts[0].previewComments.map((comment) => comment.text)).toEqual(['comment by regular1']);
			});

			it('should leave the likes of visitors off the preview comments too', async () => {
				const profile = await getProfile(world.p1, world.r1);

				expect(profile.posts[0].previewComments[0].likes.map(String)).toEqual(ids([world.r2]));
			});

			it('should include the viewer own likes and comments but nobody else from the demo accounts', async () => {
				const profile = await getProfile(world.p1, world.v1);
				const [post] = profile.posts;

				expect(post.likes.map(String).sort()).toEqual(ids([world.r1, world.v1, world.r2]).sort());
				expect(post.commentsCount).toBe(4);
				expect(post.previewComments.map((comment) => comment.text).sort()).toEqual(['comment by regular1', 'comment by visitor1']);
			});

			it('should include the viewer own like on a preview comment', async () => {
				const profile = await getProfile(world.p1, world.v1);
				const regularComment = profile.posts[0].previewComments.find((comment) => comment.text === 'comment by regular1');

				expect(regularComment.likes.map(String).sort()).toEqual(ids([world.r2, world.v1]).sort());
			});

			it('should leave the likes of visitors out for a guest', async () => {
				const profile = await getProfile(world.p1);

				expect(profile.posts[0].likes.map(String).sort()).toEqual(ids([world.r1, world.r2]).sort());
			});
		});
	});

	describe('follower and following lists (GET /users/:userId/followers|following)', () => {
		it('should leave visitors out of the followers of a persona for a regular user', async () => {
			const rows = await getJson(`/users/${world.p1._id}/followers`, { as: world.r2 });

			expect(usernames(rows).sort()).toEqual(['regular1', 'regular2']);
		});

		it('should leave visitors out of the followers of a persona for a guest', async () => {
			const rows = await getJson(`/users/${world.p1._id}/followers`);

			expect(usernames(rows).sort()).toEqual(['regular1', 'regular2']);
		});

		it('should leave visitors out of the following of a persona', async () => {
			const rows = await getJson(`/users/${world.p1._id}/following`, { as: world.r1 });

			expect(rows).toEqual([]);
		});

		it('should show the viewer own visitor account first and no other visitor', async () => {
			const rows = await getJson(`/users/${world.p1._id}/followers`, { as: world.v1 });

			expect(usernames(rows)).toEqual(['alex_demo_1', expect.any(String), expect.any(String)]);
			expect(usernames(rows)).not.toContain('alex_demo_2');
		});

		it('should show the viewer own visitor account in the following list of a persona', async () => {
			const rows = await getJson(`/users/${world.p1._id}/following`, { as: world.v1 });

			expect(usernames(rows)).toEqual(['alex_demo_1']);
		});

		it.each([
			['followers', 'a guest', () => undefined],
			['followers', 'a regular user', () => world.r1],
			['followers', 'another visitor', () => world.v2],
			['following', 'a guest', () => undefined],
			['following', 'a regular user', () => world.r1],
			['following', 'another visitor', () => world.v2],
		])('should answer 404 for the %s list of a visitor, for %s', async (list, name, getViewer) => {
			const response = await request(`/users/${world.v1._id}/${list}`, { as: getViewer() });

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.USER_NOT_FOUND });
		});

		it('should let a visitor read their own lists', async () => {
			const followers = await getJson(`/users/${world.v1._id}/followers`, { as: world.v1 });
			const following = await getJson(`/users/${world.v1._id}/following`, { as: world.v1 });

			expect(usernames(followers).sort()).toEqual(['persona1', 'persona2']);
			expect(following).toHaveLength(6);
		});
	});

	describe('the feed (GET /user-posts/followed-users-posts)', () => {
		it('should leave the likes of visitors out of a persona post for a regular user', async () => {
			const { posts } = await getJson('/user-posts/followed-users-posts', { as: world.r1 });
			const post = posts.find((candidate) => String(candidate._id) === String(world.p1Post._id));

			expect(post.likes.map(String).sort()).toEqual(ids([world.r1, world.r2]).sort());
		});

		it('should leave the comments of visitors out of the comment count and previews', async () => {
			const { posts } = await getJson('/user-posts/followed-users-posts', { as: world.r1 });
			const post = posts.find((candidate) => String(candidate._id) === String(world.p1Post._id));

			expect(post.commentsCount).toBe(1);
			expect(post.previewComments.map((comment) => comment.text)).toEqual(['comment by regular1']);
		});

		it('should show a visitor their own like and comment on a persona post', async () => {
			const { posts } = await getJson('/user-posts/followed-users-posts', { as: world.v1 });
			const post = posts.find((candidate) => String(candidate._id) === String(world.p1Post._id));

			expect(post.likes.map(String)).toContain(String(world.v1._id));
			expect(post.likes.map(String)).not.toContain(String(world.v2._id));
			expect(post.commentsCount).toBe(4);
		});

		it('should fill the feed of a visitor straight away', async () => {
			const { posts } = await getJson('/user-posts/followed-users-posts', { as: world.v1 });

			expect(posts.length).toBeGreaterThan(0);
		});
	});

	describe('Popular (GET /user-posts/popular)', () => {
		it.each([
			['a guest', () => undefined],
			['a regular user', () => world.r2],
			['another visitor', () => world.v2],
		])('should leave the posts of visitors out for %s', async (name, getViewer) => {
			const { posts } = await getJson('/user-posts/popular', { as: getViewer() });
			const authorIds = posts.map((post) => String(post.userId._id));

			expect(authorIds).not.toContain(String(world.v1._id));
			expect(authorIds).not.toContain(String(world.v2._id));
		});

		it('should still list the posts of personas', async () => {
			const { posts } = await getJson('/user-posts/popular');
			const authorIds = posts.map((post) => String(post.userId._id));

			expect(authorIds).toEqual(expect.arrayContaining(ids([world.p1, world.p3, world.p4])));
		});

		it('should show the like count without visitors', async () => {
			const { posts } = await getJson('/user-posts/popular');
			const post = posts.find((candidate) => String(candidate._id) === String(world.p3Post._id));

			expect(post.likes.map(String)).toEqual(ids([world.r2]));
		});

		it('should leave the comments of visitors out of the comment count', async () => {
			const { posts } = await getJson('/user-posts/popular');
			const post = posts.find((candidate) => String(candidate._id) === String(world.p1Post._id));

			expect(post.commentsCount).toBe(1);
			expect(post.previewComments.map((comment) => comment.text)).toEqual(['comment by regular1']);
		});

		it('should still rank by the stored counts: a post liked by visitors outranks a post with more visible likes', async () => {
			const { posts } = await getJson('/user-posts/popular');
			const order = posts.map((post) => String(post._id));
			const p3Post = posts.find((candidate) => String(candidate._id) === String(world.p3Post._id));
			const p4Post = posts.find((candidate) => String(candidate._id) === String(world.p4Post._id));

			expect(p3Post.likes).toHaveLength(1);
			expect(p4Post.likes).toHaveLength(2);
			expect(order.indexOf(String(world.p3Post._id))).toBeLessThan(order.indexOf(String(world.p4Post._id)));
		});

		it.each([
			['a guest', () => undefined],
			['a regular user', () => world.r2],
			['another visitor', () => world.v2],
		])('should answer 404 POST_NOT_FOUND for a direct link to a post of a visitor, for %s', async (name, getViewer) => {
			const response = await request(`/user-posts/popular?firstPostId=${world.v1Post._id}`, { as: getViewer() });

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.POST_NOT_FOUND });
		});

		it('should open a direct link to their own post for the visitor', async () => {
			const response = await request(`/user-posts/popular?firstPostId=${world.v1Post._id}`, { as: world.v1 });
			const { posts } = await response.json();

			expect(response.status).toBe(200);
			expect(String(posts[0]._id)).toBe(String(world.v1Post._id));
		});

		it('should open a direct link to the post of a persona', async () => {
			const response = await request(`/user-posts/popular?firstPostId=${world.p1Post._id}`, { as: world.r2 });

			expect(response.status).toBe(200);
		});

		it('should leave visitors out of the next pages too', async () => {
			const first = await getJson('/user-posts/popular', { as: world.r2 });
			const next = await getJson('/user-posts/popular', {
				as: world.r2,
				method: 'POST',
				body: { snapshotTime: first.snapshotTime, shownPostIds: first.posts.map((post) => String(post._id)) },
			});

			expect(next.posts.map((post) => String(post.userId._id))).not.toContain(String(world.v1._id));
		});
	});

	describe('suggestions (GET /suggestions)', () => {
		it.each(['sidebar', 'carousel', 'empty-feed'])('should never suggest a visitor to a regular user (%s)', async (placement) => {
			const { suggestions, reserve } = await getJson(`/suggestions?placement=${placement}`, { as: world.r1 });
			const suggestedIds = [...suggestions, ...reserve].map((suggestion) => String(suggestion._id));

			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestedIds).not.toContain(String(world.v1._id));
			expect(suggestedIds).not.toContain(String(world.v2._id));
		});

		it('should never suggest another visitor to a visitor', async () => {
			const { suggestions, reserve } = await getJson('/suggestions?placement=carousel', { as: world.v1 });
			const suggestedIds = [...suggestions, ...reserve].map((suggestion) => String(suggestion._id));

			expect(suggestedIds).not.toContain(String(world.v2._id));
		});
	});

	describe('likes lists', () => {
		it('should leave visitors out of the likes of a post for a regular user', async () => {
			const rows = await getJson(`/user-posts/${world.p1Post._id}/likes`, { as: world.r1 });

			expect(usernames(rows)).toEqual(['regular2', 'regular1']);
		});

		it('should leave visitors out of the likes of a post for a guest', async () => {
			const rows = await getJson(`/user-posts/${world.p1Post._id}/likes`);

			expect(usernames(rows)).toEqual(['regular2', 'regular1']);
		});

		it('should include the viewer own like but no other visitor', async () => {
			const rows = await getJson(`/user-posts/${world.p1Post._id}/likes`, { as: world.v1 });

			expect(usernames(rows)).toEqual(['regular2', 'alex_demo_1', 'regular1']);
		});

		it('should leave visitors out of the likes of a comment for a regular user', async () => {
			const rows = await getJson(`/comments/${world.cR1._id}/likes`, { as: world.r1 });

			expect(usernames(rows)).toEqual(['regular2']);
		});

		it('should include the viewer own like of a comment but no other visitor', async () => {
			const rows = await getJson(`/comments/${world.cR1._id}/likes`, { as: world.v1 });

			expect(usernames(rows)).toEqual(['alex_demo_1', 'regular2']);
		});

		it('should leave visitors out of the response to liking a post', async () => {
			const response = await request(`/user-posts/like/${world.p1Post._id}`, { as: world.r1, method: 'POST' });
			const post = await response.json();

			expect(post.likes.map(String).sort()).toEqual(ids([world.r1, world.r2]).sort());
		});

		it('should leave visitors out of the response to unliking a post', async () => {
			const response = await request(`/user-posts/unlike/${world.p1Post._id}`, { as: world.r1, method: 'POST' });
			const post = await response.json();

			expect(post.likes.map(String)).toEqual(ids([world.r2]));
		});

		it('should leave visitors out of the response to liking a comment', async () => {
			const response = await request(`/comments/${world.cR1._id}/like`, { as: world.r1, method: 'POST' });
			const comment = await response.json();

			expect(comment.likes.map(String).sort()).toEqual(ids([world.r1, world.r2]).sort());
		});

		it('should include the visitor own like in the response to liking a post as a visitor', async () => {
			const response = await request(`/user-posts/like/${world.p3Post._id}`, { as: world.v1, method: 'POST' });
			const post = await response.json();

			expect(post.likes.map(String).sort()).toEqual(ids([world.r2, world.v1]).sort());
		});
	});

	describe('comments (GET /comments/post/:userPostId)', () => {
		it('should leave the comments of visitors, and the replies to them, out for a regular user', async () => {
			const comments = await getJson(`/comments/post/${world.p1Post._id}`, { as: world.r1 });

			expect(comments.map((comment) => comment.text)).toEqual(['comment by regular1']);
			expect(comments[0].replies).toEqual([]);
		});

		it('should leave the likes of visitors off a visible comment', async () => {
			const comments = await getJson(`/comments/post/${world.p1Post._id}`, { as: world.r1 });

			expect(comments[0].likes.map(String)).toEqual(ids([world.r2]));
		});

		it('should leave visitors out for a guest', async () => {
			const comments = await getJson(`/comments/post/${world.p1Post._id}`);

			expect(comments.map((comment) => comment.text)).toEqual(['comment by regular1']);
		});

		it('should show a visitor their own comments and replies, and the replies to them', async () => {
			const comments = await getJson(`/comments/post/${world.p1Post._id}`, { as: world.v1 });
			const regularComment = comments.find((comment) => comment.text === 'comment by regular1');
			const visitorComment = comments.find((comment) => comment.text === 'comment by visitor1');

			expect(comments).toHaveLength(2);
			expect(regularComment.replies.map((reply) => reply.text)).toEqual(['reply by visitor1']);
			expect(visitorComment.replies.map((reply) => reply.text)).toEqual(['reply by regular2 to visitor1']);
		});

		it('should leave out the comments of another visitor even for a visitor', async () => {
			const comments = await getJson(`/comments/post/${world.p1Post._id}`, { as: world.v1 });

			expect(comments.map((comment) => comment.text)).not.toContain('comment by visitor2');
		});

		it('should include the likes of the viewer own visitor account on a comment', async () => {
			const comments = await getJson(`/comments/post/${world.p1Post._id}`, { as: world.v1 });
			const regularComment = comments.find((comment) => comment.text === 'comment by regular1');

			expect(regularComment.likes.map(String).sort()).toEqual(ids([world.r2, world.v1]).sort());
		});
	});

	describe('stories', () => {
		it('should leave visitors out of the viewers of a story', async () => {
			const viewers = await getJson(`/stories/${world.r1Story._id}/viewers`, { as: world.r1 });

			expect(usernames(viewers)).toEqual(['persona1']);
		});

		it('should leave visitors out of the viewer count of the own stories', async () => {
			const { stories } = await getJson(`/stories/user/${world.r1._id}`, { as: world.r1 });

			expect(stories[0].viewersCount).toBe(1);
		});

		it('should leave other visitors out of the viewers of a visitor story', async () => {
			const viewers = await getJson(`/stories/${world.v1Story._id}/viewers`, { as: world.v1 });

			expect(usernames(viewers).sort()).toEqual(['persona1', 'regular1']);
		});

		it('should leave other visitors out of the viewer count of the own stories of a visitor', async () => {
			const { stories } = await getJson(`/stories/user/${world.v1._id}`, { as: world.v1 });

			expect(stories[0].viewersCount).toBe(2);
		});
	});

	describe('requests by id that reach a visitor', () => {
		const NOT_FOUND = { user: ERROR_CODES.USER_NOT_FOUND, post: ERROR_CODES.POST_NOT_FOUND, comment: ERROR_CODES.COMMENT_NOT_FOUND };

		const visitorComment = () => CommentModel.findOne({ userPostId: world.v1Post._id });

		const send = (path, as, method, body) => request(path, { as, method, body });

		const expectNotFound = async (response, code) => {
			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code });
		};

		const signedInCases = [
			['following a visitor', (actor) => [`/users/${actor._id}/follow/${world.v1._id}`, 'POST'], NOT_FOUND.user],
			['unfollowing a visitor', (actor) => [`/users/${actor._id}/unfollow/${world.v1._id}`, 'POST'], NOT_FOUND.user],
			['liking the post of a visitor', () => [`/user-posts/like/${world.v1Post._id}`, 'POST'], NOT_FOUND.post],
			['unliking the post of a visitor', () => [`/user-posts/unlike/${world.v1Post._id}`, 'POST'], NOT_FOUND.post],
			['editing the caption of the post of a visitor', () => [`/user-posts/${world.v1Post._id}`, 'PATCH', { caption: 'x' }], NOT_FOUND.post],
			['deleting the post of a visitor', () => [`/user-posts/${world.v1Post._id}`, 'DELETE'], NOT_FOUND.post],
			[
				'commenting on the post of a visitor',
				() => ['/comments', 'POST', { userPostId: String(world.v1Post._id), text: 'hi' }],
				NOT_FOUND.post,
			],
			[
				'replying to a comment of a visitor',
				() => ['/comments', 'POST', { userPostId: String(world.p1Post._id), parentCommentId: String(world.cV1._id), text: 'hi' }],
				NOT_FOUND.comment,
			],
			['liking a comment of a visitor', () => [`/comments/${world.cV1._id}/like`, 'POST'], NOT_FOUND.comment],
			['unliking a comment of a visitor', () => [`/comments/${world.cV1._id}/unlike`, 'POST'], NOT_FOUND.comment],
			['liking a comment on the post of a visitor', async () => [`/comments/${(await visitorComment())._id}/like`, 'POST'], NOT_FOUND.comment],
			['opening the stories of a visitor', () => [`/stories/user/${world.v1._id}`, 'GET'], NOT_FOUND.user],
			['viewing a story of a visitor', () => [`/stories/${world.v1Story._id}/view`, 'POST'], ERROR_CODES.STORY_NOT_FOUND],
			['listing the viewers of a story of a visitor', () => [`/stories/${world.v1Story._id}/viewers`, 'GET'], ERROR_CODES.STORY_NOT_FOUND],
			['deleting a story of a visitor', () => [`/stories/${world.v1Story._id}`, 'DELETE'], ERROR_CODES.STORY_NOT_FOUND],
		];

		const guestCases = [
			['listing the likes of the post of a visitor', () => [`/user-posts/${world.v1Post._id}/likes`], NOT_FOUND.post],
			['listing the comments on the post of a visitor', () => [`/comments/post/${world.v1Post._id}`], NOT_FOUND.post],
			['listing the likes of a comment of a visitor', () => [`/comments/${world.cV1._id}/likes`], NOT_FOUND.comment],
			[
				'listing the likes of a comment on the post of a visitor',
				async () => [`/comments/${(await visitorComment())._id}/likes`],
				NOT_FOUND.comment,
			],
		];

		describe.each([
			['a regular user', () => world.r1],
			['a persona', () => world.p3],
			['another visitor', () => world.v2],
		])('for %s', (_name, getViewer) => {
			it.each([...signedInCases, ...guestCases])('should answer 404 when %s', async (_case, getRequest, code) => {
				const [path, method = 'GET', body] = await getRequest(getViewer());

				await expectNotFound(await send(path, getViewer(), method, body), code);
			});
		});

		describe('for a guest', () => {
			it.each(guestCases)('should answer 404 when %s', async (_case, getRequest, code) => {
				const [path] = await getRequest();

				await expectNotFound(await send(path), code);
			});
		});

		describe('without changing anything', () => {
			it('should not add a follower to the visitor', async () => {
				await send(`/users/${world.r2._id}/follow/${world.v1._id}`, world.r2, 'POST');

				expect(
					ids(
						await UserModel.find({ _id: world.v1._id })
							.lean()
							.then(([visitor]) => visitor.followers.map((id) => ({ _id: id }))),
					),
				).not.toContain(String(world.r2._id));
			});

			it('should not add a like to the post of the visitor', async () => {
				await send(`/user-posts/like/${world.v1Post._id}`, world.r2, 'POST');

				expect((await UserPostModel.findById(world.v1Post._id)).likes.map(String)).not.toContain(String(world.r2._id));
			});

			it('should not delete the post of the visitor', async () => {
				await send(`/user-posts/${world.v1Post._id}`, world.r2, 'DELETE');

				expect(await UserPostModel.findById(world.v1Post._id)).not.toBeNull();
			});

			it('should not add a comment to the post of the visitor', async () => {
				await send('/comments', world.r2, 'POST', { userPostId: String(world.v1Post._id), text: 'hi' });

				expect(await CommentModel.countDocuments({ userPostId: world.v1Post._id })).toBe(1);
			});

			it('should not record a story view or delete the story of the visitor', async () => {
				await send(`/stories/${world.v1Story._id}/view`, world.r2, 'POST');
				await send(`/stories/${world.v1Story._id}`, world.r2, 'DELETE');

				expect(await StoryViewModel.countDocuments({ storyId: world.v1Story._id, viewerId: world.r2._id })).toBe(0);
				expect(await StoryModel.findById(world.v1Story._id)).not.toBeNull();
			});
		});

		describe('for the visitor themself', () => {
			it('should open the likes of their own post', async () => {
				expect((await send(`/user-posts/${world.v1Post._id}/likes`, world.v1)).status).toBe(200);
			});

			it('should like and unlike their own post', async () => {
				expect((await send(`/user-posts/like/${world.v1Post._id}`, world.v1, 'POST')).status).toBe(200);
				expect((await send(`/user-posts/unlike/${world.v1Post._id}`, world.v1, 'POST')).status).toBe(200);
			});

			it('should edit the caption of their own post', async () => {
				const response = await send(`/user-posts/${world.v1Post._id}`, world.v1, 'PATCH', { caption: 'my caption' });

				expect(response.status).toBe(200);
				expect((await UserPostModel.findById(world.v1Post._id)).caption).toBe('my caption');
			});

			it('should list the comments on their own post', async () => {
				const comments = await getJson(`/comments/post/${world.v1Post._id}`, { as: world.v1 });

				expect(comments.map((comment) => comment.text)).toEqual(['comment on the visitor post']);
			});

			it('should comment on their own post and reply to a comment on it', async () => {
				const parent = await visitorComment();
				const comment = await send('/comments', world.v1, 'POST', { userPostId: String(world.v1Post._id), text: 'thanks' });
				const reply = await send('/comments', world.v1, 'POST', {
					userPostId: String(world.v1Post._id),
					parentCommentId: String(parent._id),
					text: 'thanks',
				});

				expect(comment.status).toBe(200);
				expect(reply.status).toBe(200);
			});

			it('should like a comment on their own post and list its likes', async () => {
				const parent = await visitorComment();

				expect((await send(`/comments/${parent._id}/like`, world.v1, 'POST')).status).toBe(200);
				expect(usernames(await getJson(`/comments/${parent._id}/likes`, { as: world.v1 }))).toEqual(['alex_demo_1']);
			});

			it('should like, list the likes of and reply to their own comment on a persona post', async () => {
				expect((await send(`/comments/${world.cV1._id}/like`, world.v1, 'POST')).status).toBe(200);
				expect((await send(`/comments/${world.cV1._id}/likes`, world.v1)).status).toBe(200);
				expect(
					(
						await send('/comments', world.v1, 'POST', {
							userPostId: String(world.p1Post._id),
							parentCommentId: String(world.cV1._id),
							text: 'again',
						})
					).status,
				).toBe(200);
			});

			it('should open their own stories, their viewers and record no view of their own', async () => {
				expect((await send(`/stories/user/${world.v1._id}`, world.v1)).status).toBe(200);
				expect((await send(`/stories/${world.v1Story._id}/viewers`, world.v1)).status).toBe(200);
				expect((await send(`/stories/${world.v1Story._id}/view`, world.v1, 'POST')).status).toBe(204);
			});

			it('should still be able to follow and unfollow a persona', async () => {
				const persona = world.personas[7];

				expect((await send(`/users/${world.v1._id}/follow/${persona._id}`, world.v1, 'POST')).status).toBe(200);
				expect((await send(`/users/${world.v1._id}/unfollow/${persona._id}`, world.v1, 'POST')).status).toBe(200);
			});
		});

		describe('for posts and stories of accounts that are not visitors', () => {
			it('should keep answering 403 POST_FORBIDDEN when editing the post of somebody else', async () => {
				const response = await send(`/user-posts/${world.p1Post._id}`, world.r1, 'PATCH', { caption: 'x' });

				expect(response.status).toBe(403);
				await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.POST_FORBIDDEN });
			});

			it('should keep answering 403 POST_FORBIDDEN when deleting the post of somebody else', async () => {
				const response = await send(`/user-posts/${world.p1Post._id}`, world.v1, 'DELETE');

				expect(response.status).toBe(403);
				await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.POST_FORBIDDEN });
			});

			it('should keep answering 403 STORY_FORBIDDEN for the viewers of the story of somebody else', async () => {
				const response = await send(`/stories/${world.r1Story._id}/viewers`, world.r2);

				expect(response.status).toBe(403);
				await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.STORY_FORBIDDEN });
			});

			it('should keep answering 403 STORY_FORBIDDEN when deleting the story of somebody else', async () => {
				const response = await send(`/stories/${world.r1Story._id}`, world.r2, 'DELETE');

				expect(response.status).toBe(403);
				await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.STORY_FORBIDDEN });
			});

			it('should still let anybody view a story of a regular user', async () => {
				expect((await send(`/stories/${world.r1Story._id}/view`, world.r2, 'POST')).status).toBe(204);
			});

			it('should still let anybody follow, like, comment on and open the stories of regular accounts', async () => {
				expect((await send(`/users/${world.r2._id}/follow/${world.r1._id}`, world.r2, 'POST')).status).toBe(200);
				expect((await send(`/user-posts/like/${world.p3Post._id}`, world.r1, 'POST')).status).toBe(200);
				expect((await send('/comments', world.r1, 'POST', { userPostId: String(world.p3Post._id), text: 'hi' })).status).toBe(200);
				expect((await send(`/stories/user/${world.r1._id}`, world.r2)).status).toBe(200);
				expect((await send(`/comments/${world.cR1._id}/likes`)).status).toBe(200);
			});

			it('should still let a visitor reply to a comment of a regular user', async () => {
				const response = await send('/comments', world.v1, 'POST', {
					userPostId: String(world.p1Post._id),
					parentCommentId: String(world.cR1._id),
					text: 'hi',
				});

				expect(response.status).toBe(200);
			});
		});

		describe('after an old follow of a visitor', () => {
			beforeEach(async () => {
				await link(world.r1, world.v1);
				await link(world.r1, world.p3);
			});

			it('should leave the posts of the visitor out of the feed', async () => {
				const { posts } = await getJson('/user-posts/followed-users-posts', { as: world.r1 });
				const postIds = posts.map((post) => String(post._id));

				expect(postIds).not.toContain(String(world.v1Post._id));
				expect(postIds).toContain(String(world.p3Post._id));
			});

			it('should leave the stories of the visitor out of the story tray', async () => {
				const tray = await getJson('/stories/tray', { as: world.r1 });
				const serialized = JSON.stringify(tray);

				expect(serialized).not.toContain(String(world.v1._id));
				expect(serialized).toContain(String(world.r1._id));
			});

			it('should still show the visitor their own story in the tray', async () => {
				expect(JSON.stringify(await getJson('/stories/tray', { as: world.v1 }))).toContain(String(world.v1._id));
			});
		});
	});

	describe('the own posts of an account', () => {
		it('leaves the likes and comments of visitors out of the answer to editing a caption', async () => {
			const response = await request(`/user-posts/${world.p1Post._id}`, { as: world.p1, method: 'PATCH', body: { caption: 'new caption' } });
			const post = await response.json();

			expect(response.status).toBe(200);
			expect(post.caption).toBe('new caption');
			expect(post.likes.map(String).sort()).toEqual(ids([world.r1, world.r2]).sort());
			expect(post.commentsCount).toBe(1);
		});

		it('leaves the likes of another visitor out of the answer to a visitor editing a caption', async () => {
			await UserPostModel.updateOne({ _id: world.v1Post._id }, { $addToSet: { likes: world.v2._id } });
			await CommentModel.create({ userPostId: world.v1Post._id, userId: world.v2._id, text: 'from the other visitor' });
			await UserPostModel.updateOne({ _id: world.v1Post._id }, { $inc: { commentsCount: 1 } });

			const response = await request(`/user-posts/${world.v1Post._id}`, { as: world.v1, method: 'PATCH', body: { caption: 'mine' } });
			const post = await response.json();

			expect(post.likes.map(String)).toEqual(ids([world.p1]));
			expect(post.commentsCount).toBe(1);
		});

		it('lists the own posts of a persona without the likes and comments of visitors', async () => {
			const posts = await getJson('/user-posts', { as: world.p1 });

			expect(posts).toHaveLength(1);
			expect(posts[0].likes.map(String).sort()).toEqual(ids([world.r1, world.r2]).sort());
			expect(posts[0].commentsCount).toBe(1);
		});

		it('lists the own posts of a visitor without the likes and comments of other visitors', async () => {
			await UserPostModel.updateOne({ _id: world.v1Post._id }, { $addToSet: { likes: world.v2._id } });

			const posts = await getJson('/user-posts', { as: world.v1 });

			expect(posts).toHaveLength(1);
			expect(posts[0].likes.map(String)).toEqual(ids([world.p1]));
		});

		it('lists nothing for an account without posts', async () => {
			expect(await getJson('/user-posts', { as: world.r2 })).toEqual([]);
		});
	});

	describe('a database failure while checking for visitors', () => {
		const failOnVisitorChecks = () => {
			const original = UserPostModel.exists.bind(UserPostModel);

			return jest
				.spyOn(UserPostModel, 'exists')
				.mockImplementation((filter) => (filter?.userId ? Promise.reject(new Error('db down')) : original(filter)));
		};

		it.each([
			[
				'replying to a comment',
				(w) => ['/comments', 'POST', { userPostId: String(w.p1Post._id), parentCommentId: String(w.cR1._id), text: 'hi' }],
			],
			['commenting on a post', (w) => ['/comments', 'POST', { userPostId: String(w.p1Post._id), text: 'hi' }]],
			['liking a comment', (w) => [`/comments/${w.cR1._id}/like`, 'POST']],
			['listing the likes of a comment', (w) => [`/comments/${w.cR1._id}/likes`, 'GET']],
			['listing the comments on a post', (w) => [`/comments/post/${w.p1Post._id}`, 'GET']],
			['listing the likes of a post', (w) => [`/user-posts/${w.p1Post._id}/likes`, 'GET']],
		])('answers a 500, not a 404, when %s', async (_name, getRequest) => {
			failOnVisitorChecks();

			const [path, method, body] = getRequest(world);
			const response = await request(path, { as: world.r1, method, body });

			expect(response.status).toBe(500);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.INTERNAL_ERROR });
		});
	});

	describe('everything else keeps working for regular accounts', () => {
		it('should show a regular user their own profile in full', async () => {
			const profile = await getProfile(world.r1, world.r1);

			expect(profile.following.map(String)).toEqual(ids([world.p1]));
		});

		it('should answer 404 for an unknown user as before', async () => {
			const response = await request(`/users?userIds=${UNKNOWN_ID}`, { as: world.r1 });

			expect(response.status).toBe(404);
		});

		it('should list regular followers of a regular user', async () => {
			await link(world.r2, world.r1);

			const rows = await getJson(`/users/${world.r1._id}/followers`, { as: world.r2 });

			expect(usernames(rows)).toEqual(['regular2']);
		});
	});
});
