const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const CommentModel = require('../models/commentModel');
const UserModel = require('../models/userModel');
const { createPostVisibility, getHiddenVisitorIds, withoutHiddenCommentLikes, withoutHiddenIds } = require('./visitorVisibilityService');

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

const newId = () => new mongoose.Types.ObjectId();

const createUser = (username, accountType) =>
	UserModel.create({ email: `${username}@example.com`, username, password: 'hashed-password', ...(accountType ? { accountType } : {}) });

describe('withoutHiddenIds', () => {
	it('should return the same list when nothing is hidden', () => {
		const ids = [newId(), newId()];

		expect(withoutHiddenIds(ids, [])).toBe(ids);
	});

	it('should remove the hidden ids', () => {
		const [kept, hidden] = [newId(), newId()];

		expect(withoutHiddenIds([kept, hidden], [hidden]).map(String)).toEqual([String(kept)]);
	});

	it('should compare ids by value, not by reference', () => {
		const hidden = newId();

		expect(withoutHiddenIds([new mongoose.Types.ObjectId(String(hidden))], [hidden])).toEqual([]);
	});

	it('should compare an id string with an object id', () => {
		const hidden = newId();

		expect(withoutHiddenIds([String(hidden)], [hidden])).toEqual([]);
	});

	it('should keep the order of the visible ids', () => {
		const [first, hidden, third] = [newId(), newId(), newId()];

		expect(withoutHiddenIds([first, hidden, third], [hidden]).map(String)).toEqual([String(first), String(third)]);
	});

	it('should return an empty list for an empty list', () => {
		expect(withoutHiddenIds([], [newId()])).toEqual([]);
	});
});

describe('withoutHiddenCommentLikes', () => {
	it('should return the comment itself when nothing is hidden', () => {
		const comment = { _id: newId(), likes: [newId()] };

		expect(withoutHiddenCommentLikes(comment, [])).toBe(comment);
	});

	it('should remove the hidden likes of a plain comment', () => {
		const [visibleLike, hiddenLike] = [newId(), newId()];
		const result = withoutHiddenCommentLikes({ _id: newId(), text: 'Nice', likes: [visibleLike, hiddenLike] }, [hiddenLike]);

		expect(result.likes.map(String)).toEqual([String(visibleLike)]);
		expect(result.text).toBe('Nice');
	});

	it('should accept a document with toObject', () => {
		const [visibleLike, hiddenLike] = [newId(), newId()];
		const document = { toObject: () => ({ _id: newId(), likes: [visibleLike, hiddenLike] }) };

		expect(withoutHiddenCommentLikes(document, [hiddenLike]).likes.map(String)).toEqual([String(visibleLike)]);
	});

	it('should treat a comment without likes as having none', () => {
		expect(withoutHiddenCommentLikes({ _id: newId() }, [newId()]).likes).toEqual([]);
	});
});

