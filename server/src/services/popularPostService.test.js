jest.mock('../models/userPostModel', () => ({
	aggregate: jest.fn(),
	findById: jest.fn(),
	populate: jest.fn(),
}));
jest.mock('../models/userModel', () => ({
	findById: jest.fn(),
}));
jest.mock('../models/commentModel', () => ({
	collection: { name: 'comments' },
}));
jest.mock('./commentService', () => ({
	getPreviewCommentsForPosts: jest.fn(),
}));

const mongoose = require('mongoose');

const UserPostModel = require('../models/userPostModel');
const UserModel = require('../models/userModel');
const commentService = require('./commentService');
const { ERROR_CODES } = require('../config/errorCodes');
const { POPULAR_POSTS_PAGE_SIZE, MAX_SHOWN_POST_IDS } = require('../config/popularPosts');
const AppError = require('../utils/AppError');
const { getPopularPosts, getNextPopularPosts } = require('./popularPostService');

const NOW = new Date('2026-10-24T12:00:00.000Z');
const SNAPSHOT_TIME = '2026-10-24T10:00:00.000Z';

const buildId = (value) => new mongoose.Types.ObjectId(value.toString(16).padStart(24, '0'));

const ME = buildId(1);
const FOLLOWED_A = buildId(2);
const FOLLOWED_B = buildId(3);

const buildPost = (value) => ({ _id: buildId(100 + value), userId: buildId(50 + value), caption: `post ${value}` });

const buildPosts = (count) => Array.from({ length: count }, (_item, index) => buildPost(index + 1));

const buildLeanQuery = (result) => {
	const query = {};

	query.select = jest.fn().mockReturnValue(query);
	query.lean = jest.fn().mockResolvedValue(result);

	return query;
};

const buildLeanFind = (result) => ({ lean: jest.fn().mockResolvedValue(result) });

const expectAppError = async (promise, { statusCode, code }) => {
	const error = await promise.then(
		() => null,
		(rejection) => rejection,
	);

	expect(error).toBeInstanceOf(AppError);
	expect(error.statusCode).toBe(statusCode);
	expect(error.code).toBe(code);
};

