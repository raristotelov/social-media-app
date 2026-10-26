import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { getPopularPosts, getNextPopularPosts } from '../services/userPostService';

import usePopularPosts from './usePopularPosts';

jest.mock('../services/userPostService');
jest.mock('../constants/popularPosts', () => ({
	...jest.requireActual('../constants/popularPosts'),
	MAX_SHOWN_POST_IDS: 10,
}));

const SNAPSHOT_TIME = '2026-10-24T10:00:00.000Z';

const buildPost = (id, overrides = {}) => ({
	_id: id,
	likes: [],
	commentsCount: 0,
	previewComments: [],
	userId: { _id: 'author', username: 'author' },
	...overrides,
});

const buildPage = (ids, { hasMore = false, snapshotTime = SNAPSHOT_TIME } = {}) => ({
	posts: ids.map((id) => buildPost(id)),
	snapshotTime,
	hasMore,
});

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const getPostIds = (result) => result.current.posts.map((post) => post._id);

const renderPopularPosts = async ({
	firstPostId,
	onFirstPostMissing = jest.fn(),
	jwtToken = 'token123',
	firstPage = buildPage(['p1', 'p2'], { hasMore: true }),
	waitForLoad = true,
} = {}) => {
	const endSession = jest.fn();

	if (firstPage) {
		getPopularPosts.mockResolvedValue(firstPage);
	}

	const wrapper = ({ children }) => <LoggedInUserContext.Provider value={{ jwtToken, endSession }}>{children}</LoggedInUserContext.Provider>;
	const rendered = renderHook(() => usePopularPosts({ firstPostId, onFirstPostMissing }), { wrapper });

	if (waitForLoad) {
		await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));
	}

	return { ...rendered, endSession, onFirstPostMissing };
};

