const mongoose = require('mongoose');
const JWT = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const CommentModel = require('../models/commentModel');
const { ERROR_CODES } = require('../config/errorCodes');
const { likeUserPost, unlikeUserPost } = require('../services/userPostService');
const { likeComment } = require('../services/commentService');

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;
const JWT_SECRET = 'likes-list-integration-test-secret';
const UNKNOWN_ID = '64b7f0a1c2d3e4f5a6b7c8ff';

jest.setTimeout(TEST_TIMEOUT_MS);

const createUser = async (username, extra = {}) => {
	const user = await UserModel.create({ email: `${username}@example.com`, username, password: 'hashed-password', ...extra });

	return user;
};

const createPost = (author) =>
	UserPostModel.create({
		imageIdentifier: `post-${author.username}`,
		imageUrl: 'https://cdn.example.com/post.jpg',
		imageWidth: 100,
		imageHeight: 100,
		userId: author._id,
	});

const createComment = (post, author) => CommentModel.create({ userPostId: post._id, userId: author._id, text: 'a comment' });

describe('likes list endpoints against a real database', () => {
	let mongoServer;
	let server;
	let baseUrl;
	let originalJwtSecret;
	let author;
	let post;
	let comment;

	const get = (path, headers) => fetch(`${baseUrl}${path}`, { headers });

	const authHeaders = (user) => ({ 'X-Authorization': JWT.sign({ userId: String(user._id), username: user.username }, JWT_SECRET) });

	const usernamesOf = async (response) => (await response.json()).map((row) => row.username);

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
		await Promise.all([UserModel.deleteMany({}), UserPostModel.deleteMany({}), CommentModel.deleteMany({})]);

		author = await createUser('author');
		post = await createPost(author);
		comment = await createComment(post, author);
	});

	describe.each([
		['GET /user-posts/:userPostId/likes', () => `/user-posts/${post._id}/likes`, 'POST_NOT_FOUND', '/user-posts', likeUserPost],
		['GET /comments/:commentId/likes', () => `/comments/${comment._id}/likes`, 'COMMENT_NOT_FOUND', '/comments', null],
	])('%s', (_name, getPath, notFoundCode, collectionPath, likePostAction) => {
		const likeTarget = (userId) =>
			likePostAction ? likePostAction({ userPostId: post._id, userWhoLikedId: userId }) : likeComment({ commentId: comment._id, userId });

		it('lists the accounts that liked it, newest like first', async () => {
			const first = await createUser('first');
			const second = await createUser('second');
			const third = await createUser('third');

			await likeTarget(first._id);
			await likeTarget(second._id);
			await likeTarget(third._id);

			const response = await get(getPath());

			expect(response.status).toBe(200);
			await expect(usernamesOf(response)).resolves.toEqual(['third', 'second', 'first']);
		});

		it('answers an empty list when nobody liked it', async () => {
			const response = await get(getPath());

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual([]);
		});

		it('skips likes from users that no longer exist, keeping the order of the others', async () => {
			const first = await createUser('first');
			const deleted = await createUser('deleted');
			const third = await createUser('third');

			await likeTarget(first._id);
			await likeTarget(deleted._id);
			await likeTarget(third._id);
			await UserModel.deleteOne({ _id: deleted._id });

			const response = await get(getPath());

			await expect(usernamesOf(response)).resolves.toEqual(['third', 'first']);
		});

		it('is public: answers the same list with no token, a valid token or an invalid token', async () => {
			const liker = await createUser('liker');

			await likeTarget(liker._id);

			const guest = await (await get(getPath())).json();
			const loggedIn = await (await get(getPath(), authHeaders(liker))).json();
			const badToken = await get(getPath(), { 'X-Authorization': 'not-a-token' });

			expect(loggedIn).toEqual(guest);
			expect(badToken.status).toBe(200);
			await expect(badToken.json()).resolves.toEqual(guest);
		});

		it('answers only the id, username and profile picture url of each account', async () => {
			const liker = await createUser('liker', {
				bio: 'private bio',
				profilePicture: { imageUrl: 'https://cdn.example.com/liker.jpg', imageIdentifier: 'secret-identifier' },
			});

			await likeTarget(liker._id);

			const rows = await (await get(getPath())).json();

			expect(rows).toEqual([{ _id: String(liker._id), username: 'liker', profilePicture: { imageUrl: 'https://cdn.example.com/liker.jpg' } }]);
		});

		it('leaves profilePicture out for an account without a photo and never exposes private fields', async () => {
			const liker = await createUser('liker');

			await likeTarget(liker._id);

			const [row] = await (await get(getPath())).json();

			expect(Object.keys(row).sort()).toEqual(['_id', 'username']);
			['email', 'password', 'bio', 'theme', 'followers', 'following', 'posts'].forEach((field) => expect(row).not.toHaveProperty(field));
		});

		it(`answers 404 ${notFoundCode} for a malformed id`, async () => {
			const response = await get(`${collectionPath}/not-an-object-id/likes`);

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES[notFoundCode] });
		});

		it(`answers 404 ${notFoundCode} for an id that matches nothing`, async () => {
			const response = await get(`${collectionPath}/${UNKNOWN_ID}/likes`);

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES[notFoundCode] });
		});
	});

	describe('likes follow like and unlike', () => {
		it('drops an account from the post list once it unliked', async () => {
			const first = await createUser('first');
			const second = await createUser('second');

			await likeUserPost({ userPostId: post._id, userWhoLikedId: first._id });
			await likeUserPost({ userPostId: post._id, userWhoLikedId: second._id });
			await unlikeUserPost({ userPostId: post._id, userWhoUnlikedId: first._id });

			const response = await get(`/user-posts/${post._id}/likes`);

			await expect(usernamesOf(response)).resolves.toEqual(['second']);
		});

		it('lists an account once, however many times the like was repeated', async () => {
			const liker = await createUser('liker');

			await likeUserPost({ userPostId: post._id, userWhoLikedId: liker._id });
			await likeUserPost({ userPostId: post._id, userWhoLikedId: liker._id });

			const response = await get(`/user-posts/${post._id}/likes`);

			await expect(usernamesOf(response)).resolves.toEqual(['liker']);
		});

		it('keeps the likes of a post and of its comment apart', async () => {
			const postLiker = await createUser('postliker');
			const commentLiker = await createUser('commentliker');

			await likeUserPost({ userPostId: post._id, userWhoLikedId: postLiker._id });
			await likeComment({ commentId: comment._id, userId: commentLiker._id });

			await expect(usernamesOf(await get(`/user-posts/${post._id}/likes`))).resolves.toEqual(['postliker']);
			await expect(usernamesOf(await get(`/comments/${comment._id}/likes`))).resolves.toEqual(['commentliker']);
		});
	});

	describe('the routes that share the extracted user row query', () => {
		let alice;
		let bob;
		let carol;

		beforeEach(async () => {
			alice = await createUser('alice', { profilePicture: { imageUrl: 'https://cdn.example.com/alice.jpg', imageIdentifier: 'alice-id' } });
			bob = await createUser('bob');
			carol = await createUser('carol');

			await UserModel.updateOne(
				{ _id: author._id },
				{ $set: { followers: [alice._id, bob._id, carol._id], following: [carol._id, alice._id] } },
			);
		});

		it('lists followers in the stored order for a guest, with only id, username and photo', async () => {
			const response = await get(`/users/${author._id}/followers`);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual([
				{ _id: String(alice._id), username: 'alice', profilePicture: { imageUrl: 'https://cdn.example.com/alice.jpg' } },
				{ _id: String(bob._id), username: 'bob' },
				{ _id: String(carol._id), username: 'carol' },
			]);
		});

		it('lists following in the stored order', async () => {
			const response = await get(`/users/${author._id}/following`);

			await expect(usernamesOf(response)).resolves.toEqual(['carol', 'alice']);
		});

		it('moves the logged-in requester to the top of the followers', async () => {
			const response = await get(`/users/${author._id}/followers`, authHeaders(carol));

			await expect(usernamesOf(response)).resolves.toEqual(['carol', 'alice', 'bob']);
		});

		it('skips followers that no longer exist', async () => {
			await UserModel.deleteOne({ _id: bob._id });

			const response = await get(`/users/${author._id}/followers`);

			await expect(usernamesOf(response)).resolves.toEqual(['alice', 'carol']);
		});

		it('answers 404 USER_NOT_FOUND for an unknown profile', async () => {
			const response = await get(`/users/${UNKNOWN_ID}/followers`);

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.USER_NOT_FOUND });
		});

		it('searches usernames by prefix and still adds the follower count to each row', async () => {
			const response = await get('/users?searchWord=ali');

			await expect(response.json()).resolves.toEqual([
				{ _id: String(alice._id), username: 'alice', profilePicture: { imageUrl: 'https://cdn.example.com/alice.jpg' }, followersCount: 0 },
			]);
		});

		it('counts the followers of a searched account', async () => {
			const response = await get('/users?searchWord=auth');

			const [row] = await response.json();

			expect(row).toEqual({ _id: String(author._id), username: 'author', followersCount: 3 });
		});
	});
});