describe('visitor visibility against a real database', () => {
	let mongoServer;

	beforeAll(async () => {
		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), CommentModel.init()]);
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await mongoose.disconnect();
		await mongoServer?.stop();
	});

	beforeEach(async () => {
		await Promise.all([UserModel.deleteMany({}), CommentModel.deleteMany({})]);
	});

	describe('getHiddenVisitorIds', () => {
		it('should list every demo account', async () => {
			const visitorA = await createUser('visitor_a', 'demo');
			const visitorB = await createUser('visitor_b', 'demo');

			const hidden = await getHiddenVisitorIds(undefined);

			expect(hidden.map(String).sort()).toEqual([String(visitorA._id), String(visitorB._id)].sort());
		});

		it('should leave out the viewer own demo account', async () => {
			const own = await createUser('own', 'demo');
			const other = await createUser('other', 'demo');

			const hidden = await getHiddenVisitorIds(own._id);

			expect(hidden.map(String)).toEqual([String(other._id)]);
		});

		it('should leave out the viewer when the id is a string', async () => {
			const own = await createUser('own', 'demo');

			expect(await getHiddenVisitorIds(String(own._id))).toEqual([]);
		});

		it('should never list regular users', async () => {
			await createUser('regular', 'user');
			await createUser('default');

			expect(await getHiddenVisitorIds(undefined)).toEqual([]);
		});

		it('should never list personas', async () => {
			await createUser('persona', 'persona');

			expect(await getHiddenVisitorIds(undefined)).toEqual([]);
		});

		it('should key on the account type, not on the email', async () => {
			await UserModel.create({
				email: 'someone@visitor.demo.invalid',
				username: 'lookalike',
				password: 'hashed-password',
				accountType: 'user',
			});
			const realVisitor = await UserModel.create({
				email: 'plain@example.com',
				username: 'real',
				password: 'hashed-password',
				accountType: 'demo',
			});

			expect((await getHiddenVisitorIds(undefined)).map(String)).toEqual([String(realVisitor._id)]);
		});

		it('should list nobody when there are no demo accounts', async () => {
			expect(await getHiddenVisitorIds(undefined)).toEqual([]);
		});
	});

	describe('createPostVisibility', () => {
		const buildPost = (overrides = {}) => ({ _id: newId(), likes: [], commentsCount: 0, caption: 'A post', ...overrides });

		it('should return the post untouched when nothing is hidden', async () => {
			const post = buildPost({ likes: [newId()] });
			const applyVisibility = await createPostVisibility([post._id], []);

			expect(applyVisibility(post)).toBe(post);
		});

		it('should remove hidden likes', async () => {
			const [visibleLike, hiddenLike] = [newId(), newId()];
			const post = buildPost({ likes: [visibleLike, hiddenLike] });
			const applyVisibility = await createPostVisibility([post._id], [hiddenLike]);

			expect(applyVisibility(post).likes.map(String)).toEqual([String(visibleLike)]);
		});

		it('should keep the other fields of the post', async () => {
			const hidden = newId();
			const post = buildPost({ likes: [hidden] });
			const applyVisibility = await createPostVisibility([post._id], [hidden]);

			expect(applyVisibility(post)).toMatchObject({ _id: post._id, caption: 'A post' });
		});

		it('should treat a post without likes as having none', async () => {
			const post = buildPost();

			delete post.likes;

			const applyVisibility = await createPostVisibility([post._id], [newId()]);

			expect(applyVisibility(post).likes).toEqual([]);
		});

		it('should accept a document with toObject', async () => {
			const [visibleLike, hiddenLike] = [newId(), newId()];
			const post = buildPost({ likes: [visibleLike, hiddenLike] });
			const document = { toObject: () => post };
			const applyVisibility = await createPostVisibility([post._id], [hiddenLike]);

			expect(applyVisibility(document).likes.map(String)).toEqual([String(visibleLike)]);
		});

		it('should take the comments of hidden accounts off the comment count', async () => {
			const hiddenUser = await createUser('hidden', 'demo');
			const visibleUser = await createUser('visible');
			const post = buildPost({ commentsCount: 3 });

			await CommentModel.create({ userPostId: post._id, userId: hiddenUser._id, text: 'hidden comment' });
			await CommentModel.create({ userPostId: post._id, userId: visibleUser._id, text: 'visible comment' });
			await CommentModel.create({ userPostId: post._id, userId: visibleUser._id, text: 'another visible comment' });

			const applyVisibility = await createPostVisibility([post._id], [hiddenUser._id]);

			expect(applyVisibility(post).commentsCount).toBe(2);
		});

		it('should take replies to a hidden comment off the comment count too', async () => {
			const hiddenUser = await createUser('hidden', 'demo');
			const visibleUser = await createUser('visible');
			const post = buildPost({ commentsCount: 3 });
			const hiddenComment = await CommentModel.create({ userPostId: post._id, userId: hiddenUser._id, text: 'hidden comment' });

			await CommentModel.create({ userPostId: post._id, userId: visibleUser._id, text: 'reply', parentCommentId: hiddenComment._id });
			await CommentModel.create({ userPostId: post._id, userId: visibleUser._id, text: 'visible comment' });

			const applyVisibility = await createPostVisibility([post._id], [hiddenUser._id]);

			expect(applyVisibility(post).commentsCount).toBe(1);
		});

		it('should only count the hidden comments of the same post', async () => {
			const hiddenUser = await createUser('hidden', 'demo');
			const post = buildPost({ commentsCount: 2 });
			const otherPost = buildPost({ commentsCount: 1 });

			await CommentModel.create({ userPostId: otherPost._id, userId: hiddenUser._id, text: 'on the other post' });

			const applyVisibility = await createPostVisibility([post._id, otherPost._id], [hiddenUser._id]);

			expect(applyVisibility(post).commentsCount).toBe(2);
			expect(applyVisibility(otherPost).commentsCount).toBe(0);
		});

		it('should never let the comment count go below zero', async () => {
			const hiddenUser = await createUser('hidden', 'demo');
			const post = buildPost({ commentsCount: 0 });

			await CommentModel.create({ userPostId: post._id, userId: hiddenUser._id, text: 'hidden comment' });

			const applyVisibility = await createPostVisibility([post._id], [hiddenUser._id]);

			expect(applyVisibility(post).commentsCount).toBe(0);
		});

		it('should treat a post without a comment count as having none', async () => {
			const post = buildPost();

			delete post.commentsCount;

			const applyVisibility = await createPostVisibility([post._id], [newId()]);

			expect(applyVisibility(post).commentsCount).toBe(0);
		});
	});
});
