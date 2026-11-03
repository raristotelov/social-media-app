const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { ERROR_CODES } = require('../config/errorCodes');
const CommentModel = require('../models/commentModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const {
	assertCommentNotHidden,
	assertPostNotHidden,
	assertUserNotHidden,
	createPostVisibility,
	isHiddenId,
	withoutHiddenIds,
} = require('./visitorVisibilityService');

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

const newId = () => new mongoose.Types.ObjectId();

describe('isHiddenId', () => {
	it('is true for an id in the hidden list', () => {
		const hidden = newId();

		expect(isHiddenId(hidden, [newId(), hidden])).toBe(true);
	});

	it('is false for an id that is not in the hidden list', () => {
		expect(isHiddenId(newId(), [newId()])).toBe(false);
	});

	it('is false for every id when nothing is hidden', () => {
		expect(isHiddenId(newId(), [])).toBe(false);
	});

	it('compares by value across strings and object ids', () => {
		const hidden = newId();

		expect(isHiddenId(String(hidden), [hidden])).toBe(true);
		expect(isHiddenId(new mongoose.Types.ObjectId(String(hidden)), [String(hidden)])).toBe(true);
	});

	it('is false for a missing id', () => {
		expect(isHiddenId(undefined, [newId()])).toBe(false);
	});
});

describe('the hidden id lookup shared by withoutHiddenIds and isHiddenId', () => {
	it('gives the right answer every time the same hidden list is used', () => {
		const [hiddenA, hiddenB, visible] = [newId(), newId(), newId()];
		const hidden = [hiddenA, hiddenB];

		expect(withoutHiddenIds([hiddenA, visible], hidden).map(String)).toEqual([String(visible)]);
		expect(withoutHiddenIds([hiddenB, visible], hidden).map(String)).toEqual([String(visible)]);
		expect(isHiddenId(hiddenA, hidden)).toBe(true);
		expect(isHiddenId(visible, hidden)).toBe(false);
		expect(withoutHiddenIds([hiddenA, hiddenB, visible], hidden).map(String)).toEqual([String(visible)]);
	});

	it('keeps different hidden lists apart, even when they are used one after the other', () => {
		const [first, second] = [newId(), newId()];

		expect(withoutHiddenIds([first, second], [first]).map(String)).toEqual([String(second)]);
		expect(withoutHiddenIds([first, second], [second]).map(String)).toEqual([String(first)]);
	});

	it('does not mix up two lists with the same content', () => {
		const hiddenId = newId();

		expect(withoutHiddenIds([hiddenId], [hiddenId])).toEqual([]);
		expect(withoutHiddenIds([hiddenId], [hiddenId])).toEqual([]);
	});

	it('answers quickly for a long list of ids against a long hidden list', () => {
		const hidden = Array.from({ length: 2000 }, newId);
		const ids = [...hidden.slice(0, 1000), ...Array.from({ length: 5000 }, newId)];
		const startedAt = Date.now();

		const visible = withoutHiddenIds(ids, hidden);

		expect(visible).toHaveLength(5000);
		expect(Date.now() - startedAt).toBeLessThan(500);
	});
});

describe('assertUserNotHidden', () => {
	it('throws a 404 USER_NOT_FOUND for a hidden user', () => {
		const hidden = newId();

		expect(() => assertUserNotHidden(hidden, [hidden])).toThrow(expect.objectContaining({ statusCode: 404, code: ERROR_CODES.USER_NOT_FOUND }));
	});

	it('does nothing for a user that is not hidden', () => {
		expect(() => assertUserNotHidden(newId(), [newId()])).not.toThrow();
	});

	it('does nothing when nothing is hidden', () => {
		expect(() => assertUserNotHidden(newId(), [])).not.toThrow();
	});
});

