const PAGE_SIZE = 30;

const buildPosts = (count) => Array.from({ length: count }, (_item, index) => ({ _id: `post-${index + 1}`, userId: `author-${index + 1}` }));

const loadServiceWithCap = (cap, rankedPosts, firstPost) => {
	jest.resetModules();

	jest.doMock('../config/popularPosts', () => ({
		...jest.requireActual('../config/popularPosts'),
		MAX_SHOWN_POST_IDS: cap,
	}));
	jest.doMock('../models/userPostModel', () => ({
		aggregate: jest.fn().mockResolvedValue(rankedPosts),
		findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(firstPost) }),
		populate: jest.fn().mockImplementation(async (posts) => posts),
	}));
	jest.doMock('../models/userModel', () => ({ findById: jest.fn() }));
	jest.doMock('../models/commentModel', () => ({ collection: { name: 'comments' } }));
	jest.doMock('./commentService', () => ({ getPreviewCommentsForPosts: jest.fn().mockResolvedValue({}) }));

	return require('./popularPostService');
};

describe('popularPostService at the cap of shown posts', () => {
	afterEach(() => {
		jest.dontMock('../config/popularPosts');
		jest.resetModules();
	});

	describe('the first page', () => {
		it('reports no more when the returned posts reach the cap exactly', async () => {
			const { getPopularPosts } = loadServiceWithCap(PAGE_SIZE, buildPosts(PAGE_SIZE + 1));

			const result = await getPopularPosts({});

			expect(result.posts).toHaveLength(PAGE_SIZE);
			expect(result.hasMore).toBe(false);
		});

		it('reports more when the returned posts stay one below the cap', async () => {
			const { getPopularPosts } = loadServiceWithCap(PAGE_SIZE + 1, buildPosts(PAGE_SIZE + 1));

			const result = await getPopularPosts({});

			expect(result.posts).toHaveLength(PAGE_SIZE);
			expect(result.hasMore).toBe(true);
		});

		it('counts the named first post as shown, so the cap is reached exactly', async () => {
			const firstPost = { _id: '64b7f0a1c2d3e4f5a6b7c8e1', userId: 'author-first' };
			const { getPopularPosts } = loadServiceWithCap(PAGE_SIZE, buildPosts(PAGE_SIZE), firstPost);

			const result = await getPopularPosts({ firstPostId: firstPost._id });

			expect(result.posts).toHaveLength(PAGE_SIZE);
			expect(result.hasMore).toBe(false);
		});

		it('counts the named first post as shown, so one below the cap still has more', async () => {
			const firstPost = { _id: '64b7f0a1c2d3e4f5a6b7c8e1', userId: 'author-first' };
			const { getPopularPosts } = loadServiceWithCap(PAGE_SIZE + 1, buildPosts(PAGE_SIZE), firstPost);

			const result = await getPopularPosts({ firstPostId: firstPost._id });

			expect(result.hasMore).toBe(true);
		});
	});

	describe('the next batch', () => {
		const buildShownIds = (count) => Array.from({ length: count }, (_item, index) => (index + 1).toString(16).padStart(24, '0'));
		const SNAPSHOT_TIME = '2026-10-24T10:00:00.000Z';

		it('reports no more when the shown posts plus the batch reach the cap exactly', async () => {
			const { getNextPopularPosts } = loadServiceWithCap(40, buildPosts(PAGE_SIZE + 1));

			const result = await getNextPopularPosts({ snapshotTime: SNAPSHOT_TIME, shownPostIds: buildShownIds(10) });

			expect(result.hasMore).toBe(false);
		});

		it('reports more when the shown posts plus the batch stay one below the cap', async () => {
			const { getNextPopularPosts } = loadServiceWithCap(40, buildPosts(PAGE_SIZE + 1));

			const result = await getNextPopularPosts({ snapshotTime: SNAPSHOT_TIME, shownPostIds: buildShownIds(9) });

			expect(result.hasMore).toBe(true);
		});

		it('answers 400 for a body over the cap', async () => {
			const { getNextPopularPosts } = loadServiceWithCap(40, buildPosts(PAGE_SIZE + 1));

			await expect(getNextPopularPosts({ snapshotTime: SNAPSHOT_TIME, shownPostIds: buildShownIds(41) })).rejects.toMatchObject({
				statusCode: 400,
			});
		});
	});
});
