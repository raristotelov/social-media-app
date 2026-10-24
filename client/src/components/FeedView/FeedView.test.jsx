import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getFollowedUsersPosts, likeUserPost } from '../../services/userPostService';
import { addComment } from '../../services/commentService';
import { getStoryTray } from '../../services/storyService';
import { dismissSuggestionsCarousel, getSuggestions } from '../../services/suggestionService';
import { followUser, unfollowUser } from '../../services/userService';
import { DESKTOP_MEDIA_QUERY } from '../../constants/layout';

import ToastProvider from '../ToastProvider/ToastProvider';

import FeedView from './FeedView';

jest.mock('../../services/userPostService');
jest.mock('../../services/commentService');
jest.mock('../../services/storyService');
jest.mock('../../services/suggestionService');
jest.mock('../../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', following: ['user2', 'user3'] };

const buildSuggestion = (id, group = 'popular') => ({ _id: id, username: `name-${id}`, group });

const EMPTY_SUGGESTIONS = { suggestions: [], reserve: [], isCarouselDismissed: false };

const setViewport = (isDesktop) => {
	window.matchMedia = jest.fn((query) => ({
		matches: isDesktop && query === DESKTOP_MEDIA_QUERY,
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
	}));
};

const mockSuggestionsByPlacement = (resultsByPlacement) => {
	getSuggestions.mockImplementation(async ({ placement }) => resultsByPlacement[placement] ?? EMPTY_SUGGESTIONS);
};

const getRequestedPlacements = () => getSuggestions.mock.calls.map(([{ placement }]) => placement);

const buildPost = (id, username, overrides = {}) => ({
	_id: id,
	imageUrl: `https://example.com/${id}.jpg`,
	caption: `Caption of ${id}`,
	likes: [],
	commentsCount: 0,
	previewComments: [],
	userId: { _id: `author-${username}`, username },
	...overrides,
});

const feedPosts = [buildPost('post3', 'janedoe'), buildPost('post2', 'alice'), buildPost('post1', 'janedoe')];

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const renderFeed = ({ user = loggedInUser, endSession = jest.fn() } = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser: user, updateLoggedInUser: jest.fn(), endSession }}>
			<ToastProvider>
				<MemoryRouter initialEntries={['/user-feed']}>
					<FeedView />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, endSession };
};

const getRenderedPostIds = () => Array.from(document.querySelectorAll('article.user-post')).map((article) => article.id);