describe('the post and comment guards against a real database', () => {
	let mongoServer;
	let hiddenUser;
	let visibleUser;
	let hiddenPost;
	let visiblePost;
	let hiddenIds;

	const createUser = (username, accountType) =>
		UserModel.create({ email: `${username}@example.com`, username, password: 'hashed-password', accountType });

	let counter = 0;

	const createPost = (owner) => {
		counter += 1;

		return UserPostModel.create({
			imageIdentifier: `post-${counter}`,
			imageUrl: `https://cdn.example.com/post-${counter}.jpg`,
			imageWidth: 100,
			imageHeight: 100,
			userId: owner._id,
		});
	};

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

		hiddenUser = await createUser('alex_demo_1', 'demo');
		visibleUser = await createUser('regular', 'user');
		hiddenPost = await createPost(hiddenUser);
		visiblePost = await createPost(visibleUser);
		hiddenIds = [hiddenUser._id];
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('assertPostNotHidden', () => {
		it('throws a 404 POST_NOT_FOUND for the post of a hidden user', async () => {
			await expect(assertPostNotHidden(hiddenPost._id, hiddenIds)).rejects.toMatchObject({ statusCode: 404, code: ERROR_CODES.POST_NOT_FOUND });
		});

		it('does nothing for the post of somebody else', async () => {
			await expect(assertPostNotHidden(visiblePost._id, hiddenIds)).resolves.toBeUndefined();
		});

		it('does nothing for a post that does not exist', async () => {
			await expect(assertPostNotHidden(newId(), hiddenIds)).resolves.toBeUndefined();
		});

		it('does not touch the database when nothing is hidden', async () => {
			const existsSpy = jest.spyOn(UserPostModel, 'exists');

			await assertPostNotHidden(hiddenPost._id, []);

			expect(existsSpy).not.toHaveBeenCalled();
		});

		it('lets a database failure surface as it is, not as a 404', async () => {
			const failure = new Error('connection lost');

			jest.spyOn(UserPostModel, 'exists').mockRejectedValue(failure);

			await expect(assertPostNotHidden(hiddenPost._id, hiddenIds)).rejects.toBe(failure);
		});
	});

	describe('assertCommentNotHidden', () => {
		it('throws a 404 COMMENT_NOT_FOUND for a comment written by a hidden user', async () => {
			const comment = await CommentModel.create({ userPostId: visiblePost._id, userId: hiddenUser._id, text: 'hello' });

			await expect(assertCommentNotHidden(comment._id, hiddenIds)).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.COMMENT_NOT_FOUND,
			});
		});

		it('throws a 404 COMMENT_NOT_FOUND for a comment on the post of a hidden user', async () => {
			const comment = await CommentModel.create({ userPostId: hiddenPost._id, userId: visibleUser._id, text: 'hello' });

			await expect(assertCommentNotHidden(comment._id, hiddenIds)).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.COMMENT_NOT_FOUND,
			});
		});

		it('does nothing for a visible comment on a visible post', async () => {
			const comment = await CommentModel.create({ userPostId: visiblePost._id, userId: visibleUser._id, text: 'hello' });

			await expect(assertCommentNotHidden(comment._id, hiddenIds)).resolves.toBeUndefined();
		});

		it('does nothing for a comment that does not exist, so the caller can answer its own not-found', async () => {
			await expect(assertCommentNotHidden(newId(), hiddenIds)).resolves.toBeUndefined();
		});

		it('does not touch the database when nothing is hidden', async () => {
			const findSpy = jest.spyOn(CommentModel, 'findById');

			await assertCommentNotHidden(newId(), []);

			expect(findSpy).not.toHaveBeenCalled();
		});

		it('lets a failure of the comment lookup surface as it is, not as a 404', async () => {
			const failure = new Error('connection lost');
			const comment = await CommentModel.create({ userPostId: visiblePost._id, userId: visibleUser._id, text: 'hello' });

			jest.spyOn(CommentModel, 'findById').mockImplementation(() => {
				throw failure;
			});

			await expect(assertCommentNotHidden(comment._id, hiddenIds)).rejects.toBe(failure);
		});

		it('lets a failure of the post lookup surface as it is, not as a 404', async () => {
			const failure = new Error('connection lost');
			const comment = await CommentModel.create({ userPostId: visiblePost._id, userId: visibleUser._id, text: 'hello' });

			jest.spyOn(UserPostModel, 'exists').mockRejectedValue(failure);

			await expect(assertCommentNotHidden(comment._id, hiddenIds)).rejects.toBe(failure);
		});

		it('looks the post up once, with a single existence check', async () => {
			const existsSpy = jest.spyOn(UserPostModel, 'exists');
			const comment = await CommentModel.create({ userPostId: visiblePost._id, userId: visibleUser._id, text: 'hello' });

			await assertCommentNotHidden(comment._id, hiddenIds);

			expect(existsSpy).toHaveBeenCalledTimes(1);
			expect(existsSpy).toHaveBeenCalledWith({ _id: visiblePost._id, userId: { $in: hiddenIds } });
		});
	});

	describe('createPostVisibility counting replies to hidden comments', () => {
		it('counts a reply to a hidden comment on the same post as hidden', async () => {
			const hiddenComment = await CommentModel.create({ userPostId: visiblePost._id, userId: hiddenUser._id, text: 'hidden' });

			await CommentModel.create({ userPostId: visiblePost._id, userId: visibleUser._id, text: 'reply', parentCommentId: hiddenComment._id });

			const applyVisibility = await createPostVisibility([visiblePost._id], hiddenIds);

			expect(applyVisibility({ _id: visiblePost._id, likes: [], commentsCount: 2 }).commentsCount).toBe(0);
		});

		it('only looks for replies on the posts it was asked about', async () => {
			const hiddenComment = await CommentModel.create({ userPostId: visiblePost._id, userId: hiddenUser._id, text: 'hidden' });
			const otherPost = await createPost(visibleUser);

			await CommentModel.create({
				userPostId: otherPost._id,
				userId: visibleUser._id,
				text: 'stray reply',
				parentCommentId: hiddenComment._id,
			});

			const applyVisibility = await createPostVisibility([visiblePost._id], hiddenIds);

			expect(applyVisibility({ _id: visiblePost._id, likes: [], commentsCount: 1 }).commentsCount).toBe(0);
			expect(applyVisibility({ _id: otherPost._id, likes: [], commentsCount: 1 }).commentsCount).toBe(1);
		});

		it('asks the database for the replies of the given posts only', async () => {
			const findSpy = jest.spyOn(CommentModel, 'find');

			await createPostVisibility([visiblePost._id], hiddenIds);

			const replyFilter = findSpy.mock.calls.map(([filter]) => filter).find((filter) => filter.parentCommentId);

			expect(replyFilter.userPostId).toEqual({ $in: [visiblePost._id] });
		});

		it('counts each hidden comment once per post', async () => {
			await CommentModel.create({ userPostId: visiblePost._id, userId: hiddenUser._id, text: 'one' });
			await CommentModel.create({ userPostId: visiblePost._id, userId: hiddenUser._id, text: 'two' });
			await CommentModel.create({ userPostId: visiblePost._id, userId: visibleUser._id, text: 'visible' });

			const applyVisibility = await createPostVisibility([visiblePost._id], hiddenIds);

			expect(applyVisibility({ _id: visiblePost._id, likes: [], commentsCount: 3 }).commentsCount).toBe(1);
		});
	});
});
