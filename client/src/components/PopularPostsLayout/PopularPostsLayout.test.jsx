import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigationType, useOutletContext } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import { getPopularPosts, getNextPopularPosts } from '../../services/userPostService';

import PopularPostsLayout from './PopularPostsLayout';

jest.mock('../../services/userPostService');

const SNAPSHOT_TIME = '2026-10-24T10:00:00.000Z';

const buildPost = (id) => ({ _id: id, likes: [], commentsCount: 0, previewComments: [], userId: { _id: 'author', username: 'author' } });

const buildPage = (ids, { hasMore = false } = {}) => ({ posts: ids.map(buildPost), snapshotTime: SNAPSHOT_TIME, hasMore });

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const OutletProbe = ({ name }) => {
	const { posts, isLoadingMore, hasLoadMoreFailed, onRetryLoadMoreClick, updatePost } = useOutletContext();

	return (
		<div>
			<p data-testid='probe-name'>{name}</p>

			<p data-testid='post-ids'>{posts.map((post) => post._id).join(',')}</p>

			<p data-testid='likes'>{posts.map((post) => post.likes.length).join(',')}</p>

			<p data-testid='is-loading-more'>{String(isLoadingMore)}</p>

			<p data-testid='has-load-more-failed'>{String(hasLoadMoreFailed)}</p>

			<button type='button' onClick={onRetryLoadMoreClick}>
				Retry batch
			</button>

			<button type='button' onClick={() => updatePost('p1', { likes: ['user1'] })}>
				Like p1
			</button>

			<Link to='/popular-posts/posts#p2'>Open post</Link>

			<Link to='/popular-posts'>Open grid</Link>
		</div>
	);
};

const LocationProbe = () => {
	const location = useLocation();
	const navigationType = useNavigationType();

	return (
		<div>
			<p data-testid='path'>{location.pathname}</p>

			<p data-testid='hash'>{location.hash}</p>

			<p data-testid='navigation-type'>{navigationType}</p>
		</div>
	);
};

const renderLayout = ({ entries = ['/popular-posts'], jwtToken = 'token123' } = {}) => {
	const showToast = jest.fn();
	const endSession = jest.fn();

	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken, loggedInUser: jwtToken ? { _id: 'user1' } : null, endSession }}>
			<ToastContext.Provider value={{ showToast }}>
				<MemoryRouter initialEntries={entries}>
					<Routes>
						<Route path='/popular-posts' element={<PopularPostsLayout />}>
							<Route index element={<OutletProbe name='grid' />} />

							<Route path='posts' element={<OutletProbe name='posts' />} />
						</Route>
					</Routes>

					<LocationProbe />
				</MemoryRouter>
			</ToastContext.Provider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, showToast, endSession };
};

const getShownIds = () => screen.getByTestId('post-ids').textContent;

