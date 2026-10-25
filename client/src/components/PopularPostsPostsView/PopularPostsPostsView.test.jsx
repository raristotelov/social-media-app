import '@testing-library/jest-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getPopularPosts, getNextPopularPosts, likeUserPost } from '../../services/userPostService';
import { getComments, addComment, likeComment } from '../../services/commentService';
import { getStoryTray } from '../../services/storyService';
import { getSuggestions } from '../../services/suggestionService';

import PopularPostsLayout from '../PopularPostsLayout/PopularPostsLayout';
import PopularPostsView from '../PopularPostsView/PopularPostsView';
import ToastProvider from '../ToastProvider/ToastProvider';

import PopularPostsPostsView from './PopularPostsPostsView';

jest.mock('../../services/userPostService');
jest.mock('../../services/commentService');
jest.mock('../../services/storyService');
jest.mock('../../services/suggestionService');
jest.mock('../../services/userService');

const SNAPSHOT_TIME = '2026-10-24T10:00:00.000Z';

const buildPost = (id, overrides = {}) => ({
	_id: id,
	imageUrl: `https://example.com/${id}.jpg`,
	imageWidth: 100,
	imageHeight: 100,
	caption: `Caption of ${id}`,
	likes: [],
	commentsCount: 0,
	previewComments: [],
	userId: { _id: 'author1', username: 'janedoe' },
	...overrides,
});

const buildPage = (ids, { hasMore = false } = {}) => ({
	posts: ids.map((id) => buildPost(id)),
	snapshotTime: SNAPSHOT_TIME,
	hasMore,
});

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

const LoginProbe = () => {
	const location = useLocation();

	return <p data-testid='login-from'>{location.state?.from}</p>;
};

const memberUser = { _id: 'user1', username: 'johndoe', following: [] };