describe('FeedView', () => {
	const originalMatchMedia = window.matchMedia;

	beforeEach(() => {
		jest.resetAllMocks();
		getStoryTray.mockResolvedValue([]);
		getSuggestions.mockResolvedValue(EMPTY_SUGGESTIONS);
		followUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
		unfollowUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
		dismissSuggestionsCarousel.mockResolvedValue(undefined);
		setViewport(false);
	});

	afterAll(() => {
		window.matchMedia = originalMatchMedia;
	});

	describe('the stories tray', () => {
		const trayEntries = [
			{ user: { _id: 'user1', username: 'johndoe' }, isOwn: true, isWatched: true },
			{ user: { _id: 'user2', username: 'alice' }, isOwn: false, isWatched: false },
		];

		it('is shown above the posts', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			getStoryTray.mockResolvedValue(trayEntries);
			renderFeed();

			const tray = await screen.findByRole('region', { name: 'Stories' });
			const firstPost = (await screen.findAllByRole('article'))[0];

			expect(tray.compareDocumentPosition(firstPost) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		});

		it('loads the tray with the token', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			await screen.findAllByRole('article');

			await waitFor(() => expect(getStoryTray).toHaveBeenCalledWith({ jwtToken: 'token123' }));
		});

		it('shows the people with an active story', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			getStoryTray.mockResolvedValue(trayEntries);
			renderFeed();

			expect(await screen.findByRole('button', { name: "View alice's story" })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'View your story' })).toBeInTheDocument();
		});

		it('loads in parallel with the feed: the tray is requested before the posts have arrived', async () => {
			getFollowedUsersPosts.mockReturnValue(new Promise(() => {}));
			getStoryTray.mockResolvedValue(trayEntries);
			renderFeed();

			expect(getStoryTray).toHaveBeenCalledTimes(1);
			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
		});

		it('shows straight away, while the posts are still loading', async () => {
			getFollowedUsersPosts.mockReturnValue(new Promise(() => {}));
			getStoryTray.mockResolvedValue(trayEntries);
			renderFeed();

			expect(await screen.findByRole('button', { name: "View alice's story" })).toBeInTheDocument();
			expect(screen.queryByRole('article')).not.toBeInTheDocument();
		});

		it('has a spinner under it, not a full-page one, while the posts load', async () => {
			getFollowedUsersPosts.mockReturnValue(new Promise(() => {}));
			getStoryTray.mockResolvedValue(trayEntries);
			renderFeed();

			const tray = await screen.findByRole('region', { name: 'Stories' });
			const spinner = document.querySelector('.loading-spinner');

			expect(spinner).toBeInTheDocument();
			expect(document.querySelector('.spinner-container-full-page')).not.toBeInTheDocument();
			expect(tray.compareDocumentPosition(spinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		});

		it('removes the spinner and keeps the tray once the posts arrive', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			getStoryTray.mockResolvedValue(trayEntries);
			renderFeed();

			await screen.findAllByRole('article');

			expect(document.querySelector('.loading-spinner')).not.toBeInTheDocument();
			expect(screen.getByRole('region', { name: 'Stories' })).toBeInTheDocument();
		});

		it('does not show the empty message while the posts are still loading', async () => {
			getFollowedUsersPosts.mockReturnValue(new Promise(() => {}));
			renderFeed();

			await screen.findByRole('region', { name: 'Stories' });

			expect(screen.queryByText('Your feed is empty')).not.toBeInTheDocument();
		});

		it('makes one tray request across a feed load error and its retry, and shows the tray again after it', async () => {
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(feedPosts);
			getStoryTray.mockResolvedValue(trayEntries);
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			expect(getStoryTray).toHaveBeenCalledTimes(1);
			expect(await screen.findByRole('button', { name: "View alice's story" })).toBeInTheDocument();
		});

		it('is shown on the empty feed too, so someone who follows nobody can post a story', async () => {
			getFollowedUsersPosts.mockResolvedValue([]);
			renderFeed();

			expect(await screen.findByRole('heading', { name: 'Your feed is empty' })).toBeInTheDocument();
			expect(await screen.findByRole('button', { name: 'Add to your story' })).toBeInTheDocument();
		});

		it('lets someone with an empty feed open the Create popup on the Story tab', async () => {
			getFollowedUsersPosts.mockResolvedValue([]);
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Add to your story' }));

			expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
		});

		it('is not shown while the feed fails to load', async () => {
			getFollowedUsersPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			await screen.findByText("Couldn't load your feed");

			expect(screen.queryByRole('region', { name: 'Stories' })).not.toBeInTheDocument();
		});

		it('leaves the posts and shows no error when the tray fails to load', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			getStoryTray.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			await waitFor(() => expect(getStoryTray).toHaveBeenCalled());

			expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
			expect(screen.queryByRole('button', { name: 'Add to your story' })).not.toBeInTheDocument();
		});
	});

	describe('loading the feed', () => {
		it('shows a spinner while the posts load', async () => {
			const request = buildDeferred();

			getFollowedUsersPosts.mockReturnValue(request.promise);
			renderFeed();

			expect(document.querySelector('.loading-spinner')).toBeInTheDocument();

			request.resolve(feedPosts);
			await screen.findAllByRole('article');
			expect(document.querySelector('.loading-spinner')).not.toBeInTheDocument();
		});

		it('fetches the posts of the followed users with the token', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			await screen.findAllByRole('article');
			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
			expect(getFollowedUsersPosts).toHaveBeenCalledWith({ jwtToken: 'token123' });
		});

		it('renders every post it received', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			expect(await screen.findAllByRole('article')).toHaveLength(3);
		});

		it('renders the posts in the order the server sent them, newest first', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			await screen.findAllByRole('article');
			expect(getRenderedPostIds()).toEqual(['post3', 'post2', 'post1']);
		});

		it('shows the author of each post, linked to their profile', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			const articles = await screen.findAllByRole('article');

			expect(within(articles[1]).getByRole('link', { name: 'alice' })).toHaveAttribute('href', '/user/author-alice');
		});

		it('shows the posts it fetched, not a list kept on the logged-in user', async () => {
			getFollowedUsersPosts.mockResolvedValue([buildPost('fresh', 'janedoe')]);
			renderFeed({ user: { ...loggedInUser, followedUsersPosts: [buildPost('stale', 'old')] } });

			await screen.findAllByRole('article');
			expect(getRenderedPostIds()).toEqual(['fresh']);
		});

		it('does not show the empty message or the load error when there are posts', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			await screen.findAllByRole('article');
			expect(screen.queryByText('Your feed is empty')).not.toBeInTheDocument();
			expect(screen.queryByText("Couldn't load your feed")).not.toBeInTheDocument();
		});
	});

	describe('an empty feed', () => {
		beforeEach(() => {
			getFollowedUsersPosts.mockResolvedValue([]);
		});

		it('shows "Your feed is empty"', async () => {
			renderFeed();

			expect(await screen.findByRole('heading', { name: 'Your feed is empty' })).toBeInTheDocument();
		});

		it('shows "Follow people to see their posts here"', async () => {
			renderFeed();

			expect(await screen.findByText('Follow people to see their posts here')).toBeInTheDocument();
		});

		it('shows no posts', async () => {
			renderFeed();

			await screen.findByText('Your feed is empty');
			expect(screen.queryAllByRole('article')).toHaveLength(0);
		});

		it('shows no load error and no toast', async () => {
			renderFeed();

			await screen.findByText('Your feed is empty');
			expect(screen.queryByText("Couldn't load your feed")).not.toBeInTheDocument();
			expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
		});
	});

	describe('when the feed fails to load', () => {
		it.each([
			['a server failure', { code: 'INTERNAL_ERROR', status: 500 }],
			['a network failure', { code: 'INTERNAL_ERROR', status: 0 }],
			['an unrecognised error', new Error('boom')],
		])('shows the full-page feed load error for %s', async (_name, error) => {
			getFollowedUsersPosts.mockRejectedValue(error);
			renderFeed();

			expect(await screen.findByRole('heading', { name: "Couldn't load your feed" })).toBeInTheDocument();
			expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
		});

		it('does not use the profile load error copy', async () => {
			getFollowedUsersPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			await screen.findByText("Couldn't load your feed");
			expect(screen.queryByText("Couldn't load this profile")).not.toBeInTheDocument();
		});

		it('shows no empty message and no toast alongside the error', async () => {
			getFollowedUsersPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			await screen.findByText("Couldn't load your feed");
			expect(screen.queryByText('Your feed is empty')).not.toBeInTheDocument();
			expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
		});

		it('fetches the feed again when Retry is clicked and shows the posts once the request succeeds', async () => {
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(feedPosts);
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2);
			expect(screen.queryByText("Couldn't load your feed")).not.toBeInTheDocument();
		});

		it('shows the empty message when the retry finds no posts', async () => {
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce([]);
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			expect(await screen.findByText('Your feed is empty')).toBeInTheDocument();
		});

		it('keeps showing the error when Retry fails again', async () => {
			getFollowedUsersPosts.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			await waitFor(() => expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2));
			expect(await screen.findByRole('button', { name: 'Retry' })).toBeEnabled();
			expect(screen.getByRole('heading', { name: "Couldn't load your feed" })).toBeInTheDocument();
		});

		it('disables Retry while the retry request is in flight', async () => {
			const retryRequest = buildDeferred();

			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockReturnValueOnce(retryRequest.promise);
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled());

			retryRequest.resolve(feedPosts);
			expect(await screen.findAllByRole('article')).toHaveLength(3);
		});

		it('ends the session instead of showing the load error for UNAUTHENTICATED', async () => {
			getFollowedUsersPosts.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderFeed();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByText("Couldn't load your feed")).not.toBeInTheDocument();
		});
	});

	describe('interacting with posts', () => {
		it('shows the new like count on the post that was liked', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			likeUserPost.mockResolvedValue({ _id: 'post2', likes: ['user1'] });
			renderFeed();

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: 'Like post' }));

			expect(await within(articles[1]).findByText('1 like')).toBeInTheDocument();
		});

		it('leaves the other posts unchanged when one is liked', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			likeUserPost.mockResolvedValue({ _id: 'post2', likes: ['user1'] });
			renderFeed();

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: 'Like post' }));
			await within(articles[1]).findByText('1 like');

			expect(within(articles[0]).getByText('0 likes')).toBeInTheDocument();
			expect(within(articles[2]).getByText('0 likes')).toBeInTheDocument();
		});

		it('keeps the posts in the same order after a like', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			likeUserPost.mockResolvedValue({ _id: 'post1', likes: ['user1'] });
			renderFeed();

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[2]).getByRole('button', { name: 'Like post' }));
			await within(articles[2]).findByText('1 like');

			expect(getRenderedPostIds()).toEqual(['post3', 'post2', 'post1']);
		});

		it('shows the new comment count and preview on the post that got a comment', async () => {
			const added = {
				_id: 'c9',
				text: 'Nice shot',
				likes: [],
				createdAt: '2024-06-01T00:00:00.000Z',
				userId: { _id: 'user1', username: 'johndoe' },
			};

			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			addComment.mockResolvedValue(added);
			renderFeed();

			const articles = await screen.findAllByRole('article');

			userEvent.type(within(articles[0]).getByPlaceholderText('Add a comment...'), 'Nice shot');
			userEvent.click(within(articles[0]).getByRole('button', { name: 'Post' }));

			expect(await within(articles[0]).findByRole('button', { name: '1 comment' })).toBeInTheDocument();
			expect(within(articles[0]).getByText('Nice shot')).toBeInTheDocument();
			expect(within(articles[1]).getByRole('button', { name: '0 comments' })).toBeInTheDocument();
		});

		it('shows the like failure as a toast without changing the post', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			likeUserPost.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[0]).getByRole('button', { name: 'Like post' }));

			expect(await screen.findByText("Couldn't update your like. Try again.")).toBeInTheDocument();
			expect(within(articles[0]).getByText('0 likes')).toBeInTheDocument();
		});

		it('shows no post actions on the feed posts', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			await screen.findAllByRole('article');
			expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
		});
	});

	describe('suggestions on desktop', () => {
		const sidebarSuggestions = ['s1', 's2', 's3', 's4', 's5'].map((id) => buildSuggestion(id));

		beforeEach(() => {
			setViewport(true);
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			mockSuggestionsByPlacement({ sidebar: { suggestions: sidebarSuggestions, reserve: [], isCarouselDismissed: false } });
		});

		it('shows the suggestions sidebar beside the posts', async () => {
			renderFeed();

			const sidebar = await screen.findByRole('complementary', { name: 'Suggested for you' });

			expect(within(sidebar).getAllByRole('button', { name: /^Follow / })).toHaveLength(5);
			expect(await screen.findAllByRole('article')).toHaveLength(3);
		});

		it('requests only the sidebar placement', async () => {
			renderFeed();

			await screen.findByRole('complementary');

			expect(getRequestedPlacements()).toEqual(['sidebar']);
		});

		it('shows no carousel', async () => {
			renderFeed();

			await screen.findByRole('complementary');

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
		});

		it('keeps the sidebar out of the way while the posts are loading', async () => {
			getFollowedUsersPosts.mockReturnValue(new Promise(() => {}));
			renderFeed();

			await screen.findByRole('region', { name: 'Stories' });

			expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
			expect(getSuggestions).not.toHaveBeenCalled();
		});

		it('shows no sidebar when it has no suggestions', async () => {
			mockSuggestionsByPlacement({});
			renderFeed();

			await screen.findAllByRole('article');
			await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

			expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
		});

		it('shows no sidebar and no error when the suggestions fail to load', async () => {
			getSuggestions.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

			expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
			expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
		});

		it('removes a followed user from the sidebar without reloading the feed', async () => {
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-s1' }));

			await waitFor(() => expect(screen.queryByRole('button', { name: 'Follow name-s1' })).not.toBeInTheDocument());
			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
			expect(followUser).toHaveBeenCalledWith({ userId: 'user1', jwtToken: 'token123', userIdToFollow: 's1' });
		});
	});

	describe('suggestions on tablet and mobile', () => {
		const carouselSuggestions = ['c1', 'c2', 'c3'].map((id) => buildSuggestion(id));
		const sixPosts = ['post6', 'post5', 'post4', 'post3', 'post2', 'post1'].map((id) => buildPost(id, 'janedoe'));

		const getFeedChildKinds = () =>
			Array.from(document.querySelector('.feed-posts').children).map((child) => (child.tagName === 'ARTICLE' ? child.id : 'carousel'));

		beforeEach(() => {
			mockSuggestionsByPlacement({ carousel: { suggestions: carouselSuggestions, reserve: [], isCarouselDismissed: false } });
		});

		it('inserts the carousel after the 5th post', async () => {
			getFollowedUsersPosts.mockResolvedValue(sixPosts);
			renderFeed();

			await screen.findByRole('region', { name: 'Suggested for you' });

			expect(getFeedChildKinds()).toEqual(['post6', 'post5', 'post4', 'post3', 'post2', 'carousel', 'post1']);
		});

		it('inserts the carousel after the last post when there are fewer than 5', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			await screen.findByRole('region', { name: 'Suggested for you' });

			expect(getFeedChildKinds()).toEqual(['post3', 'post2', 'post1', 'carousel']);
		});

		it('inserts the carousel after the 5th post when there are exactly 5', async () => {
			getFollowedUsersPosts.mockResolvedValue(sixPosts.slice(0, 5));
			renderFeed();

			await screen.findByRole('region', { name: 'Suggested for you' });

			expect(getFeedChildKinds()).toEqual(['post6', 'post5', 'post4', 'post3', 'post2', 'carousel']);
		});

		it('shows the carousel once only', async () => {
			getFollowedUsersPosts.mockResolvedValue(sixPosts);
			renderFeed();

			await screen.findByRole('region', { name: 'Suggested for you' });

			expect(screen.getAllByRole('region', { name: 'Suggested for you' })).toHaveLength(1);
		});

		it('requests only the carousel placement and shows no sidebar', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			await screen.findByRole('region', { name: 'Suggested for you' });

			expect(getRequestedPlacements()).toEqual(['carousel']);
			expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
		});

		it('is hidden when there are no suggestions', async () => {
			mockSuggestionsByPlacement({});
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			await screen.findAllByRole('article');
			await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
			expect(getRenderedPostIds()).toEqual(['post3', 'post2', 'post1']);
		});

		it('is hidden when it was dismissed on the server', async () => {
			mockSuggestionsByPlacement({ carousel: { suggestions: [], reserve: [], isCarouselDismissed: true } });
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			await screen.findAllByRole('article');
			await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
		});

		it('is hidden, with no error and no toast, when the suggestions fail to load', async () => {
			getSuggestions.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
			expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
		});

		it('is dismissed with the ✕, which tells the server', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Dismiss suggestions' }));

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
			await waitFor(() => expect(dismissSuggestionsCarousel).toHaveBeenCalledWith({ jwtToken: 'token123' }));
			expect(getRenderedPostIds()).toEqual(['post3', 'post2', 'post1']);
		});

		it('removes a followed card without reloading the feed', async () => {
			getFollowedUsersPosts.mockResolvedValue(feedPosts);
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-c1' }));

			await waitFor(() => expect(screen.queryByRole('button', { name: 'Follow name-c1' })).not.toBeInTheDocument());
			expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
		});

		it('shows the posts and the carousel after a failed first load is retried', async () => {
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(feedPosts);
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			expect(await screen.findByRole('region', { name: 'Suggested for you' })).toBeInTheDocument();
			expect(getFeedChildKinds()).toEqual(['post3', 'post2', 'post1', 'carousel']);
		});
	});

	describe('the empty feed with suggestions', () => {
		const listSuggestions = [
			...['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => buildSuggestion(id, 'popular')),
			...['n1', 'n2', 'n3'].map((id) => buildSuggestion(id, 'new')),
		];

		const getSuggestionsList = () => screen.findByRole('region', { name: 'Suggested for you' });

		beforeEach(() => {
			getFollowedUsersPosts.mockResolvedValue([]);
			mockSuggestionsByPlacement({ 'empty-feed': { suggestions: listSuggestions, reserve: [], isCarouselDismissed: false } });
		});

		it('shows the message, the stories tray and the list of 8', async () => {
			renderFeed();

			expect(await screen.findByRole('heading', { name: 'Your feed is empty' })).toBeInTheDocument();
			expect(await screen.findByRole('button', { name: 'Add to your story' })).toBeInTheDocument();

			const list = await getSuggestionsList();

			expect(within(list).getAllByRole('button')).toHaveLength(8);
		});

		it('shows only "Your story" in the tray when following nobody', async () => {
			getStoryTray.mockResolvedValue([{ user: { _id: 'user1', username: 'johndoe' }, isOwn: true, isWatched: true }]);
			renderFeed({ user: { ...loggedInUser, following: [] } });

			await screen.findByRole('button', { name: 'View your story' });

			const tray = screen.getByRole('region', { name: 'Stories' });

			expect(Array.from(tray.querySelectorAll('.story-circle-label')).map((label) => label.textContent)).toEqual(['Your story']);
		});

		it('shows the list under the message', async () => {
			renderFeed();

			const heading = await screen.findByRole('heading', { name: 'Your feed is empty' });
			const list = await getSuggestionsList();

			expect(heading.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		});

		it('shows it whenever there are no posts, even for someone who follows people who have not posted', async () => {
			renderFeed({ user: { ...loggedInUser, following: ['user2', 'user3'] } });

			expect(await screen.findByRole('heading', { name: 'Your feed is empty' })).toBeInTheDocument();
			expect(await getSuggestionsList()).toBeInTheDocument();
		});

		it('requests only the empty-feed placement', async () => {
			renderFeed();

			await getSuggestionsList();

			expect(getRequestedPlacements()).toEqual(['empty-feed']);
		});

		it.each([
			['desktop', true],
			['tablet and mobile', false],
		])('shows no sidebar and no carousel on %s', async (_name, isDesktop) => {
			setViewport(isDesktop);
			renderFeed();

			await getSuggestionsList();

			expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Dismiss suggestions' })).not.toBeInTheDocument();
			expect(screen.getAllByRole('region', { name: 'Suggested for you' })).toHaveLength(1);
		});

		it('shows only the message when the list fails to load', async () => {
			getSuggestions.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderFeed();

			expect(await screen.findByRole('heading', { name: 'Your feed is empty' })).toBeInTheDocument();
			await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
			expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
			expect(screen.queryByText("Couldn't load your feed")).not.toBeInTheDocument();
		});

		it('shows only the message when there is nobody to suggest', async () => {
			mockSuggestionsByPlacement({});
			renderFeed();

			expect(await screen.findByRole('heading', { name: 'Your feed is empty' })).toBeInTheDocument();
			await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
		});

		it('shows the list after a failed first load is retried and finds no posts', async () => {
			getFollowedUsersPosts.mockReset();
			getFollowedUsersPosts.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce([]);
			renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			expect(await getSuggestionsList()).toBeInTheDocument();
		});

		describe('following from the list', () => {
			const followedPosts = [buildPost('fresh1', 'name-p1')];

			it('turns the button into Unfollow and loads the followed user posts below the list', async () => {
				getFollowedUsersPosts.mockResolvedValueOnce([]).mockResolvedValueOnce(followedPosts);
				renderFeed();

				userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

				expect(await screen.findByRole('button', { name: 'Unfollow name-p1' })).toBeInTheDocument();

				const list = await getSuggestionsList();
				const posts = await screen.findAllByRole('article');

				expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2);
				expect(posts).toHaveLength(1);
				expect(list.compareDocumentPosition(posts[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
			});

			it('keeps the message and the full list of 8 on screen after posts appear', async () => {
				getFollowedUsersPosts.mockResolvedValueOnce([]).mockResolvedValueOnce(followedPosts);
				renderFeed();

				userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
				await screen.findAllByRole('article');

				expect(screen.getByRole('heading', { name: 'Your feed is empty' })).toBeInTheDocument();
				expect(within(await getSuggestionsList()).getAllByRole('button')).toHaveLength(8);
			});

			it('shows no sidebar or carousel once the posts appear', async () => {
				getFollowedUsersPosts.mockResolvedValueOnce([]).mockResolvedValueOnce(followedPosts);
				renderFeed();

				userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
				await screen.findAllByRole('article');

				expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
				expect(screen.getAllByRole('region', { name: 'Suggested for you' })).toHaveLength(1);
				expect(getRequestedPlacements()).toEqual(['empty-feed']);
			});

			it('reloads the posts quietly: no spinner and no flash of the list while they load', async () => {
				const reload = buildDeferred();

				getFollowedUsersPosts.mockResolvedValueOnce([]).mockReturnValueOnce(reload.promise);
				renderFeed();

				userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
				await waitFor(() => expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2));

				expect(document.querySelector('.loading-spinner')).not.toBeInTheDocument();
				expect(screen.getByRole('button', { name: 'Unfollow name-p1' })).toBeInTheDocument();

				reload.resolve(followedPosts);
				await screen.findAllByRole('article');
			});

			it('keeps the list and shows no error when the quiet reload fails', async () => {
				getFollowedUsersPosts.mockResolvedValueOnce([]).mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });
				renderFeed();

				userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
				await waitFor(() => expect(getFollowedUsersPosts).toHaveBeenCalledTimes(2));

				expect(screen.queryByText("Couldn't load your feed")).not.toBeInTheDocument();
				expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
				expect(screen.getByRole('button', { name: 'Unfollow name-p1' })).toBeInTheDocument();
				expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
			});

			it('ends the session when the quiet reload fails with UNAUTHENTICATED', async () => {
				getFollowedUsersPosts.mockResolvedValueOnce([]).mockRejectedValueOnce({ code: 'UNAUTHENTICATED', status: 401 });
				const { endSession } = renderFeed();

				userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

				await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			});

			it('goes back to Follow with the follow toast when the follow fails, and loads no posts', async () => {
				followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
				renderFeed();

				userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

				expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
				expect(screen.getByRole('button', { name: 'Follow name-p1' })).toBeInTheDocument();
				expect(getFollowedUsersPosts).toHaveBeenCalledTimes(1);
			});
		});

		describe('unfollowing from the list', () => {
			const followedPosts = [buildPost('fresh1', 'name-p1')];

			const followFirstUser = async () => {
				getFollowedUsersPosts.mockResolvedValueOnce([]).mockResolvedValueOnce(followedPosts);
				const rendered = renderFeed();

				userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
				await screen.findAllByRole('article');

				return rendered;
			};

			it('turns the button back into Follow and sends the unfollow request', async () => {
				await followFirstUser();
				getFollowedUsersPosts.mockResolvedValueOnce([]);

				userEvent.click(screen.getByRole('button', { name: 'Unfollow name-p1' }));

				expect(await screen.findByRole('button', { name: 'Follow name-p1' })).toBeInTheDocument();
				expect(unfollowUser).toHaveBeenCalledWith({ userId: 'user1', jwtToken: 'token123', userIdToUnfollow: 'p1' });
			});

			it('removes their posts and keeps the message and the list', async () => {
				await followFirstUser();
				getFollowedUsersPosts.mockResolvedValueOnce([]);

				userEvent.click(screen.getByRole('button', { name: 'Unfollow name-p1' }));

				await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument());
				expect(screen.getByRole('heading', { name: 'Your feed is empty' })).toBeInTheDocument();
				expect(within(await getSuggestionsList()).getAllByRole('button')).toHaveLength(8);
			});

			it('goes back to Unfollow with the unfollow toast when the unfollow fails, keeping their posts', async () => {
				await followFirstUser();
				unfollowUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

				userEvent.click(screen.getByRole('button', { name: 'Unfollow name-p1' }));

				expect(await screen.findByText("Couldn't unfollow this user. Try again.")).toBeInTheDocument();
				expect(screen.getByRole('button', { name: 'Unfollow name-p1' })).toBeInTheDocument();
				expect(screen.getAllByRole('article')).toHaveLength(1);
			});
		});

		it('shows the normal feed on the next visit', async () => {
			getFollowedUsersPosts.mockResolvedValueOnce([]).mockResolvedValueOnce([buildPost('fresh1', 'name-p1')]);
			const { unmount } = renderFeed();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
			await screen.findAllByRole('article');
			unmount();

			getFollowedUsersPosts.mockResolvedValue([buildPost('fresh1', 'name-p1')]);
			mockSuggestionsByPlacement({});
			renderFeed();

			expect(await screen.findAllByRole('article')).toHaveLength(1);
			expect(screen.queryByText('Your feed is empty')).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Unfollow name-p1' })).not.toBeInTheDocument();
		});
	});
});