describe('PopularPostsLayout', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2', 'p3']));
		getNextPopularPosts.mockResolvedValue(buildPage([]));
	});

	afterEach(() => {
		delete document.documentElement.scrollHeight;
	});

	describe('loading', () => {
		it('shows the full-page spinner and no content while the first page loads', () => {
			getPopularPosts.mockReturnValue(new Promise(() => {}));

			const { container } = renderLayout();

			expect(container.querySelector('.spinner-container-full-page')).toBeInTheDocument();
			expect(screen.queryByTestId('probe-name')).not.toBeInTheDocument();
		});

		it('hands the loaded posts to the page inside it, once they are loaded', async () => {
			renderLayout();

			await screen.findByTestId('probe-name');

			expect(getShownIds()).toBe('p1,p2,p3');
		});

		it('hides the spinner once the posts are there', async () => {
			const { container } = renderLayout();

			await screen.findByTestId('probe-name');

			expect(container.querySelector('.spinner-container')).not.toBeInTheDocument();
		});

		it('shows the grid page on /popular-posts and the posts page on /popular-posts/posts', async () => {
			const { unmount } = renderLayout({ entries: ['/popular-posts'] });

			expect(await screen.findByTestId('probe-name')).toHaveTextContent('grid');

			unmount();
			renderLayout({ entries: ['/popular-posts/posts#p2'] });

			expect(await screen.findByTestId('probe-name')).toHaveTextContent('posts');
		});

		it('requests the popular posts with the token', async () => {
			renderLayout();

			await screen.findByTestId('probe-name');

			expect(getPopularPosts).toHaveBeenCalledTimes(1);
			expect(getPopularPosts).toHaveBeenCalledWith(expect.objectContaining({ jwtToken: 'token123' }));
		});

		it('requests the popular posts without a token for a guest', async () => {
			renderLayout({ jwtToken: null });

			await screen.findByTestId('probe-name');

			expect(getPopularPosts).toHaveBeenCalledWith(expect.objectContaining({ jwtToken: null }));
		});

		it('names no first post when the grid is opened', async () => {
			renderLayout({ entries: ['/popular-posts'] });

			await screen.findByTestId('probe-name');

			expect(getPopularPosts.mock.calls[0][0].firstPostId).toBeFalsy();
		});

		it('names no first post when the posts view is opened without a hash', async () => {
			renderLayout({ entries: ['/popular-posts/posts'] });

			await screen.findByTestId('probe-name');

			expect(getPopularPosts.mock.calls[0][0].firstPostId).toBeFalsy();
		});

		it('names the post in the hash as the first post when the posts view is opened on it', async () => {
			renderLayout({ entries: ['/popular-posts/posts#p2'] });

			await screen.findByTestId('probe-name');

			expect(getPopularPosts).toHaveBeenCalledWith(expect.objectContaining({ firstPostId: 'p2' }));
		});

		it('ignores a hash on the grid route', async () => {
			renderLayout({ entries: ['/popular-posts#p2'] });

			await screen.findByTestId('probe-name');

			expect(getPopularPosts.mock.calls[0][0].firstPostId).toBeFalsy();
		});

		it('shows the posts exactly as the server ranked them, the named first post leading', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p2', 'p1', 'p3']));

			renderLayout({ entries: ['/popular-posts/posts#p2'] });

			await screen.findByTestId('probe-name');

			expect(getShownIds()).toBe('p2,p1,p3');
		});
	});

	describe('moving between the grid and the posts view', () => {
		it('does not request the posts again when a post is opened from the grid', async () => {
			renderLayout({ entries: ['/popular-posts'] });

			userEvent.click(await screen.findByRole('link', { name: 'Open post' }));

			await waitFor(() => expect(screen.getByTestId('probe-name')).toHaveTextContent('posts'));
			expect(getPopularPosts).toHaveBeenCalledTimes(1);
		});

		it('keeps the loaded posts, in the same order, when going to the posts view', async () => {
			renderLayout({ entries: ['/popular-posts'] });

			userEvent.click(await screen.findByRole('link', { name: 'Open post' }));

			await waitFor(() => expect(screen.getByTestId('probe-name')).toHaveTextContent('posts'));
			expect(getShownIds()).toBe('p1,p2,p3');
		});

		it('does not request the posts again when going back from the posts view to the grid', async () => {
			renderLayout({ entries: ['/popular-posts/posts#p2'] });

			userEvent.click(await screen.findByRole('link', { name: 'Open grid' }));

			await waitFor(() => expect(screen.getByTestId('probe-name')).toHaveTextContent('grid'));
			expect(getPopularPosts).toHaveBeenCalledTimes(1);
			expect(getShownIds()).toBe('p1,p2,p3');
		});

		it('keeps a change to a post, such as a like, when moving between the views', async () => {
			renderLayout({ entries: ['/popular-posts/posts#p2'] });

			userEvent.click(await screen.findByRole('button', { name: 'Like p1' }));
			userEvent.click(screen.getByRole('link', { name: 'Open grid' }));

			await waitFor(() => expect(screen.getByTestId('probe-name')).toHaveTextContent('grid'));
			expect(screen.getByTestId('likes')).toHaveTextContent('1,0,0');
		});
	});

	describe('when the first page fails to load', () => {
		beforeEach(() => {
			getPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
		});

		it('shows the full-page error: "Couldn\'t load popular posts", the hint and Retry', async () => {
			renderLayout();

			expect(await screen.findByRole('heading', { name: "Couldn't load popular posts" })).toBeInTheDocument();
			expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
		});

		it('shows no page content next to the error', async () => {
			renderLayout();

			await screen.findByRole('heading', { name: "Couldn't load popular posts" });

			expect(screen.queryByTestId('probe-name')).not.toBeInTheDocument();
		});

		it('shows the same error for a network failure', async () => {
			getPopularPosts.mockRejectedValue(new TypeError('Failed to fetch'));

			renderLayout();

			expect(await screen.findByRole('heading', { name: "Couldn't load popular posts" })).toBeInTheDocument();
		});

		it('shows the same error on the posts view', async () => {
			renderLayout({ entries: ['/popular-posts/posts#p2'] });

			expect(await screen.findByRole('heading', { name: "Couldn't load popular posts" })).toBeInTheDocument();
		});

		it('requests the posts again when Retry is clicked, and shows them when that works', async () => {
			getPopularPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(buildPage(['p1', 'p2']));

			renderLayout();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			expect(await screen.findByTestId('probe-name')).toBeInTheDocument();
			expect(getShownIds()).toBe('p1,p2');
			expect(getPopularPosts).toHaveBeenCalledTimes(2);
			expect(screen.queryByRole('heading', { name: "Couldn't load popular posts" })).not.toBeInTheDocument();
		});

		it('keeps showing the error when Retry fails again', async () => {
			renderLayout();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			await waitFor(() => expect(getPopularPosts).toHaveBeenCalledTimes(2));
			expect(await screen.findByRole('heading', { name: "Couldn't load popular posts" })).toBeInTheDocument();
		});

		it('disables Retry while the retry is in flight', async () => {
			const retry = buildDeferred();

			getPopularPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockReturnValueOnce(retry.promise);

			renderLayout();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled());

			retry.resolve(buildPage(['p1']));

			expect(await screen.findByTestId('probe-name')).toBeInTheDocument();
		});
	});

	describe('when the user in the token no longer exists', () => {
		it('ends the session', async () => {
			getPopularPosts.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderLayout();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});

		it('shows no load error', async () => {
			getPopularPosts.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderLayout();

			await waitFor(() => expect(endSession).toHaveBeenCalled());
			expect(screen.queryByRole('heading', { name: "Couldn't load popular posts" })).not.toBeInTheDocument();
		});
	});

	describe('a shared link to a deleted post', () => {
		beforeEach(() => {
			getPopularPosts.mockRejectedValueOnce({ code: 'POST_NOT_FOUND', status: 404 }).mockResolvedValueOnce(buildPage(['p1', 'p2']));
		});

		it('shows the toast "This post no longer exists"', async () => {
			const { showToast } = renderLayout({ entries: ['/popular-posts/posts#gone'] });

			await screen.findByTestId('probe-name');

			expect(showToast).toHaveBeenCalledTimes(1);
			expect(showToast).toHaveBeenCalledWith('This post no longer exists');
		});

		it('opens the grid instead, with the popular posts', async () => {
			renderLayout({ entries: ['/popular-posts/posts#gone'] });

			expect(await screen.findByTestId('probe-name')).toHaveTextContent('grid');
			expect(screen.getByTestId('path')).toHaveTextContent(/^\/popular-posts$/);
			expect(getShownIds()).toBe('p1,p2');
		});

		it('replaces the dead link in the history, so Back does not return to it', async () => {
			renderLayout({ entries: ['/popular-posts/posts#gone'] });

			await screen.findByTestId('probe-name');

			expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
			expect(screen.getByTestId('hash')).toBeEmptyDOMElement();
		});

		it('loads the page again without naming the deleted post', async () => {
			renderLayout({ entries: ['/popular-posts/posts#gone'] });

			await screen.findByTestId('probe-name');

			expect(getPopularPosts).toHaveBeenCalledTimes(2);
			expect(getPopularPosts.mock.calls[0][0].firstPostId).toBe('gone');
			expect(getPopularPosts.mock.calls[1][0].firstPostId).toBeUndefined();
		});

		it('also covers a malformed post id, which the server answers the same way', async () => {
			const { showToast } = renderLayout({ entries: ['/popular-posts/posts#not-an-id'] });

			await screen.findByTestId('probe-name');

			expect(showToast).toHaveBeenCalledWith('This post no longer exists');
		});
	});

	describe('loading the next batch', () => {
		it('asks for the next batch when the page is short enough to show its bottom, while the server has more', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2'], { hasMore: true }));
			getNextPopularPosts.mockResolvedValue(buildPage(['p3', 'p4']));

			renderLayout();

			await waitFor(() => expect(getShownIds()).toBe('p1,p2,p3,p4'));
			expect(getNextPopularPosts).toHaveBeenCalledWith({ jwtToken: 'token123', snapshotTime: SNAPSHOT_TIME, shownPostIds: ['p1', 'p2'] });
		});

		it('does not ask for a next batch when the server has no more', async () => {
			renderLayout();

			await screen.findByTestId('probe-name');

			expect(getNextPopularPosts).not.toHaveBeenCalled();
		});

		it('does not ask for a next batch while the bottom of the page is far away', async () => {
			Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 100000 });
			getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2'], { hasMore: true }));

			renderLayout();

			await screen.findByTestId('probe-name');

			expect(getNextPopularPosts).not.toHaveBeenCalled();
		});

		it('keeps the posts and flags the failure when the next batch fails', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2'], { hasMore: true }));
			getNextPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderLayout();

			await waitFor(() => expect(screen.getByTestId('has-load-more-failed')).toHaveTextContent('true'));
			expect(getShownIds()).toBe('p1,p2');
			expect(screen.queryByRole('heading', { name: "Couldn't load popular posts" })).not.toBeInTheDocument();
		});

		it('does not keep asking on its own after a batch failed', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2'], { hasMore: true }));
			getNextPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderLayout();

			await waitFor(() => expect(screen.getByTestId('has-load-more-failed')).toHaveTextContent('true'));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(getNextPopularPosts).toHaveBeenCalledTimes(1);
		});

		it('retries the batch through the retry handler it hands to the page', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2'], { hasMore: true }));
			getNextPopularPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(buildPage(['p3']));

			renderLayout();

			await waitFor(() => expect(screen.getByTestId('has-load-more-failed')).toHaveTextContent('true'));
			userEvent.click(screen.getByRole('button', { name: 'Retry batch' }));

			await waitFor(() => expect(getShownIds()).toBe('p1,p2,p3'));
			expect(screen.getByTestId('has-load-more-failed')).toHaveTextContent('false');
		});

		it('ends the session when the user in the token is gone by the time the next batch is asked for', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1'], { hasMore: true }));
			getNextPopularPosts.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderLayout();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});
	});
});
