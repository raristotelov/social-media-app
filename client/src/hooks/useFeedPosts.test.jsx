import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { getFollowedUsersPosts } from '../services/userPostService';

import useFeedPosts from './useFeedPosts';

jest.mock('../services/userPostService');

const buildPost = (id, overrides = {}) => ({
	_id: id,
	likes: [],
	commentsCount: 0,
	previewComments: [],
	userId: { _id: 'author', username: 'author' },
	...overrides,
});

const buildPage = (ids, { hasMore = false, nextCursor = hasMore ? `cursor-after-${ids[ids.length - 1]}` : null } = {}) => ({
	posts: ids.map((id) => buildPost(id)),
	hasMore,
	nextCursor,
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

const mountFeedPosts = async ({ firstPage = buildPage(['p3', 'p2'], { hasMore: true }), waitForLoad = true } = {}) => {
	const endSession = jest.fn();
	const context = { endSession };

	if (firstPage) {
		getFollowedUsersPosts.mockResolvedValueOnce(firstPage);
	}

	const wrapper = ({ children }) => <LoggedInUserContext.Provider value={context}>{children}</LoggedInUserContext.Provider>;
	const rendered = renderHook(() => useFeedPosts(), { wrapper });

	if (waitForLoad) {
		await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));
	}

	return { ...rendered, endSession, context };
};