const renderPosts = ({ entries = ['/popular-posts/posts#p2'], initialIndex, user = memberUser } = {}) =>
	render(
		<LoggedInUserContext.Provider
			value={{ jwtToken: user ? 'token123' : null, loggedInUser: user, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}
		>
			<ToastProvider>
				<MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
					<Routes>
						<Route path='/popular-posts' element={<PopularPostsLayout />}>
							<Route index element={<PopularPostsView />} />

							<Route path='posts' element={<PopularPostsPostsView />} />
						</Route>

						<Route path='/log-in' element={<LoginProbe />} />

						<Route path='/other' element={<p>Other page</p>} />
					</Routes>

					<LocationProbe />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

const getRenderedPostIds = () => Array.from(document.querySelectorAll('article.user-post')).map((article) => article.id);

const getTileStatTexts = (tileIndex) =>
	Array.from(document.querySelectorAll('.profile-post')[tileIndex].querySelectorAll('.profile-post-stat')).map((stat) => stat.textContent);

describe('PopularPostsPostsView', () => {
	let mockScrollIntoView;

	beforeEach(() => {
		jest.resetAllMocks();
		mockScrollIntoView = jest.fn();
		window.HTMLElement.prototype.scrollIntoView = mockScrollIntoView;
		getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2', 'p3']));
		getNextPopularPosts.mockResolvedValue(buildPage([]));
	});

	afterEach(() => {
		delete window.HTMLElement.prototype.scrollIntoView;
		window.history.replaceState(null, '');
	});

	describe('showing the posts', () => {
		it('shows every loaded post as a full card', async () => {
			renderPosts();

			expect(await screen.findAllByRole('article')).toHaveLength(3);
		});

		it('shows the posts in the order the server ranked them', async () => {
			renderPosts();

			await screen.findAllByRole('article');

			expect(getRenderedPostIds()).toEqual(['p1', 'p2', 'p3']);
		});

		it("shows the author of every post on its header, linked to the author's profile", async () => {
			renderPosts();

			const articles = await screen.findAllByRole('article');

			articles.forEach((article) => {
				expect(within(article).getByRole('link', { name: 'janedoe' })).toHaveAttribute('href', '/user/author1');
			});
		});

		it('shows each post with its caption', async () => {
			renderPosts();

			await screen.findAllByRole('article');

			expect(document.getElementById('p2')).toHaveTextContent('Caption of p2');
		});

		it("shows no post actions, since the posts are never the viewer's own", async () => {
			renderPosts();

			await screen.findAllByRole('article');

			expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
		});
	});

	describe('the Posts bar', () => {
		it('shows "Posts" with "Popular" beneath it', async () => {
			renderPosts();

			await screen.findAllByRole('article');

			expect(screen.getByRole('heading', { name: 'Posts' })).toBeInTheDocument();
			expect(document.querySelector('.posts-bar-subtitle')).toHaveTextContent('Popular');
		});

		it('has a back chevron', async () => {
			renderPosts();

			await screen.findAllByRole('article');

			expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
		});
	});

	describe('posts only', () => {
		it('loads no stories tray and no suggestions', async () => {
			renderPosts();

			await screen.findAllByRole('article');

			expect(getStoryTray).not.toHaveBeenCalled();
			expect(getSuggestions).not.toHaveBeenCalled();
		});

		it('shows nothing but the bar and the posts', async () => {
			renderPosts();

			await screen.findAllByRole('article');

			expect(document.querySelector('.profile-posts-view').children).toHaveLength(2);
			expect(screen.queryByText(/suggest/i)).not.toBeInTheDocument();
		});

		it('shows no empty-feed message', async () => {
			renderPosts();

			await screen.findAllByRole('article');

			expect(screen.queryByText('Your feed is empty')).not.toBeInTheDocument();
		});
	});

	describe('opening at a post', () => {
		it('scrolls to the post named by the hash on a shared link', async () => {
			renderPosts({ entries: ['/popular-posts/posts#p2'] });

			await screen.findAllByRole('article');

			expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
			expect(mockScrollIntoView.mock.instances[0].id).toBe('p2');
		});

		it('asks the server for that post first, ranked ones after it', async () => {
			renderPosts({ entries: ['/popular-posts/posts#p2'] });

			await screen.findAllByRole('article');

			expect(getPopularPosts).toHaveBeenCalledWith(expect.objectContaining({ firstPostId: 'p2' }));
		});

		it('shows the post named by the link above all others when the server puts it first', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p2', 'p1', 'p3']));

			renderPosts({ entries: ['/popular-posts/posts#p2'] });

			await screen.findAllByRole('article');

			expect(getRenderedPostIds()[0]).toBe('p2');
		});

		it('scrolls nothing into view when the hash names no loaded post', async () => {
			renderPosts({ entries: ['/popular-posts/posts#unknown'] });

			await screen.findAllByRole('article');

			expect(mockScrollIntoView).not.toHaveBeenCalled();
		});

		it('opens at the clicked post when coming from the grid, without asking the server again', async () => {
			renderPosts({ entries: ['/popular-posts'] });

			await screen.findAllByAltText('user-post');
			userEvent.click(document.querySelectorAll('.profile-post-link')[1]);

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			expect(screen.getByTestId('hash')).toHaveTextContent('#p2');
			expect(mockScrollIntoView.mock.instances[0].id).toBe('p2');
			expect(getPopularPosts).toHaveBeenCalledTimes(1);
		});

		it('shows the posts ranked above the clicked one above it, and those ranked below it below', async () => {
			renderPosts({ entries: ['/popular-posts'] });

			await screen.findAllByAltText('user-post');
			userEvent.click(document.querySelectorAll('.profile-post-link')[1]);
			await screen.findAllByRole('article');

			const ids = getRenderedPostIds();

			expect(ids.indexOf('p1')).toBeLessThan(ids.indexOf('p2'));
			expect(ids.indexOf('p3')).toBeGreaterThan(ids.indexOf('p2'));
		});
	});

	describe('a shared link to a deleted post', () => {
		beforeEach(() => {
			getPopularPosts.mockRejectedValueOnce({ code: 'POST_NOT_FOUND', status: 404 }).mockResolvedValueOnce(buildPage(['p1', 'p2', 'p3']));
		});

		it('opens the grid with the toast "This post no longer exists"', async () => {
			renderPosts({ entries: ['/popular-posts/posts#gone'] });

			expect(await screen.findByText('This post no longer exists')).toBeInTheDocument();
			expect(await screen.findAllByAltText('user-post')).toHaveLength(3);
			expect(screen.getByTestId('path')).toHaveTextContent(/^\/popular-posts$/);
		});

		it('shows no posts view', async () => {
			renderPosts({ entries: ['/popular-posts/posts#gone'] });

			await screen.findAllByAltText('user-post');

			expect(screen.queryByRole('article')).not.toBeInTheDocument();
			expect(screen.queryByRole('heading', { name: 'Posts' })).not.toBeInTheDocument();
		});
	});

	describe('the back chevron', () => {
		it('goes back to the grid when the posts view was opened from it', async () => {
			renderPosts({ entries: ['/popular-posts', '/popular-posts/posts#p2'], initialIndex: 1 });

			await screen.findAllByRole('article');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/popular-posts$/));
			expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP');
			expect(await screen.findAllByAltText('user-post')).toHaveLength(3);
		});

		it('goes back to the page it was opened from, when that was not the grid', async () => {
			renderPosts({ entries: ['/other', '/popular-posts/posts#p2'], initialIndex: 1 });

			await screen.findAllByRole('article');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			expect(await screen.findByText('Other page')).toBeInTheDocument();
		});

		it('keeps the loaded posts on the grid instead of loading them again', async () => {
			renderPosts({ entries: ['/popular-posts', '/popular-posts/posts#p2'], initialIndex: 1 });

			await screen.findAllByRole('article');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await screen.findAllByAltText('user-post');

			expect(getPopularPosts).toHaveBeenCalledTimes(1);
		});

		it('goes to the grid, replacing the entry, when the posts view is the first history entry', async () => {
			renderPosts({ entries: ['/popular-posts/posts#p2'] });

			await screen.findAllByRole('article');
			window.history.replaceState({ idx: 0 }, '');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/popular-posts$/));
			expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
		});

		it('shows the loaded posts on the grid after a shared-link visit, the opened post first, without loading again', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p2', 'p1', 'p3']));

			renderPosts({ entries: ['/popular-posts/posts#p2'] });

			await screen.findAllByRole('article');
			window.history.replaceState({ idx: 0 }, '');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			const images = await screen.findAllByAltText('user-post');

			expect(images.map((image) => image.getAttribute('src'))).toEqual([
				'https://example.com/p2.jpg',
				'https://example.com/p1.jpg',
				'https://example.com/p3.jpg',
			]);
			expect(getPopularPosts).toHaveBeenCalledTimes(1);
		});
	});

	describe('as a guest', () => {
		it('loads and shows the posts without a token', async () => {
			renderPosts({ user: null });

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			expect(getPopularPosts).toHaveBeenCalledWith(expect.objectContaining({ jwtToken: null }));
		});

		it('shows the same cards as a member, with the like control and the comment box', async () => {
			renderPosts({ user: null });

			await screen.findAllByRole('article');

			expect(screen.getAllByRole('button', { name: 'Like post' })).toHaveLength(3);
			expect(screen.getAllByPlaceholderText('Add a comment...')).toHaveLength(3);
		});

		it('sends the guest to /log-in with the same URL, hash included, when Like is clicked', async () => {
			renderPosts({ user: null, entries: ['/popular-posts/posts#p2'] });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: 'Like post' }));

			expect(await screen.findByTestId('login-from')).toHaveTextContent('/popular-posts/posts#p2');
			expect(likeUserPost).not.toHaveBeenCalled();
		});

		it('sends the guest to /log-in with the same URL when the comment box is clicked', async () => {
			renderPosts({ user: null, entries: ['/popular-posts/posts#p2'] });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByPlaceholderText('Add a comment...'));

			expect(await screen.findByTestId('login-from')).toHaveTextContent('/popular-posts/posts#p2');
			expect(addComment).not.toHaveBeenCalled();
		});

		it('lets the guest read the comments in the popup without logging in', async () => {
			getComments.mockResolvedValue([{ _id: 'c1', text: 'Hello there', likes: [], userId: { _id: 'user3', username: 'alice' }, replies: [] }]);

			renderPosts({ user: null });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[0]).getByRole('button', { name: '0 comments' }));

			expect(await screen.findByText('Hello there', { selector: '.comment-text' })).toBeInTheDocument();
			expect(screen.queryByTestId('login-from')).not.toBeInTheDocument();
		});

		it('sends the guest to /log-in with the same URL when a comment heart is clicked in the popup', async () => {
			getComments.mockResolvedValue([{ _id: 'c1', text: 'Hello there', likes: [], userId: { _id: 'user3', username: 'alice' }, replies: [] }]);

			renderPosts({ user: null, entries: ['/popular-posts/posts#p2'] });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: '0 comments' }));
			await screen.findByText('Hello there', { selector: '.comment-text' });
			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			expect(await screen.findByTestId('login-from')).toHaveTextContent('/popular-posts/posts#p2');
			expect(likeComment).not.toHaveBeenCalled();
		});

		it('shows Post disabled, and clicking it adds no comment', async () => {
			renderPosts({ user: null });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[0]).getByRole('button', { name: 'Post' }));

			expect(within(articles[0]).getByRole('button', { name: 'Post' })).toBeDisabled();
			expect(addComment).not.toHaveBeenCalled();
		});
	});

	describe('as a member', () => {
		it('likes a post and shows the new like count', async () => {
			likeUserPost.mockResolvedValue({ _id: 'p2', likes: ['user1'] });

			renderPosts();

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: 'Like post' }));

			expect(await within(articles[1]).findByText('1 like')).toBeInTheDocument();
			expect(likeUserPost).toHaveBeenCalledWith({ userPostToLikeId: 'p2', jwtToken: 'token123' });
		});

		it('shows a like given in the posts view on the grid tile', async () => {
			likeUserPost.mockResolvedValue({ _id: 'p1', likes: ['user1'] });

			renderPosts({ entries: ['/popular-posts'] });

			await screen.findAllByAltText('user-post');
			userEvent.click(document.querySelectorAll('.profile-post-link')[0]);

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[0]).getByRole('button', { name: 'Like post' }));
			await within(articles[0]).findByText('1 like');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await screen.findAllByAltText('user-post');

			expect(getTileStatTexts(0)[0]).toBe('1');
		});

		it('shows a comment added in the posts view on the grid tile', async () => {
			addComment.mockResolvedValue({
				_id: 'c9',
				text: 'Nice shot',
				likes: [],
				createdAt: '2024-06-01T00:00:00.000Z',
				userId: { _id: 'user1', username: 'johndoe' },
			});

			renderPosts({ entries: ['/popular-posts'] });

			await screen.findAllByAltText('user-post');
			userEvent.click(document.querySelectorAll('.profile-post-link')[0]);

			const articles = await screen.findAllByRole('article');

			userEvent.type(within(articles[0]).getByPlaceholderText('Add a comment...'), 'Nice shot');
			userEvent.click(within(articles[0]).getByRole('button', { name: 'Post' }));
			await within(articles[0]).findByRole('button', { name: '1 comment' });
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await screen.findAllByAltText('user-post');

			expect(getTileStatTexts(0)[1]).toBe('1');
		});

		it('shows the toast for a failed like and keeps the post', async () => {
			likeUserPost.mockRejectedValue({ code: 'POST_NOT_FOUND', status: 404 });

			renderPosts();

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: 'Like post' }));

			expect(await screen.findByText('This post no longer exists')).toBeInTheDocument();
			expect(getRenderedPostIds()).toEqual(['p1', 'p2', 'p3']);
		});
	});

	describe('loading more posts', () => {
		it('appends the next batch below the loaded posts', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2'], { hasMore: true }));
			getNextPopularPosts.mockResolvedValue(buildPage(['p3', 'p4']));

			renderPosts({ entries: ['/popular-posts/posts#p1'] });

			await waitFor(() => expect(getRenderedPostIds()).toEqual(['p1', 'p2', 'p3', 'p4']));
		});

		it('sends the ids already shown, so none repeats', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2'], { hasMore: true }));

			renderPosts({ entries: ['/popular-posts/posts#p1'] });

			await waitFor(() => expect(getNextPopularPosts).toHaveBeenCalled());

			expect(getNextPopularPosts).toHaveBeenCalledWith(expect.objectContaining({ shownPostIds: ['p1', 'p2'] }));
		});

		it('shows "Couldn\'t load more posts · Try again" under the last post and keeps the posts when the batch fails', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2'], { hasMore: true }));
			getNextPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderPosts({ entries: ['/popular-posts/posts#p1'] });

			expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
			expect(document.querySelector('.popular-posts-load-error')).toHaveTextContent("Couldn't load more posts");
			expect(getRenderedPostIds()).toEqual(['p1', 'p2']);
		});

		it('loads the batch when Try again is clicked', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1', 'p2'], { hasMore: true }));
			getNextPopularPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(buildPage(['p3']));

			renderPosts({ entries: ['/popular-posts/posts#p1'] });

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			await waitFor(() => expect(getRenderedPostIds()).toEqual(['p1', 'p2', 'p3']));
			expect(document.querySelector('.popular-posts-load-error')).not.toBeInTheDocument();
		});
	});

	describe('the Posts bar while scrolling', () => {
		let queuedFrames;
		let nextFrameId;
		let requestFrameSpy;
		let cancelFrameSpy;

		const scrollTo = (scrollY) => {
			act(() => {
				Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: scrollY });
				window.dispatchEvent(new Event('scroll'));
			});
			act(() => {
				const frames = [...queuedFrames.values()];

				queuedFrames.clear();
				frames.forEach((frame) => frame());
			});
		};

		beforeEach(() => {
			queuedFrames = new Map();
			nextFrameId = 1;
			Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
			requestFrameSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
				const frameId = nextFrameId;

				nextFrameId += 1;
				queuedFrames.set(frameId, callback);

				return frameId;
			});
			cancelFrameSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
				queuedFrames.delete(frameId);
			});
		});

		afterEach(() => {
			requestFrameSpy.mockRestore();
			cancelFrameSpy.mockRestore();
			Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
		});

		it('hides when the page is scrolled down and reappears when it is scrolled up', async () => {
			renderPosts();

			await screen.findAllByRole('article');
			scrollTo(600);

			expect(document.querySelector('.posts-bar')).toHaveClass('posts-bar-hidden');

			scrollTo(300);

			expect(document.querySelector('.posts-bar')).not.toHaveClass('posts-bar-hidden');
		});
	});
});
