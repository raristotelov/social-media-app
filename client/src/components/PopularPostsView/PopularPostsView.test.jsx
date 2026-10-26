import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getPopularPosts, getNextPopularPosts } from '../../services/userPostService';

import MainHeader from '../Header/MainHeader';
import PopularPostsLayout from '../PopularPostsLayout/PopularPostsLayout';
import PopularPostsPostsView from '../PopularPostsPostsView/PopularPostsPostsView';
import ToastProvider from '../ToastProvider/ToastProvider';

import PopularPostsView from './PopularPostsView';

jest.mock('../../services/userPostService');
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

const buildPage = (posts, { hasMore = false } = {}) => ({
	posts: posts.map((post) => (typeof post === 'string' ? buildPost(post) : post)),
	snapshotTime: SNAPSHOT_TIME,
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

const LocationProbe = () => {
	const location = useLocation();

	return (
		<div>
			<p data-testid='path'>{location.pathname}</p>

			<p data-testid='hash'>{location.hash}</p>
		</div>
	);
};

const memberUser = { _id: 'user1', username: 'johndoe', following: [] };

const renderPopular = ({ entries = ['/popular-posts'], user = memberUser } = {}) =>
	render(
		<LoggedInUserContext.Provider
			value={{ jwtToken: user ? 'token123' : null, loggedInUser: user, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}
		>
			<ToastProvider>
				<MemoryRouter initialEntries={entries}>
					<MainHeader logoutHandler={jest.fn()} />

					<Routes>
						<Route path='/popular-posts' element={<PopularPostsLayout />}>
							<Route index element={<PopularPostsView />} />

							<Route path='posts' element={<PopularPostsPostsView />} />
						</Route>
					</Routes>

					<LocationProbe />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

const getTiles = () => Array.from(document.querySelectorAll('.profile-post'));

const getTileLinks = () => Array.from(document.querySelectorAll('.profile-post-link'));

const getTileStatTexts = (tileIndex) => Array.from(getTiles()[tileIndex].querySelectorAll('.profile-post-stat')).map((stat) => stat.textContent);

const getInlineError = () => document.querySelector('.popular-posts-load-error');

describe('PopularPostsView', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		window.HTMLElement.prototype.scrollIntoView = jest.fn();
		getPopularPosts.mockResolvedValue(buildPage(['p3', 'p2', 'p1']));
		getNextPopularPosts.mockResolvedValue(buildPage([]));
	});

	afterEach(() => {
		delete window.HTMLElement.prototype.scrollIntoView;
	});

	describe('the grid of posts from the server', () => {
		it('shows one tile for every post the server returned', async () => {
			renderPopular();

			await screen.findAllByAltText('user-post');

			expect(getTiles()).toHaveLength(3);
		});

		it('shows the tiles in the order the server ranked them', async () => {
			renderPopular();

			const images = await screen.findAllByAltText('user-post');

			expect(images.map((image) => image.getAttribute('src'))).toEqual([
				'https://example.com/p3.jpg',
				'https://example.com/p2.jpg',
				'https://example.com/p1.jpg',
			]);
		});

		it('shows no placeholder tiles beyond the real posts', async () => {
			getPopularPosts.mockResolvedValue(buildPage(['p1']));

			renderPopular();

			await screen.findAllByAltText('user-post');

			expect(getTiles()).toHaveLength(1);
		});

		it('links each tile to the posts view at that post', async () => {
			renderPopular();

			await screen.findAllByAltText('user-post');

			expect(getTileLinks().map((link) => link.getAttribute('href'))).toEqual([
				'/popular-posts/posts#p3',
				'/popular-posts/posts#p2',
				'/popular-posts/posts#p1',
			]);
		});

		it('shows the likes and comments counts on each tile', async () => {
			getPopularPosts.mockResolvedValue(
				buildPage([buildPost('p1', { likes: ['a', 'b', 'c'], commentsCount: 7 }), buildPost('p2', { likes: [], commentsCount: 0 })]),
			);

			renderPopular();

			await screen.findAllByAltText('user-post');

			expect(getTileStatTexts(0)).toEqual(['3', '7']);
			expect(getTileStatTexts(1)).toEqual(['0', '0']);
		});

		it('requests the posts once', async () => {
			renderPopular();

			await screen.findAllByAltText('user-post');

			expect(getPopularPosts).toHaveBeenCalledTimes(1);
		});

		it('does not show the full-page posts cards on the grid', async () => {
			renderPopular();

			await screen.findAllByAltText('user-post');

			expect(screen.queryByRole('article')).not.toBeInTheDocument();
		});

		it('shows the full-page spinner while the posts load', () => {
			getPopularPosts.mockReturnValue(new Promise(() => {}));

			renderPopular();

			expect(document.querySelector('.spinner-container-full-page')).toBeInTheDocument();
			expect(getTiles()).toHaveLength(0);
		});

		it('opens the posts view at the clicked post', async () => {
			renderPopular();

			await screen.findAllByAltText('user-post');
			userEvent.click(getTileLinks()[1]);

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			expect(screen.getByTestId('path')).toHaveTextContent(/^\/popular-posts\/posts$/);
			expect(screen.getByTestId('hash')).toHaveTextContent('#p2');
		});
	});

	describe('when there is nothing to show', () => {
		beforeEach(() => {
			getPopularPosts.mockResolvedValue(buildPage([]));
		});

		it('shows "Nothing new to discover" in place of the grid', async () => {
			renderPopular();

			expect(await screen.findByRole('heading', { name: 'Nothing new to discover' })).toBeInTheDocument();
			expect(getTiles()).toHaveLength(0);
		});

		it("looks like the empty feed's title", async () => {
			renderPopular();

			expect(await screen.findByRole('heading', { name: 'Nothing new to discover' })).toHaveClass('feed-empty-title');
		});

		it('shows no error and no retry button', async () => {
			renderPopular();

			await screen.findByRole('heading', { name: 'Nothing new to discover' });

			expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
			expect(getInlineError()).not.toBeInTheDocument();
		});

		it('shows the same message to a guest', async () => {
			renderPopular({ user: null });

			expect(await screen.findByRole('heading', { name: 'Nothing new to discover' })).toBeInTheDocument();
		});

		it('shows no grid tiles while the message is shown', async () => {
			renderPopular();

			await screen.findByRole('heading', { name: 'Nothing new to discover' });

			expect(document.querySelector('.popular-posts-grid')).not.toBeInTheDocument();
		});
	});

	describe('when the posts fail to load', () => {
		beforeEach(() => {
			getPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
		});

		it('shows the full-page error with its copy', async () => {
			renderPopular();

			expect(await screen.findByRole('heading', { name: "Couldn't load popular posts" })).toBeInTheDocument();
			expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
		});

		it('shows no tiles and not the empty message', async () => {
			renderPopular();

			await screen.findByRole('heading', { name: "Couldn't load popular posts" });

			expect(getTiles()).toHaveLength(0);
			expect(screen.queryByText('Nothing new to discover')).not.toBeInTheDocument();
		});

		it('shows the grid after Retry succeeds', async () => {
			getPopularPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(buildPage(['p1', 'p2']));

			renderPopular();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			expect(await screen.findAllByAltText('user-post')).toHaveLength(2);
		});
	});

	describe('the header', () => {
		it('shows a guest the guest header, with Log in and Sign up', async () => {
			renderPopular({ user: null });

			await screen.findAllByAltText('user-post');

			expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
			expect(document.querySelector('[aria-haspopup="menu"]')).not.toBeInTheDocument();
		});

		it('shows a logged-in user the member header, with the account menu and no Log in or Sign up', async () => {
			renderPopular();

			await screen.findAllByAltText('user-post');

			expect(document.querySelector('[aria-haspopup="menu"]')).toBeInTheDocument();
			expect(screen.getByText('johndoe')).toBeInTheDocument();
			expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
			expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
		});

		it('shows the same grid to a guest and to a member', async () => {
			const guest = renderPopular({ user: null });

			await screen.findAllByAltText('user-post');
			const guestHrefs = getTileLinks().map((link) => link.getAttribute('href'));

			guest.unmount();
			renderPopular();

			await screen.findAllByAltText('user-post');

			expect(getTileLinks().map((link) => link.getAttribute('href'))).toEqual(guestHrefs);
		});

		it('marks the Popular link as the current page on the grid', async () => {
			renderPopular({ user: null });

			await screen.findAllByAltText('user-post');

			expect(screen.getByRole('link', { name: 'Popular' })).toHaveClass('navigation-item-active');
		});

		it('requests the posts with the token for a member and without for a guest', async () => {
			const guest = renderPopular({ user: null });

			await screen.findAllByAltText('user-post');
			expect(getPopularPosts).toHaveBeenLastCalledWith(expect.objectContaining({ jwtToken: null }));

			guest.unmount();
			renderPopular();

			await screen.findAllByAltText('user-post');
			expect(getPopularPosts).toHaveBeenLastCalledWith(expect.objectContaining({ jwtToken: 'token123' }));
		});
	});

	describe('infinite scroll', () => {
		const buildNumberedIds = (from, to) => Array.from({ length: to - from + 1 }, (_item, index) => `p${from + index}`);

		it('loads the next batch under the loaded tiles, without repeating any', async () => {
			getPopularPosts.mockResolvedValue(buildPage(buildNumberedIds(1, 3), { hasMore: true }));
			getNextPopularPosts.mockResolvedValue(buildPage(buildNumberedIds(4, 6)));

			renderPopular();

			await waitFor(() => expect(getTiles()).toHaveLength(6));

			const hrefs = getTileLinks().map((link) => link.getAttribute('href'));

			expect(new Set(hrefs).size).toBe(6);
			expect(hrefs[0]).toBe('/popular-posts/posts#p1');
			expect(hrefs[5]).toBe('/popular-posts/posts#p6');
		});

		it('sends the ids of the tiles already shown with the next batch', async () => {
			getPopularPosts.mockResolvedValue(buildPage(buildNumberedIds(1, 3), { hasMore: true }));

			renderPopular();

			await waitFor(() => expect(getNextPopularPosts).toHaveBeenCalled());

			expect(getNextPopularPosts).toHaveBeenCalledWith({ jwtToken: 'token123', snapshotTime: SNAPSHOT_TIME, shownPostIds: ['p1', 'p2', 'p3'] });
		});

		it('shows a spinner under the grid while the next batch loads', async () => {
			const batch = buildDeferred();

			getPopularPosts.mockResolvedValue(buildPage(buildNumberedIds(1, 3), { hasMore: true }));
			getNextPopularPosts.mockReturnValue(batch.promise);

			renderPopular();

			await waitFor(() => expect(document.querySelector('.popular-posts-wrapper .spinner-container')).toBeInTheDocument());
			expect(getTiles()).toHaveLength(3);

			batch.resolve(buildPage([]));

			await waitFor(() => expect(document.querySelector('.popular-posts-wrapper .spinner-container')).not.toBeInTheDocument());
		});

		it('keeps the loaded tiles and shows "Couldn\'t load more posts · Try again" under them when the batch fails', async () => {
			getPopularPosts.mockResolvedValue(buildPage(buildNumberedIds(1, 3), { hasMore: true }));
			getNextPopularPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderPopular();

			expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
			expect(getInlineError()).toHaveTextContent("Couldn't load more posts");
			expect(getTiles()).toHaveLength(3);
			expect(screen.queryByRole('heading', { name: "Couldn't load popular posts" })).not.toBeInTheDocument();
		});

		it('loads the batch when Try again is clicked, and the error goes away', async () => {
			getPopularPosts.mockResolvedValue(buildPage(buildNumberedIds(1, 3), { hasMore: true }));
			getNextPopularPosts
				.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 })
				.mockResolvedValueOnce(buildPage(buildNumberedIds(4, 5)));

			renderPopular();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			await waitFor(() => expect(getTiles()).toHaveLength(5));
			expect(getInlineError()).not.toBeInTheDocument();
		});

		it('shows no spinner and no error when there is nothing more to load', async () => {
			renderPopular();

			await screen.findAllByAltText('user-post');

			expect(getInlineError()).not.toBeInTheDocument();
			expect(document.querySelector('.popular-posts-wrapper .spinner-container')).not.toBeInTheDocument();
			expect(within(document.querySelector('.popular-posts-wrapper')).queryByRole('button')).not.toBeInTheDocument();
		});
	});
});