describe('useFeedPosts', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('loading the first page', () => {
		it('starts loading, with no posts, no failure and nothing more to load', async () => {
			getFollowedUsersPosts.mockReturnValue(new Promise(() => {}));

			const { result } = await mountFeedPosts({ firstPage: null, waitForLoad: false });

			expect(result.current).toMatchObject({
				posts: [],
				isLoading: true,
				hasLoadFailed: false,
				isLoadingMore: false,
				hasLoadMoreFailed: false,
				canLoadMore: false,
			});
		});

		it('requests the first page with no token and no cursor', async () => {
			await mountFeedPosts();

			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
			expect(getFollowedUsersPosts).toHaveBeenCalledWith();
		});

		it('holds the posts in the order the server sent them', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3', 'p1', 'p2']) });

			expect(getPostIds(result)).toEqual(['p3', 'p1', 'p2']);
			expect(result.current.hasLoadFailed).toBe(false);
		});

		it('can load more when the server says there is more', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });

			expect(result.current.canLoadMore).toBe(true);
		});

		it('cannot load more on the last page', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: false }) });

			expect(result.current.canLoadMore).toBe(false);
		});

		it('holds no posts for an empty page', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage([]) });

			expect(result.current.posts).toEqual([]);
			expect(result.current.hasLoadFailed).toBe(false);
			expect(result.current.canLoadMore).toBe(false);
		});

		it('reports the failure when the first page cannot be loaded', async () => {
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

			const { result } = await mountFeedPosts({ firstPage: null });

			expect(result.current.hasLoadFailed).toBe(true);
			expect(result.current.posts).toEqual([]);
			expect(result.current.canLoadMore).toBe(false);
		});

		it('ends the session, and reports no failure, when the token is rejected', async () => {
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'UNAUTHENTICATED', status: 401 });

			const { result, endSession } = await mountFeedPosts({ firstPage: null });

			expect(endSession).toHaveBeenCalledTimes(1);
			expect(result.current.hasLoadFailed).toBe(false);
		});

		it('does not request a second page by itself', async () => {
			await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });

			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
		});
	});

	describe('loading more', () => {
		it('asks for the page after the cursor the server sent', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3', 'p2'], { hasMore: true, nextCursor: '200_abc' }) });

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p1']));

			await act(() => result.current.loadMore());

			expect(getFollowedUsersPosts).toHaveBeenLastCalledWith({ cursor: '200_abc' });
		});

		it('adds the next page below the posts already loaded', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3', 'p2'], { hasMore: true }) });

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p1', 'p0']));

			await act(() => result.current.loadMore());

			expect(getPostIds(result)).toEqual(['p3', 'p2', 'p1', 'p0']);
		});

		it('cannot load more after the last page', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2'], { hasMore: false }));

			await act(() => result.current.loadMore());

			expect(result.current.canLoadMore).toBe(false);
		});

		it('follows the cursor from page to page', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p4'], { hasMore: true, nextCursor: 'c1' }) });

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p3'], { hasMore: true, nextCursor: 'c2' }));
			await act(() => result.current.loadMore());

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2'], { hasMore: false }));
			await act(() => result.current.loadMore());

			expect(getFollowedUsersPosts.mock.calls.map(([arguments_]) => arguments_?.cursor)).toEqual([undefined, 'c1', 'c2']);
			expect(getPostIds(result)).toEqual(['p4', 'p3', 'p2']);
		});

		it('never lists a post twice when a page repeats one', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3', 'p2'], { hasMore: true }) });

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2', 'p1']));

			await act(() => result.current.loadMore());

			expect(getPostIds(result)).toEqual(['p3', 'p2', 'p1']);
		});

		it('shows the loading state while the next page loads', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });
			const next = buildDeferred();

			getFollowedUsersPosts.mockReturnValueOnce(next.promise);

			act(() => {
				result.current.loadMore();
			});

			expect(result.current.isLoadingMore).toBe(true);
			expect(result.current.canLoadMore).toBe(false);

			await act(async () => next.resolve(buildPage(['p2'])));

			expect(result.current.isLoadingMore).toBe(false);
		});

		it('sends one request when asked again while a page is loading', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });
			const next = buildDeferred();

			getFollowedUsersPosts.mockReturnValueOnce(next.promise);

			act(() => {
				result.current.loadMore();
				result.current.loadMore();
			});

			await act(async () => next.resolve(buildPage(['p2'])));

			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2);
		});

		it('sends nothing when there is nothing more to load', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: false }) });

			await act(() => result.current.loadMore());

			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
		});

		describe('when the next page fails', () => {
			it('keeps the posts and reports the failure', async () => {
				const { result } = await mountFeedPosts({ firstPage: buildPage(['p3', 'p2'], { hasMore: true }) });

				getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

				await act(() => result.current.loadMore());

				expect(result.current.hasLoadMoreFailed).toBe(true);
				expect(result.current.hasLoadFailed).toBe(false);
				expect(getPostIds(result)).toEqual(['p3', 'p2']);
				expect(result.current.isLoadingMore).toBe(false);
			});

			it('stops loading by itself until asked again', async () => {
				const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });

				getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

				await act(() => result.current.loadMore());

				expect(result.current.canLoadMore).toBe(false);
			});

			it('clears the failure and adds the page when asked again and it works', async () => {
				const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true, nextCursor: 'c1' }) });

				getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });
				await act(() => result.current.loadMore());

				getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2']));
				await act(() => result.current.loadMore());

				expect(result.current.hasLoadMoreFailed).toBe(false);
				expect(getPostIds(result)).toEqual(['p3', 'p2']);
				expect(getFollowedUsersPosts).toHaveBeenLastCalledWith({ cursor: 'c1' });
			});

			it('ends the session, and reports no failure, when the token is rejected', async () => {
				const { result, endSession } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });

				getFollowedUsersPosts.mockRejectedValueOnce({ code: 'UNAUTHENTICATED', status: 401 });

				await act(() => result.current.loadMore());

				expect(endSession).toHaveBeenCalledTimes(1);
				expect(result.current.hasLoadMoreFailed).toBe(false);
			});
		});
	});

	describe('reloading', () => {
		it('replaces the posts and starts again from the first page', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3', 'p2'], { hasMore: true, nextCursor: 'old' }) });

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['n2', 'n1'], { hasMore: true, nextCursor: 'fresh' }));

			act(() => result.current.reload());
			await waitFor(() => expect(getPostIds(result)).toEqual(['n2', 'n1']));

			expect(getFollowedUsersPosts).toHaveBeenLastCalledWith();

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['n0']));
			await act(() => result.current.loadMore());

			expect(getFollowedUsersPosts).toHaveBeenLastCalledWith({ cursor: 'fresh' });
		});

		it('shows no loading state and keeps the posts while it runs', async () => {
			const { result } = await mountFeedPosts();
			const reload = buildDeferred();

			getFollowedUsersPosts.mockReturnValueOnce(reload.promise);

			act(() => result.current.reload());

			expect(result.current.isLoading).toBe(false);
			expect(getPostIds(result)).toEqual(['p3', 'p2']);

			await act(async () => reload.resolve(buildPage(['n1'])));
		});

		it('keeps the posts and reports no failure when it fails', async () => {
			const { result } = await mountFeedPosts();

			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

			act(() => result.current.reload());
			await waitFor(() => expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2));

			expect(result.current.hasLoadFailed).toBe(false);
			expect(getPostIds(result)).toEqual(['p3', 'p2']);
		});

		it('ends the session when the token is rejected', async () => {
			const { result, endSession } = await mountFeedPosts();

			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'UNAUTHENTICATED', status: 401 });

			act(() => result.current.reload());
			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});

		it('clears a failed load of more posts', async () => {
			const { result } = await mountFeedPosts();

			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });
			await act(() => result.current.loadMore());

			expect(result.current.hasLoadMoreFailed).toBe(true);

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['n1']));
			act(() => result.current.reload());
			await waitFor(() => expect(result.current.hasLoadMoreFailed).toBe(false));
		});

		it('retries a failed first load', async () => {
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

			const { result } = await mountFeedPosts({ firstPage: null });

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p1']));

			act(() => result.current.reload());
			await waitFor(() => expect(result.current.hasLoadFailed).toBe(false));
			await waitFor(() => expect(getPostIds(result)).toEqual(['p1']));
		});

		it('does not reload by itself when the logged-in user is refreshed', async () => {
			const endSession = jest.fn();
			let loggedInUser = { _id: 'user1', following: [] };

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p1']));

			const wrapper = ({ children }) => (
				<LoggedInUserContext.Provider value={{ loggedInUser, endSession }}>{children}</LoggedInUserContext.Provider>
			);
			const { result, rerender } = renderHook(() => useFeedPosts(), { wrapper });

			await waitFor(() => expect(result.current.isLoading).toBe(false));

			loggedInUser = { _id: 'user1', following: ['user2'] };
			rerender();

			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p1']));
			act(() => result.current.reload());
			await waitFor(() => expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2));

			expect(getFollowedUsersPosts).toHaveBeenLastCalledWith();
		});
	});

	describe('a load of more posts that is still running when the feed is reloaded', () => {
		it('does not add its posts to the reloaded feed', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3', 'p2'], { hasMore: true, nextCursor: 'old' }) });
			const staleMore = buildDeferred();

			getFollowedUsersPosts.mockReturnValueOnce(staleMore.promise);
			act(() => {
				result.current.loadMore();
			});

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['n2', 'n1'], { hasMore: true, nextCursor: 'fresh' }));
			act(() => result.current.reload());
			await waitFor(() => expect(getPostIds(result)).toEqual(['n2', 'n1']));

			await act(async () => staleMore.resolve(buildPage(['p1', 'p0'], { hasMore: false, nextCursor: null })));

			expect(getPostIds(result)).toEqual(['n2', 'n1']);
		});

		it('does not replace the cursor or the more-to-load flag of the reloaded feed', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3', 'p2'], { hasMore: true, nextCursor: 'old' }) });
			const staleMore = buildDeferred();

			getFollowedUsersPosts.mockReturnValueOnce(staleMore.promise);
			act(() => {
				result.current.loadMore();
			});

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['n2', 'n1'], { hasMore: true, nextCursor: 'fresh' }));
			act(() => result.current.reload());
			await waitFor(() => expect(getPostIds(result)).toEqual(['n2', 'n1']));

			await act(async () => staleMore.resolve(buildPage(['p1'], { hasMore: false, nextCursor: null })));

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['n0']));
			await waitFor(() => expect(result.current.canLoadMore).toBe(true));
			await act(() => result.current.loadMore());

			expect(getFollowedUsersPosts).toHaveBeenLastCalledWith({ cursor: 'fresh' });
			expect(getPostIds(result)).toEqual(['n2', 'n1', 'n0']);
		});

		it('does not report a failure on the reloaded feed when it fails', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });
			const staleMore = buildDeferred();

			getFollowedUsersPosts.mockReturnValueOnce(staleMore.promise);
			act(() => {
				result.current.loadMore();
			});

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['n1'], { hasMore: true }));
			act(() => result.current.reload());
			await waitFor(() => expect(getPostIds(result)).toEqual(['n1']));

			await act(async () => staleMore.reject({ code: 'INTERNAL_ERROR', status: 500 }));

			expect(result.current.hasLoadMoreFailed).toBe(false);
		});

		it('stops showing the loading state once it ends', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });
			const staleMore = buildDeferred();

			getFollowedUsersPosts.mockReturnValueOnce(staleMore.promise);
			act(() => {
				result.current.loadMore();
			});

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['n1'], { hasMore: true }));
			act(() => result.current.reload());
			await waitFor(() => expect(getPostIds(result)).toEqual(['n1']));

			await act(async () => staleMore.resolve(buildPage(['p2'])));

			expect(result.current.isLoadingMore).toBe(false);
		});
	});

	describe('updating a post', () => {
		it('changes only the post with that id', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3', 'p2']) });

			act(() => result.current.updatePost('p2', { likes: ['user1'] }));

			expect(result.current.posts.find((post) => post._id === 'p2').likes).toEqual(['user1']);
			expect(result.current.posts.find((post) => post._id === 'p3').likes).toEqual([]);
		});

		it('keeps the other fields of the post', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p2']) });

			act(() => result.current.updatePost('p2', { commentsCount: 4 }));

			expect(result.current.posts[0]).toMatchObject({ _id: 'p2', commentsCount: 4, userId: { username: 'author' } });
		});

		it('changes a post that came with a later page', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3'], { hasMore: true }) });

			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2']));
			await act(() => result.current.loadMore());
			act(() => result.current.updatePost('p2', { likes: ['user1'] }));

			expect(result.current.posts[1].likes).toEqual(['user1']);
		});

		it('ignores an unknown id', async () => {
			const { result } = await mountFeedPosts({ firstPage: buildPage(['p3']) });

			act(() => result.current.updatePost('missing', { likes: ['user1'] }));

			expect(getPostIds(result)).toEqual(['p3']);
			expect(result.current.posts[0].likes).toEqual([]);
		});
	});
});