describe('popularPostService', () => {
	let rankedPosts;

	const getPipeline = () => UserPostModel.aggregate.mock.calls[0][0];

	const getMatch = () => getPipeline()[0].$match;

	const getLimit = () => getPipeline().find((stage) => stage.$limit !== undefined).$limit;

	const getIds = (result) => result.posts.map((post) => post._id.toString());

	beforeEach(() => {
		jest.resetAllMocks();
		jest.useFakeTimers({ now: NOW });

		rankedPosts = [];

		UserPostModel.aggregate.mockImplementation(async () => rankedPosts);
		UserPostModel.populate.mockImplementation(async (posts) => posts);
		UserModel.findById.mockReturnValue(buildLeanQuery({ _id: ME, following: [FOLLOWED_A, FOLLOWED_B] }));
		commentService.getPreviewCommentsForPosts.mockResolvedValue({});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe('getPopularPosts', () => {
		describe('who sees what', () => {
			it('does not look any user up for a guest, and leaves no author out', async () => {
				await getPopularPosts({ userId: undefined });

				expect(UserModel.findById).not.toHaveBeenCalled();
				expect(getMatch().userId).toEqual({ $nin: [] });
			});

			it('leaves out the logged-in user and everyone they follow', async () => {
				await getPopularPosts({ userId: ME.toString() });

				expect(getMatch().userId).toEqual({ $nin: [ME, FOLLOWED_A, FOLLOWED_B] });
			});

			it('leaves out only the user themself when they follow nobody', async () => {
				UserModel.findById.mockReturnValue(buildLeanQuery({ _id: ME }));

				await getPopularPosts({ userId: ME.toString() });

				expect(getMatch().userId).toEqual({ $nin: [ME] });
			});

			it('answers 401 UNAUTHENTICATED when the user in the token no longer exists', async () => {
				UserModel.findById.mockReturnValue(buildLeanQuery(null));

				await expectAppError(getPopularPosts({ userId: ME.toString() }), { statusCode: 401, code: ERROR_CODES.UNAUTHENTICATED });
				expect(UserPostModel.aggregate).not.toHaveBeenCalled();
			});
		});

		describe('the page', () => {
			it('uses the time the request came in as the snapshot time, as an ISO string', async () => {
				const result = await getPopularPosts({});

				expect(result.snapshotTime).toBe(NOW.toISOString());
			});

			it('only ranks posts created up to the snapshot time', async () => {
				await getPopularPosts({});

				expect(getMatch().createdAt).toEqual({ $lte: NOW });
			});

			it('asks for one more post than a page holds, to learn whether more follow', async () => {
				await getPopularPosts({});

				expect(getLimit()).toBe(POPULAR_POSTS_PAGE_SIZE + 1);
			});

			it('sorts by score, highest first, with the newest id breaking ties', async () => {
				await getPopularPosts({});

				expect(getPipeline().find((stage) => stage.$sort).$sort).toEqual({ popularityScore: -1, _id: -1 });
			});

			it('scores with the comment count stored on the post, treating a missing count as 0', async () => {
				await getPopularPosts({});

				const scoreFields = getPipeline().find((stage) => stage.$addFields).$addFields;

				expect(scoreFields.storedCommentsCount).toEqual({ $ifNull: ['$commentsCount', 0] });
			});

			it('does not count the comments collection while ranking', async () => {
				await getPopularPosts({});

				expect(getPipeline().some((stage) => stage.$lookup)).toBe(false);
			});

			it('weighs the stored comment count into the score', async () => {
				await getPopularPosts({});

				const [, scoreStage] = getPipeline().filter((stage) => stage.$addFields);

				expect(JSON.stringify(scoreStage.$addFields.popularityScore.$divide[0])).toBe(
					JSON.stringify({ $add: ['$likesCount', { $multiply: [2, '$storedCommentsCount'] }] }),
				);
			});

			it('drops the scoring fields from the posts it returns, keeping the stored commentsCount', async () => {
				await getPopularPosts({});

				const projection = getPipeline().find((stage) => stage.$project).$project;

				expect(Object.keys(projection).sort()).toEqual(['ageHours', 'likesCount', 'popularityScore', 'storedCommentsCount']);
				expect(Object.values(projection).every((value) => value === 0)).toBe(true);
			});

			it('returns every ranked post, without hasMore, when fewer than a page exist', async () => {
				rankedPosts = buildPosts(5);

				const result = await getPopularPosts({});

				expect(result.posts).toHaveLength(5);
				expect(result.hasMore).toBe(false);
			});

			it('returns no posts and no hasMore when none exist', async () => {
				const result = await getPopularPosts({});

				expect(result).toEqual({ posts: [], snapshotTime: NOW.toISOString(), hasMore: false });
			});

			it('returns exactly a page without hasMore when nothing follows it', async () => {
				rankedPosts = buildPosts(POPULAR_POSTS_PAGE_SIZE);

				const result = await getPopularPosts({});

				expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
				expect(result.hasMore).toBe(false);
			});

			it('returns a page and hasMore when a further post exists, dropping the extra one', async () => {
				rankedPosts = buildPosts(POPULAR_POSTS_PAGE_SIZE + 1);

				const result = await getPopularPosts({});

				expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
				expect(result.hasMore).toBe(true);
				expect(getIds(result)).not.toContain(rankedPosts[POPULAR_POSTS_PAGE_SIZE]._id.toString());
			});

			it('keeps the ranked order', async () => {
				rankedPosts = buildPosts(4);

				const result = await getPopularPosts({});

				expect(getIds(result)).toEqual(rankedPosts.map((post) => post._id.toString()));
			});

			it('leaves no post out of the ranking on the first page', async () => {
				await getPopularPosts({});

				expect(getMatch()._id).toEqual({ $nin: [] });
			});
		});

		describe('the comment data on each post', () => {
			it('populates the author of every post with the username and profile picture', async () => {
				rankedPosts = buildPosts(2);

				await getPopularPosts({});

				expect(UserPostModel.populate).toHaveBeenCalledWith(rankedPosts, { path: 'userId', select: 'username profilePicture' });
			});

			it('adds the preview comments to each post, defaulting to an empty list', async () => {
				rankedPosts = buildPosts(2);
				const [first, second] = rankedPosts;
				const preview = [{ _id: buildId(900), text: 'Nice' }];

				commentService.getPreviewCommentsForPosts.mockResolvedValue({ [first._id.toString()]: preview });

				const result = await getPopularPosts({});

				expect(result.posts[0]).toMatchObject({ _id: first._id, previewComments: preview });
				expect(result.posts[1]).toMatchObject({ _id: second._id, previewComments: [] });
			});

			it('keeps the stored commentsCount of each post as it came from the ranking', async () => {
				rankedPosts = [
					{ ...buildPost(1), commentsCount: 7 },
					{ ...buildPost(2), commentsCount: 0 },
				];

				const result = await getPopularPosts({});

				expect(result.posts.map((post) => post.commentsCount)).toEqual([7, 0]);
			});

			it('does not count the comments of the posts again', async () => {
				rankedPosts = [{ ...buildPost(1), commentsCount: 7 }];
				commentService.getPreviewCommentsForPosts.mockResolvedValue({
					[rankedPosts[0]._id.toString()]: [{ _id: buildId(900) }, { _id: buildId(901) }],
				});

				const result = await getPopularPosts({});

				expect(result.posts[0].commentsCount).toBe(7);
			});

			it('asks for the previews of exactly the returned posts', async () => {
				rankedPosts = buildPosts(3);

				await getPopularPosts({});

				expect(commentService.getPreviewCommentsForPosts).toHaveBeenCalledWith(rankedPosts.map((post) => post._id));
			});
		});

		describe('the first post', () => {
			const firstPost = { _id: buildId(777), userId: buildId(60), caption: 'shared' };

			beforeEach(() => {
				UserPostModel.findById.mockReturnValue(buildLeanFind(firstPost));
			});

			it('puts the named post first, ahead of the ranked ones', async () => {
				rankedPosts = buildPosts(3);

				const result = await getPopularPosts({ firstPostId: firstPost._id.toString() });

				expect(getIds(result)).toEqual([firstPost._id.toString(), ...rankedPosts.map((post) => post._id.toString())]);
			});

			it('leaves the named post out of the ranking so it does not appear twice', async () => {
				await getPopularPosts({ firstPostId: firstPost._id.toString() });

				expect(getMatch()._id).toEqual({ $nin: [firstPost._id] });
			});

			it('ranks one post fewer, so the page still holds 30', async () => {
				await getPopularPosts({ firstPostId: firstPost._id.toString() });

				expect(getLimit()).toBe(POPULAR_POSTS_PAGE_SIZE);
			});

			it('returns a full page of 30 with hasMore when more posts exist', async () => {
				rankedPosts = buildPosts(POPULAR_POSTS_PAGE_SIZE);

				const result = await getPopularPosts({ firstPostId: firstPost._id.toString() });

				expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
				expect(result.hasMore).toBe(true);
			});

			it('returns a full page of 30 without hasMore when nothing follows', async () => {
				rankedPosts = buildPosts(POPULAR_POSTS_PAGE_SIZE - 1);

				const result = await getPopularPosts({ firstPostId: firstPost._id.toString() });

				expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
				expect(result.hasMore).toBe(false);
			});

			it('shows the named post even when it belongs to a followed author, since it was asked for', async () => {
				UserPostModel.findById.mockReturnValue(buildLeanFind({ ...firstPost, userId: FOLLOWED_A }));

				const result = await getPopularPosts({ userId: ME.toString(), firstPostId: firstPost._id.toString() });

				expect(getIds(result)[0]).toBe(firstPost._id.toString());
			});

			it('answers 404 POST_NOT_FOUND when the post no longer exists', async () => {
				UserPostModel.findById.mockReturnValue(buildLeanFind(null));

				await expectAppError(getPopularPosts({ firstPostId: firstPost._id.toString() }), {
					statusCode: 404,
					code: ERROR_CODES.POST_NOT_FOUND,
				});
				expect(UserPostModel.aggregate).not.toHaveBeenCalled();
			});

			it.each([['not-an-id'], ['123'], ['zzzzzzzzzzzzzzzzzzzzzzzz']])(
				'answers 404 POST_NOT_FOUND for the malformed id %s, without looking it up',
				async (malformedId) => {
					await expectAppError(getPopularPosts({ firstPostId: malformedId }), { statusCode: 404, code: ERROR_CODES.POST_NOT_FOUND });
					expect(UserPostModel.findById).not.toHaveBeenCalled();
				},
			);

			it('treats an empty firstPostId as none', async () => {
				const result = await getPopularPosts({ firstPostId: '' });

				expect(UserPostModel.findById).not.toHaveBeenCalled();
				expect(result.posts).toEqual([]);
			});
		});

		describe('when the database fails', () => {
			it('answers 500 with the original error kept as the cause', async () => {
				const failure = new Error('connection lost');

				UserPostModel.aggregate.mockRejectedValue(failure);

				const error = await getPopularPosts({}).catch((rejection) => rejection);

				expect(error).toBeInstanceOf(AppError);
				expect(error.statusCode).toBe(500);
				expect(error.cause).toBe(failure);
			});

			it('answers 500 when the preview comments fail', async () => {
				rankedPosts = buildPosts(1);
				commentService.getPreviewCommentsForPosts.mockRejectedValue(new AppError('Could not load preview comments', 500));

				const error = await getPopularPosts({}).catch((rejection) => rejection);

				expect(error.statusCode).toBe(500);
			});

			it('answers 500 when the user lookup fails', async () => {
				UserModel.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error('down')) }) });

				const error = await getPopularPosts({ userId: ME.toString() }).catch((rejection) => rejection);

				expect(error.statusCode).toBe(500);
			});
		});
	});

	describe('getNextPopularPosts', () => {
		const shownIds = [buildId(101).toString(), buildId(102).toString()];

		const next = (overrides = {}) => getNextPopularPosts({ snapshotTime: SNAPSHOT_TIME, shownPostIds: shownIds, ...overrides });

		describe('the batch', () => {
			it('ranks with the given snapshot time as now, not the current time', async () => {
				const result = await next();

				expect(getMatch().createdAt).toEqual({ $lte: new Date(SNAPSHOT_TIME) });
				expect(result.snapshotTime).toBe(SNAPSHOT_TIME);
			});

			it('leaves the shown posts out of the ranking', async () => {
				await next();

				expect(getMatch()._id).toEqual({ $nin: shownIds.map((shownId) => new mongoose.Types.ObjectId(shownId)) });
			});

			it('accepts an empty list of shown posts', async () => {
				const result = await next({ shownPostIds: [] });

				expect(getMatch()._id).toEqual({ $nin: [] });
				expect(result.posts).toEqual([]);
			});

			it('asks for one more than a page and reports hasMore when it is there', async () => {
				rankedPosts = buildPosts(POPULAR_POSTS_PAGE_SIZE + 1);

				const result = await next();

				expect(getLimit()).toBe(POPULAR_POSTS_PAGE_SIZE + 1);
				expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
				expect(result.hasMore).toBe(true);
			});

			it('reports no more when the last posts have been reached', async () => {
				rankedPosts = buildPosts(12);

				const result = await next();

				expect(result.posts).toHaveLength(12);
				expect(result.hasMore).toBe(false);
			});

			it('leaves out the logged-in user and everyone they follow', async () => {
				await next({ userId: ME.toString() });

				expect(getMatch().userId).toEqual({ $nin: [ME, FOLLOWED_A, FOLLOWED_B] });
			});

			it('leaves no author out for a guest', async () => {
				await next();

				expect(getMatch().userId).toEqual({ $nin: [] });
			});

			it('keeps the stored commentsCount and adds the preview comments to each post', async () => {
				rankedPosts = [{ ...buildPost(1), commentsCount: 3 }];

				const result = await next();

				expect(result.posts[0]).toMatchObject({ commentsCount: 3, previewComments: [] });
			});

			it('answers 401 UNAUTHENTICATED when the user in the token no longer exists', async () => {
				UserModel.findById.mockReturnValue(buildLeanQuery(null));

				await expectAppError(next({ userId: ME.toString() }), { statusCode: 401, code: ERROR_CODES.UNAUTHENTICATED });
			});
		});

		describe('validation', () => {
			const expectBadRequest = async (overrides) => {
				await expectAppError(next(overrides), { statusCode: 400, code: ERROR_CODES.BAD_REQUEST });
				expect(UserPostModel.aggregate).not.toHaveBeenCalled();
			};

			it.each([[undefined], [null], [''], ['not a date'], [1761300000000], [{}], [['2026-10-24T10:00:00.000Z']]])(
				'answers 400 BAD_REQUEST for the snapshot time %p',
				async (snapshotTime) => {
					await expectBadRequest({ snapshotTime });
				},
			);

			it.each([[undefined], [null], ['abc'], [{}], [123]])(
				'answers 400 BAD_REQUEST when shownPostIds is %p instead of an array',
				async (shownPostIds) => {
					await expectBadRequest({ shownPostIds });
				},
			);

			it.each([[[123]], [[null]], [['not-an-id']], [[{ $ne: null }]], [[buildId(1).toString(), 'nope']], [[['nested']]]])(
				'answers 400 BAD_REQUEST when shownPostIds holds an invalid id: %p',
				async (shownPostIds) => {
					await expectBadRequest({ shownPostIds });
				},
			);

			it('answers 400 BAD_REQUEST for an ObjectId instance, which JSON can never carry', async () => {
				await expectBadRequest({ shownPostIds: [buildId(1)] });
			});

			it('answers 400 BAD_REQUEST for more than 10000 shown posts', async () => {
				await expectBadRequest({
					shownPostIds: Array.from({ length: MAX_SHOWN_POST_IDS + 1 }, () => new mongoose.Types.ObjectId().toString()),
				});
			});

			it('accepts exactly 10000 shown posts', async () => {
				const shownPostIds = Array.from({ length: MAX_SHOWN_POST_IDS }, () => new mongoose.Types.ObjectId().toString());

				await next({ shownPostIds });

				expect(getMatch()._id.$nin).toHaveLength(MAX_SHOWN_POST_IDS);
			});

			it('answers 400 and never looks the user up when the input is invalid', async () => {
				await expectAppError(next({ userId: ME.toString(), snapshotTime: 'bad' }), { statusCode: 400, code: ERROR_CODES.BAD_REQUEST });
				expect(UserModel.findById).not.toHaveBeenCalled();
			});
		});

		describe('the quiet end at the cap of shown posts', () => {
			const buildShownIds = (count) => Array.from({ length: count }, () => new mongoose.Types.ObjectId().toString());

			it('reports no more once the shown posts plus the returned ones reach the cap exactly', async () => {
				rankedPosts = buildPosts(POPULAR_POSTS_PAGE_SIZE + 1);

				const result = await next({ shownPostIds: buildShownIds(MAX_SHOWN_POST_IDS - POPULAR_POSTS_PAGE_SIZE) });

				expect(result.posts).toHaveLength(POPULAR_POSTS_PAGE_SIZE);
				expect(result.hasMore).toBe(false);
			});

			it('still reports more when the shown posts plus the returned ones stay one below the cap', async () => {
				rankedPosts = buildPosts(POPULAR_POSTS_PAGE_SIZE + 1);

				const result = await next({ shownPostIds: buildShownIds(MAX_SHOWN_POST_IDS - POPULAR_POSTS_PAGE_SIZE - 1) });

				expect(result.hasMore).toBe(true);
			});

			it('reports no more when the cap is already full, whatever else could be ranked', async () => {
				rankedPosts = buildPosts(POPULAR_POSTS_PAGE_SIZE + 1);

				const result = await next({ shownPostIds: buildShownIds(MAX_SHOWN_POST_IDS) });

				expect(result.hasMore).toBe(false);
			});

			it('still returns the posts of the batch that reaches the cap', async () => {
				rankedPosts = buildPosts(POPULAR_POSTS_PAGE_SIZE + 1);

				const result = await next({ shownPostIds: buildShownIds(MAX_SHOWN_POST_IDS - POPULAR_POSTS_PAGE_SIZE) });

				expect(getIds(result)).toEqual(rankedPosts.slice(0, POPULAR_POSTS_PAGE_SIZE).map((post) => post._id.toString()));
			});

			it('reports no more for a short last batch below the cap, as before', async () => {
				rankedPosts = buildPosts(5);

				const result = await next({ shownPostIds: buildShownIds(100) });

				expect(result.hasMore).toBe(false);
			});

			it('still answers 400 BAD_REQUEST for a body over the cap', async () => {
				await expectAppError(next({ shownPostIds: buildShownIds(MAX_SHOWN_POST_IDS + 1) }), {
					statusCode: 400,
					code: ERROR_CODES.BAD_REQUEST,
				});
			});
		});

		describe('when the database fails', () => {
			it('answers 500 with the original error kept as the cause', async () => {
				const failure = new Error('connection lost');

				UserPostModel.aggregate.mockRejectedValue(failure);

				const error = await next().catch((rejection) => rejection);

				expect(error).toBeInstanceOf(AppError);
				expect(error.statusCode).toBe(500);
				expect(error.cause).toBe(failure);
			});
		});
	});
});
