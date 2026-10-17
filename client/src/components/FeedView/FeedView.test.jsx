import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getFollowedUsersPosts, likeUserPost } from '../../services/userPostService';
import { addComment } from '../../services/commentService';

import ToastProvider from '../ToastProvider/ToastProvider';

import FeedView from './FeedView';

jest.mock('../../services/userPostService');
jest.mock('../../services/commentService');

const loggedInUser = { _id: 'user1', username: 'johndoe', following: ['user2', 'user3'] };

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
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser: user, endSession }}>
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
	beforeEach(() => {
		jest.resetAllMocks();
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
});