describe('usePopularPosts', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('loading the first page', () => {
		it('starts loading, with no posts and no failure', async () => {
			getPopularPosts.mockReturnValue(new Promise(() => {}));

			const { result } = await renderPopularPosts({ firstPage: null, waitForLoad: false });

			expect(result.current).toMatchObject({
				posts: [],
				isLoading: true,
				hasLoadFailed: false,
				isLoadingMore: false,
				hasLoadMoreFailed: false,
			});
		});

		it('requests the first page with the token and no first post', async () => {
			await renderPopularPosts();

			expect(getPopularPosts).toHaveBeenCalledTimes(1);
			expect(getPopularPosts).toHaveBeenCalledWith({ jwtToken: 'token123', firstPostId: undefined });
		});

		it('requests the first page without a token for a guest', async () => {
			await renderPopularPosts({ jwtToken: null });

			expect(getPopularPosts).toHaveBeenCalledWith({ jwtToken: null, firstPostId: undefined });
		});

		it('names the first post in the request when one is given', async () => {
			await renderPopularPosts({ firstPostId: 'shared1' });

			expect(getPopularPosts).toHaveBeenCalledWith({ jwtToken: 'token123', firstPostId: 'shared1' });
		});

		it('holds the posts in the order the server sent them once loaded', async () => {
			const { result } = await renderPopularPosts({ firstPage: buildPage(['p3', 'p1', 'p2']) });

			expect(getPostIds(result)).toEqual(['p3', 'p1', 'p2']);
			expect(result.current.isLoading).toBe(false);
			expect(result.current.hasLoadFailed).toBe(false);
		});

		it('holds no posts for an empty page', async () => {
			const { result } = await renderPopularPosts({ firstPage: buildPage([]) });

			expect(result.current.posts).toEqual([]);
			expect(result.current.hasLoadFailed).toBe(false);
		});
	});

	describe('when the first page fails', () => {
		it('reports the failure and holds no posts', async () => {
			getPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			const { result } = await renderPopularPosts({ firstPage: null });

			expect(result.current.hasLoadFailed).toBe(true);
			expect(result.current.posts).toEqual([]);
			expect(result.current.canLoadMore).toBe(false);
		});

		it('reports a network failure the same way', async () => {
			getPopularPosts.mockRejectedValue(new TypeError('Failed to fetch'));

			const { result } = await renderPopularPosts({ firstPage: null });

			expect(result.current.hasLoadFailed).toBe(true);
		});

		it('ends the session without reporting a failure when the user in the token is gone', async () => {
			getPopularPosts.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { result, endSession } = await renderPopularPosts({ firstPage: null });

			expect(endSession).toHaveBeenCalledTimes(1);
			expect(result.current.hasLoadFailed).toBe(false);
		});

		it('requests the page again on reload and clears the failure when it succeeds', async () => {
			getPopularPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(buildPage(['p1']));

			const { result } = await renderPopularPosts({ firstPage: null });

			act(() => result.current.reload());

			await waitFor(() => expect(result.current.hasLoadFailed).toBe(false));
			expect(getPostIds(result)).toEqual(['p1']);
			expect(getPopularPosts).toHaveBeenCalledTimes(2);
		});

		it('reports a failure again when the reload fails too', async () => {
			getPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			const { result } = await renderPopularPosts({ firstPage: null });

			act(() => result.current.reload());

			await waitFor(() => expect(getPopularPosts).toHaveBeenCalledTimes(2));
			await waitFor(() => expect(result.current.isLoading).toBe(false));
			expect(result.current.hasLoadFailed).toBe(true);
		});

		it('reports loading while the reload is in flight', async () => {
			getPopularPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

			const { result } = await renderPopularPosts({ firstPage: null });
			const reloading = buildDeferred();

			getPopularPosts.mockReturnValue(reloading.promise);

			act(() => result.current.reload());

			await waitFor(() => expect(result.current.isLoading).toBe(true));

			await act(async () => reloading.resolve(buildPage(['p1'])));

			expect(result.current.isLoading).toBe(false);
		});

		it('ignores a slow answer to a request that a reload replaced', async () => {
			const slow = buildDeferred();
			const fast = buildDeferred();

			getPopularPosts.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

			const { result } = await renderPopularPosts({ firstPage: null, waitForLoad: false });

			act(() => result.current.reload());

			await act(async () => fast.resolve(buildPage(['fresh'])));
			await act(async () => slow.resolve(buildPage(['stale'])));

			expect(getPostIds(result)).toEqual(['fresh']);
			expect(result.current.isLoading).toBe(false);
		});
	});

	describe('when the named first post is gone', () => {
		it('tells the caller, then loads the page again without a first post', async () => {
			getPopularPosts.mockRejectedValueOnce({ code: 'POST_NOT_FOUND', status: 404 }).mockResolvedValueOnce(buildPage(['p1', 'p2']));

			const { result, onFirstPostMissing } = await renderPopularPosts({ firstPostId: 'gone', firstPage: null });

			expect(onFirstPostMissing).toHaveBeenCalledTimes(1);
			expect(getPopularPosts).toHaveBeenNthCalledWith(1, { jwtToken: 'token123', firstPostId: 'gone' });
			expect(getPopularPosts).toHaveBeenNthCalledWith(2, { jwtToken: 'token123' });
			expect(getPostIds(result)).toEqual(['p1', 'p2']);
			expect(result.current.hasLoadFailed).toBe(false);
		});

		it('does not name the missing post again when reloading', async () => {
			getPopularPosts.mockRejectedValueOnce({ code: 'POST_NOT_FOUND', status: 404 }).mockResolvedValue(buildPage(['p1']));

			const { result, onFirstPostMissing } = await renderPopularPosts({ firstPostId: 'gone', firstPage: null });

			act(() => result.current.reload());

			await waitFor(() => expect(getPopularPosts).toHaveBeenCalledTimes(3));
			expect(getPopularPosts).toHaveBeenLastCalledWith({ jwtToken: 'token123', firstPostId: undefined });
			expect(onFirstPostMissing).toHaveBeenCalledTimes(1);
		});

		it('reports a failure when the page cannot be loaded without the first post either', async () => {
			getPopularPosts
				.mockRejectedValueOnce({ code: 'POST_NOT_FOUND', status: 404 })
				.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

			const { result } = await renderPopularPosts({ firstPostId: 'gone', firstPage: null });

			expect(result.current.hasLoadFailed).toBe(true);
		});

		it('treats any other error on a named first post as a load failure, not a missing post', async () => {
			getPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			const { result, onFirstPostMissing } = await renderPopularPosts({ firstPostId: 'shared1', firstPage: null });

			expect(result.current.hasLoadFailed).toBe(true);
			expect(onFirstPostMissing).not.toHaveBeenCalled();
			expect(getPopularPosts).toHaveBeenCalledTimes(1);
		});

		it('treats POST_NOT_FOUND without a named first post as a load failure', async () => {
			getPopularPosts.mockRejectedValue({ code: 'POST_NOT_FOUND', status: 404 });

			const { result, onFirstPostMissing } = await renderPopularPosts({ firstPage: null });

			expect(result.current.hasLoadFailed).toBe(true);
			expect(onFirstPostMissing).not.toHaveBeenCalled();
		});
	});

	describe('loading more', () => {
		it('can load more while the server says there is more', async () => {
			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1'], { hasMore: true }) });

			expect(result.current.canLoadMore).toBe(true);
		});

		it('cannot load more once the server says there is no more', async () => {
			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1'], { hasMore: false }) });

			expect(result.current.canLoadMore).toBe(false);
		});

		it('sends the snapshot time of the first page and the ids already shown', async () => {
			getNextPopularPosts.mockResolvedValue(buildPage(['p3'], { hasMore: false }));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).toHaveBeenCalledWith({ jwtToken: 'token123', snapshotTime: SNAPSHOT_TIME, shownPostIds: ['p1', 'p2'] });
		});

		it('sends no token for a guest', async () => {
			getNextPopularPosts.mockResolvedValue(buildPage(['p3']));

			const { result } = await renderPopularPosts({ jwtToken: null });

			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).toHaveBeenCalledWith(expect.objectContaining({ jwtToken: null }));
		});

		it('adds the new posts after the loaded ones, which never move', async () => {
			getNextPopularPosts.mockResolvedValue(buildPage(['p3', 'p4']));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			await act(async () => result.current.loadMore());

			expect(getPostIds(result)).toEqual(['p1', 'p2', 'p3', 'p4']);
		});

		it('takes hasMore from the new batch', async () => {
			getNextPopularPosts.mockResolvedValue(buildPage(['p3'], { hasMore: false }));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			await act(async () => result.current.loadMore());

			expect(result.current.canLoadMore).toBe(false);
		});

		it('keeps the snapshot time of the first page for every batch', async () => {
			getNextPopularPosts
				.mockResolvedValueOnce({ ...buildPage(['p3'], { hasMore: true }), snapshotTime: '2026-10-24T11:00:00.000Z' })
				.mockResolvedValueOnce(buildPage(['p4']));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			await act(async () => result.current.loadMore());
			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).toHaveBeenNthCalledWith(2, expect.objectContaining({ snapshotTime: SNAPSHOT_TIME }));
		});

		it('sends every id shown so far with each further batch, so none repeats', async () => {
			getNextPopularPosts.mockResolvedValueOnce(buildPage(['p3', 'p4'], { hasMore: true })).mockResolvedValueOnce(buildPage(['p5']));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			await act(async () => result.current.loadMore());
			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).toHaveBeenNthCalledWith(2, expect.objectContaining({ shownPostIds: ['p1', 'p2', 'p3', 'p4'] }));
			expect(getPostIds(result)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
		});

		it('requests nothing when there is no more to load', async () => {
			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1'], { hasMore: false }) });

			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).not.toHaveBeenCalled();
		});

		it('reports loading more while the request is in flight, and stops afterwards', async () => {
			const batch = buildDeferred();

			getNextPopularPosts.mockReturnValue(batch.promise);

			const { result } = await renderPopularPosts();

			act(() => {
				result.current.loadMore();
			});

			await waitFor(() => expect(result.current.isLoadingMore).toBe(true));
			expect(result.current.canLoadMore).toBe(false);

			await act(async () => batch.resolve(buildPage(['p3'])));

			expect(result.current.isLoadingMore).toBe(false);
		});

		it('sends one request when asked twice while the first is in flight', async () => {
			const batch = buildDeferred();

			getNextPopularPosts.mockReturnValue(batch.promise);

			const { result } = await renderPopularPosts();

			act(() => {
				result.current.loadMore();
				result.current.loadMore();
			});

			await act(async () => batch.resolve(buildPage(['p3'])));

			expect(getNextPopularPosts).toHaveBeenCalledTimes(1);
			expect(getPostIds(result)).toEqual(['p1', 'p2', 'p3']);
		});

		it('keeps the loaded posts and reports the failure when a batch fails', async () => {
			getNextPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			const { result } = await renderPopularPosts();

			await act(async () => result.current.loadMore());

			expect(result.current.hasLoadMoreFailed).toBe(true);
			expect(result.current.isLoadingMore).toBe(false);
			expect(getPostIds(result)).toEqual(['p1', 'p2']);
			expect(result.current.hasLoadFailed).toBe(false);
		});

		it('stops offering to load more while the failure stands, so scrolling does not retry on its own', async () => {
			getNextPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			const { result } = await renderPopularPosts();

			await act(async () => result.current.loadMore());

			expect(result.current.canLoadMore).toBe(false);
		});

		it('retries the same batch, with the same ids, when asked again after a failure', async () => {
			getNextPopularPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(buildPage(['p3']));

			const { result } = await renderPopularPosts();

			await act(async () => result.current.loadMore());
			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).toHaveBeenCalledTimes(2);
			expect(getNextPopularPosts).toHaveBeenNthCalledWith(2, expect.objectContaining({ shownPostIds: ['p1', 'p2'] }));
			expect(result.current.hasLoadMoreFailed).toBe(false);
			expect(getPostIds(result)).toEqual(['p1', 'p2', 'p3']);
		});

		it('clears the failure as soon as the retry starts', async () => {
			const retry = buildDeferred();

			getNextPopularPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockReturnValueOnce(retry.promise);

			const { result } = await renderPopularPosts();

			await act(async () => result.current.loadMore());

			act(() => {
				result.current.loadMore();
			});

			await waitFor(() => expect(result.current.hasLoadMoreFailed).toBe(false));
			expect(result.current.isLoadingMore).toBe(true);

			await act(async () => retry.resolve(buildPage(['p3'])));
		});

		it('ends the session, without reporting a failure, when the user in the token is gone', async () => {
			getNextPopularPosts.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { result, endSession } = await renderPopularPosts();

			await act(async () => result.current.loadMore());

			expect(endSession).toHaveBeenCalledTimes(1);
			expect(result.current.hasLoadMoreFailed).toBe(false);
		});

		it('starts the shown ids over after a reload', async () => {
			getNextPopularPosts.mockResolvedValue(buildPage(['x2']));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			getPopularPosts.mockResolvedValue(buildPage(['x1'], { hasMore: true }));

			act(() => result.current.reload());

			await waitFor(() => expect(getPostIds(result)).toEqual(['x1']));

			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).toHaveBeenCalledWith(expect.objectContaining({ shownPostIds: ['x1'] }));
		});
	});

	describe('the quiet end at the cap of shown posts', () => {
		const CAP = 10;

		const buildIds = (count, prefix = 'p') => Array.from({ length: count }, (_item, index) => `${prefix}${index + 1}`);

		it('cannot load more when the first page already reaches the cap, though the server says there is more', async () => {
			const { result } = await renderPopularPosts({ firstPage: buildPage(buildIds(CAP), { hasMore: true }) });

			expect(result.current.canLoadMore).toBe(false);
		});

		it('requests no further batch when the first page reaches the cap', async () => {
			const { result } = await renderPopularPosts({ firstPage: buildPage(buildIds(CAP), { hasMore: true }) });

			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).not.toHaveBeenCalled();
		});

		it('can still load more when the first page stays one below the cap', async () => {
			const { result } = await renderPopularPosts({ firstPage: buildPage(buildIds(CAP - 1), { hasMore: true }) });

			expect(result.current.canLoadMore).toBe(true);
		});

		it('stops requesting once a batch brings the shown ids to the cap', async () => {
			getNextPopularPosts.mockResolvedValue(buildPage(buildIds(CAP - 2, 'n'), { hasMore: true }));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			await act(async () => result.current.loadMore());
			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).toHaveBeenCalledTimes(1);
			expect(result.current.canLoadMore).toBe(false);
		});

		it('keeps every loaded post and shows no load-more failure at the cap', async () => {
			getNextPopularPosts.mockResolvedValue(buildPage(buildIds(CAP - 2, 'n'), { hasMore: true }));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			await act(async () => result.current.loadMore());

			expect(result.current.posts).toHaveLength(CAP);
			expect(result.current.hasLoadMoreFailed).toBe(false);
			expect(result.current.hasLoadFailed).toBe(false);
			expect(result.current.isLoadingMore).toBe(false);
		});

		it('keeps loading while a batch leaves the shown ids one below the cap', async () => {
			getNextPopularPosts.mockResolvedValue(buildPage(buildIds(CAP - 3, 'n'), { hasMore: true }));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			await act(async () => result.current.loadMore());

			expect(result.current.canLoadMore).toBe(true);
		});

		it('sends all the shown ids with the last batch before the cap', async () => {
			getNextPopularPosts
				.mockResolvedValueOnce(buildPage(buildIds(CAP - 4, 'n'), { hasMore: true }))
				.mockResolvedValueOnce(buildPage(['last1', 'last2'], { hasMore: true }));

			const { result } = await renderPopularPosts({ firstPage: buildPage(['p1', 'p2'], { hasMore: true }) });

			await act(async () => result.current.loadMore());
			await act(async () => result.current.loadMore());

			expect(getNextPopularPosts).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({ shownPostIds: [...['p1', 'p2'], ...buildIds(CAP - 4, 'n')] }),
			);
			expect(result.current.canLoadMore).toBe(false);
		});

		it('starts again from an empty list after a reload, so the cap is counted anew', async () => {
			getPopularPosts
				.mockResolvedValueOnce(buildPage(buildIds(CAP), { hasMore: true }))
				.mockResolvedValueOnce(buildPage(['q1', 'q2'], { hasMore: true }));

			const { result } = await renderPopularPosts({ firstPage: null });

			expect(result.current.canLoadMore).toBe(false);

			act(() => result.current.reload());

			await waitFor(() => expect(result.current.canLoadMore).toBe(true));
		});
	});

	describe('updatePost', () => {
		it('merges the changes into the post with that id', async () => {
			const { result } = await renderPopularPosts();

			act(() => result.current.updatePost('p2', { likes: ['user1'], commentsCount: 4 }));

			expect(result.current.posts[1]).toMatchObject({ _id: 'p2', likes: ['user1'], commentsCount: 4 });
		});

		it('keeps the other fields of that post', async () => {
			const { result } = await renderPopularPosts();

			act(() => result.current.updatePost('p2', { likes: ['user1'] }));

			expect(result.current.posts[1].userId).toEqual({ _id: 'author', username: 'author' });
		});

		it('leaves the other posts alone', async () => {
			const { result } = await renderPopularPosts();

			act(() => result.current.updatePost('p2', { likes: ['user1'] }));

			expect(result.current.posts[0].likes).toEqual([]);
		});

		it('keeps the order of the posts', async () => {
			const { result } = await renderPopularPosts();

			act(() => result.current.updatePost('p1', { likes: ['user1', 'user2'] }));

			expect(getPostIds(result)).toEqual(['p1', 'p2']);
		});

		it('changes nothing for an id that is not in the list', async () => {
			const { result } = await renderPopularPosts();

			act(() => result.current.updatePost('missing', { likes: ['user1'] }));

			expect(result.current.posts.every((post) => post.likes.length === 0)).toBe(true);
		});

		it('keeps the change when more posts are loaded afterwards', async () => {
			getNextPopularPosts.mockResolvedValue(buildPage(['p3']));

			const { result } = await renderPopularPosts();

			act(() => result.current.updatePost('p1', { likes: ['user1'] }));

			await act(async () => result.current.loadMore());

			expect(result.current.posts[0].likes).toEqual(['user1']);
		});
	});
});
