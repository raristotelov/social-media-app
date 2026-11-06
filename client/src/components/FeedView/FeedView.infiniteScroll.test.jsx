import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getFollowedUsersPosts, likeUserPost } from '../../services/userPostService';
import { getStoryTray } from '../../services/storyService';
import { getSuggestions } from '../../services/suggestionService';
import { DESKTOP_MEDIA_QUERY } from '../../constants/layout';

import ToastProvider from '../ToastProvider/ToastProvider';

import FeedView from './FeedView';

vi.mock('../../services/userPostService');
vi.mock('../../services/commentService');
vi.mock('../../services/storyService');
vi.mock('../../services/suggestionService');
vi.mock('../../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', following: ['user2'] };
const NEAR_BOTTOM_SCROLL_Y = 3500;
const FAR_FROM_BOTTOM_SCROLL_Y = 0;
const PAGE_HEIGHT = 5000;

const buildPost = (id, overrides = {}) => ({
	_id: id,
	imageUrl: `https://example.com/${id}.jpg`,
	caption: `Caption of ${id}`,
	likes: [],
	commentsCount: 0,
	previewComments: [],
	userId: { _id: 'author-janedoe', username: 'janedoe' },
	...overrides,
});

const buildPage = (ids, { hasMore = false, nextCursor = hasMore ? `after-${ids[ids.length - 1]}` : null } = {}) => ({
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

const setViewport = (isDesktop) => {
	window.matchMedia = vi.fn((query) => ({
		matches: isDesktop && query === DESKTOP_MEDIA_QUERY,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
};

const setScroll = (scrollY) => {
	Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: scrollY });
	fireEvent.scroll(window);
};

const getRenderedPostIds = () => Array.from(document.querySelectorAll('article.user-post')).map((article) => article.id);

const renderFeed = () =>
	render(
		<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession: vi.fn() }}>
			<ToastProvider>
				<MemoryRouter initialEntries={['/user-feed']}>
					<FeedView />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

let user;

describe('FeedView infinite scroll', () => {
	const originalMatchMedia = window.matchMedia;
	const originalScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');

	beforeEach(() => {
		vi.resetAllMocks();
		user = userEvent.setup();
		getStoryTray.mockResolvedValue([]);
		getSuggestions.mockResolvedValue({ suggestions: [], reserve: [], isCarouselDismissed: false });
		setViewport(false);
		Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: PAGE_HEIGHT });
		Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: FAR_FROM_BOTTOM_SCROLL_Y });
	});

	afterEach(() => {
		if (originalScrollHeight) {
			Object.defineProperty(Element.prototype, 'scrollHeight', originalScrollHeight);
		}

		delete document.documentElement.scrollHeight;
		Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
	});

	afterAll(() => {
		window.matchMedia = originalMatchMedia;
	});

	it('does not ask for the next page while the end of the page is far away', async () => {
		getFollowedUsersPosts.mockResolvedValue(buildPage(['p3', 'p2'], { hasMore: true }));
		renderFeed();

		await screen.findAllByRole('article');
		await act(() => new Promise((resolve) => setTimeout(resolve, 60)));

		expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
	});

	it('asks for the next page, with the cursor, once the reader scrolls near the end', async () => {
		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p3', 'p2'], { hasMore: true, nextCursor: 'cursor-1' }));
		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p1']));
		renderFeed();

		await screen.findAllByRole('article');
		setScroll(NEAR_BOTTOM_SCROLL_Y);

		await waitFor(() => expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2));

		expect(getFollowedUsersPosts).toHaveBeenLastCalledWith({ cursor: 'cursor-1' });
	});

	it('shows the next page below the first one, in order, with no post twice', async () => {
		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p4', 'p3'], { hasMore: true }));
		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p3', 'p2', 'p1']));
		renderFeed();

		await screen.findAllByRole('article');
		setScroll(NEAR_BOTTOM_SCROLL_Y);

		await waitFor(() => expect(getRenderedPostIds()).toEqual(['p4', 'p3', 'p2', 'p1']));
	});

	it('loads page after page as the reader keeps scrolling, and stops after the last page', async () => {
		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p6', 'p5'], { hasMore: true, nextCursor: 'c1' }));
		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p4', 'p3'], { hasMore: true, nextCursor: 'c2' }));
		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2', 'p1'], { hasMore: false }));
		renderFeed();

		await screen.findAllByRole('article');
		setScroll(NEAR_BOTTOM_SCROLL_Y);
		await waitFor(() => expect(getRenderedPostIds()).toHaveLength(4));
		setScroll(NEAR_BOTTOM_SCROLL_Y + 1);
		await waitFor(() => expect(getRenderedPostIds()).toHaveLength(6));

		setScroll(NEAR_BOTTOM_SCROLL_Y + 2);
		await act(() => new Promise((resolve) => setTimeout(resolve, 60)));

		expect(getFollowedUsersPosts).toHaveBeenCalledTimes(3);
		expect(getFollowedUsersPosts.mock.calls.map(([arguments_]) => arguments_?.cursor)).toEqual([undefined, 'c1', 'c2']);
		expect(getRenderedPostIds()).toEqual(['p6', 'p5', 'p4', 'p3', 'p2', 'p1']);
	});

	it('asks for nothing more when the first page is the last', async () => {
		getFollowedUsersPosts.mockResolvedValue(buildPage(['p2', 'p1'], { hasMore: false }));
		renderFeed();

		await screen.findAllByRole('article');
		setScroll(NEAR_BOTTOM_SCROLL_Y);
		await act(() => new Promise((resolve) => setTimeout(resolve, 60)));

		expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
	});

	it('loads the next page by itself when the first page does not fill the screen', async () => {
		Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 600 });
		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2'], { hasMore: true }));
		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p1']));
		renderFeed();

		await waitFor(() => expect(getRenderedPostIds()).toEqual(['p2', 'p1']));
	});

	it('keeps the posts on screen and shows a spinner below them while the next page loads', async () => {
		const next = buildDeferred();

		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p3', 'p2'], { hasMore: true }));
		getFollowedUsersPosts.mockReturnValueOnce(next.promise);
		renderFeed();

		await screen.findAllByRole('article');
		setScroll(NEAR_BOTTOM_SCROLL_Y);

		await waitFor(() => expect(document.querySelector('.loading-spinner')).toBeInTheDocument());
		expect(getRenderedPostIds()).toEqual(['p3', 'p2']);

		await act(async () => next.resolve(buildPage(['p1'])));

		expect(document.querySelector('.loading-spinner')).not.toBeInTheDocument();
	});

	it('asks only once however much the reader scrolls while a page is loading', async () => {
		const next = buildDeferred();

		getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p3'], { hasMore: true }));
		getFollowedUsersPosts.mockReturnValueOnce(next.promise);
		renderFeed();

		await screen.findAllByRole('article');
		setScroll(NEAR_BOTTOM_SCROLL_Y);
		await waitFor(() => expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2));
		setScroll(NEAR_BOTTOM_SCROLL_Y + 10);
		setScroll(NEAR_BOTTOM_SCROLL_Y + 20);
		await act(() => new Promise((resolve) => setTimeout(resolve, 60)));

		expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2);

		await act(async () => next.resolve(buildPage(['p2'])));
	});

	describe('when the next page fails', () => {
		it('keeps the posts and shows the inline message with a retry', async () => {
			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p3', 'p2'], { hasMore: true }));
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			await screen.findAllByRole('article');
			setScroll(NEAR_BOTTOM_SCROLL_Y);

			await waitFor(() => expect(document.querySelector('.load-more-error')).toHaveTextContent("Couldn't load more posts"));

			expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
			expect(getRenderedPostIds()).toEqual(['p3', 'p2']);
		});

		it('does not keep asking by itself while the message is shown', async () => {
			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p3'], { hasMore: true }));
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			await screen.findAllByRole('article');
			setScroll(NEAR_BOTTOM_SCROLL_Y);
			await waitFor(() => expect(document.querySelector('.load-more-error')).toBeInTheDocument());
			setScroll(NEAR_BOTTOM_SCROLL_Y + 5);
			await act(() => new Promise((resolve) => setTimeout(resolve, 60)));

			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2);
		});

		it('adds the page and removes the message when Try again works', async () => {
			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p3'], { hasMore: true, nextCursor: 'c1' }));
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });
			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2']));
			renderFeed();

			await screen.findAllByRole('article');
			setScroll(NEAR_BOTTOM_SCROLL_Y);
			await user.click(await screen.findByRole('button', { name: 'Try again' }));

			await waitFor(() => expect(getRenderedPostIds()).toEqual(['p3', 'p2']));

			expect(document.querySelector('.load-more-error')).not.toBeInTheDocument();
			expect(getFollowedUsersPosts).toHaveBeenLastCalledWith({ cursor: 'c1' });
		});
	});

	describe('with the other parts of the feed', () => {
		it('keeps the suggestions carousel after the 5th post when more posts are added below', async () => {
			mockCarousel();
			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p8', 'p7', 'p6', 'p5', 'p4', 'p3'], { hasMore: true }));
			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2', 'p1']));
			renderFeed();

			await screen.findByRole('region', { name: 'Suggested for you' });
			setScroll(NEAR_BOTTOM_SCROLL_Y);
			await waitFor(() => expect(getRenderedPostIds()).toHaveLength(8));

			expect(getFeedChildKinds()).toEqual(['p8', 'p7', 'p6', 'p5', 'p4', 'carousel', 'p3', 'p2', 'p1']);
			expect(screen.getAllByRole('region', { name: 'Suggested for you' })).toHaveLength(1);
		});

		it('updates a post that came with a later page', async () => {
			likeUserPost.mockResolvedValue({ _id: 'p2', likes: ['user1'] });
			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p3'], { hasMore: true }));
			getFollowedUsersPosts.mockResolvedValueOnce(buildPage(['p2']));
			renderFeed();

			await screen.findAllByRole('article');
			setScroll(NEAR_BOTTOM_SCROLL_Y);
			await waitFor(() => expect(getRenderedPostIds()).toEqual(['p3', 'p2']));

			const secondPost = document.getElementById('p2');

			await user.click(within(secondPost).getByRole('button', { name: 'Like post' }));

			await waitFor(() => expect(within(secondPost).getByRole('button', { name: 'Unlike post' })).toBeInTheDocument());
			expect(within(document.getElementById('p3')).getByRole('button', { name: 'Like post' })).toBeInTheDocument();
		});

		it('shows the empty feed message, and no load-more footer, for someone who follows nobody', async () => {
			getFollowedUsersPosts.mockResolvedValue(buildPage([]));
			renderFeed();

			expect(await screen.findByRole('heading', { name: 'Your feed is empty' })).toBeInTheDocument();
			expect(document.querySelector('.load-more-error')).not.toBeInTheDocument();
			expect(document.querySelector('.loading-spinner')).not.toBeInTheDocument();
		});
	});

	function mockCarousel() {
		getSuggestions.mockImplementation(async ({ placement }) =>
			placement === 'carousel'
				? {
						suggestions: [1, 2, 3].map((id) => ({ _id: `c${id}`, username: `name-c${id}`, group: 'popular' })),
						reserve: [],
						isCarouselDismissed: false,
					}
				: { suggestions: [], reserve: [], isCarouselDismissed: false },
		);
	}

	function getFeedChildKinds() {
		return Array.from(document.querySelector('.feed-posts').children).map((child) => (child.tagName === 'ARTICLE' ? child.id : 'carousel'));
	}
});
