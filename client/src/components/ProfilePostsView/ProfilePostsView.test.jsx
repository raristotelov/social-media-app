import '@testing-library/jest-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getUsersProfileData } from '../../services/userService';
import { updateUserPostCaption, deleteUserPost, likeUserPost } from '../../services/userPostService';
import { getComments, addComment, likeComment } from '../../services/commentService';

import ToastProvider from '../ToastProvider/ToastProvider';
import ProfileLayout from '../ProfileLayout/ProfileLayout';
import ProfileView from '../ProfileView/ProfileView';

import ProfilePostsView from './ProfilePostsView';

jest.mock('../../services/userService');
jest.mock('../../services/userPostService');
jest.mock('../../services/commentService');

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

const buildPost = (id, overrides = {}) => ({
	_id: id,
	imageIdentifier: `img-${id}`,
	imageUrl: `https://example.com/${id}.jpg`,
	caption: `Caption of ${id}`,
	likes: [],
	commentsCount: 0,
	previewComments: [],
	...overrides,
});

const buildProfile = (overrides = {}) => ({
	_id: 'user2',
	username: 'janedoe',
	posts: [buildPost('post3'), buildPost('post2'), buildPost('post1')],
	followers: [],
	following: [],
	...overrides,
});

const ownUser = { _id: 'user2', username: 'janedoe', following: [] };
const otherUser = { _id: 'user1', username: 'johndoe', following: [] };

const renderProfileRoutes = ({ entries = ['/user/user2/posts#post2'], initialIndex, user = otherUser, endSession = jest.fn() } = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: user ? 'token123' : null, loggedInUser: user, updateLoggedInUser: jest.fn(), endSession }}>
			<ToastProvider>
				<MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
					<Routes>
						<Route path='/user/:userId' element={<ProfileLayout />}>
							<Route index element={<ProfileView />} />

							<Route path='posts' element={<ProfilePostsView />} />
						</Route>

						<Route path='/log-in' element={<LoginProbe />} />

						<Route path='/popular-posts' element={<p>Popular posts page</p>} />
					</Routes>

					<LocationProbe />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, endSession };
};

const getRenderedPostIds = () => Array.from(document.querySelectorAll('article.user-post')).map((article) => article.id);

const getTileStatTexts = (tileIndex) =>
	Array.from(document.querySelectorAll('.profile-post')[tileIndex].querySelectorAll('.profile-post-stat')).map((stat) => stat.textContent);

describe('ProfilePostsView', () => {
	let mockScrollIntoView;

	beforeEach(() => {
		jest.resetAllMocks();
		mockScrollIntoView = jest.fn();
		window.HTMLElement.prototype.scrollIntoView = mockScrollIntoView;
		getUsersProfileData.mockResolvedValue([buildProfile()]);
	});

	afterEach(() => {
		delete window.HTMLElement.prototype.scrollIntoView;
	});

	describe('showing the posts of the profile', () => {
		it('shows every post of the profile', async () => {
			renderProfileRoutes();

			expect(await screen.findAllByRole('article')).toHaveLength(3);
		});

		it('shows the posts in the order the profile returned them, newest first', async () => {
			renderProfileRoutes();

			await screen.findAllByRole('article');
			expect(getRenderedPostIds()).toEqual(['post3', 'post2', 'post1']);
		});

		it("shows the profile's username on every card header, linked to the profile", async () => {
			renderProfileRoutes();

			const articles = await screen.findAllByRole('article');

			articles.forEach((article) => {
				expect(within(article).getByRole('link', { name: 'janedoe' })).toHaveAttribute('href', '/user/user2');
			});
		});

		it("shows the profile's picture on the card header", async () => {
			getUsersProfileData.mockResolvedValue([buildProfile({ profilePicture: { imageUrl: 'https://example.com/jane.jpg' } })]);
			renderProfileRoutes();

			const articles = await screen.findAllByRole('article');

			expect(articles[0].querySelector('.user-post-avatar')).toHaveAttribute('src', 'https://example.com/jane.jpg');
		});

		it('shows the Posts bar with the username beneath "Posts"', async () => {
			renderProfileRoutes();

			await screen.findAllByRole('article');
			expect(screen.getByRole('heading', { name: 'Posts' })).toBeInTheDocument();
			expect(document.querySelector('.posts-bar-username')).toHaveTextContent('janedoe');
		});

		it('shows the posts of that profile, not the posts of the feed', async () => {
			renderProfileRoutes();

			await screen.findAllByRole('article');
			expect(screen.queryByText('Your feed is empty')).not.toBeInTheDocument();
		});
	});

	describe('loading through the parent route', () => {
		it('loads the profile once for a link opened straight on the posts view', async () => {
			renderProfileRoutes();

			await screen.findAllByRole('article');
			expect(getUsersProfileData).toHaveBeenCalledTimes(1);
			expect(getUsersProfileData).toHaveBeenCalledWith({ userIds: ['user2'], jwtToken: 'token123' });
		});

		it('opens at the post named by the hash', async () => {
			renderProfileRoutes({ entries: ['/user/user2/posts#post2'] });

			await screen.findAllByRole('article');
			expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
			expect(mockScrollIntoView.mock.instances[0].id).toBe('post2');
		});

		it('scrolls nothing into view when the hash names no post', async () => {
			renderProfileRoutes({ entries: ['/user/user2/posts#gone'] });

			await screen.findAllByRole('article');
			expect(mockScrollIntoView).not.toHaveBeenCalled();
		});

		it('shows the posts newer than the opened post above it and the older ones below it', async () => {
			renderProfileRoutes({ entries: ['/user/user2/posts#post2'] });

			await screen.findAllByRole('article');
			expect(getRenderedPostIds().indexOf('post3')).toBeLessThan(getRenderedPostIds().indexOf('post2'));
			expect(getRenderedPostIds().indexOf('post1')).toBeGreaterThan(getRenderedPostIds().indexOf('post2'));
		});

		it('shows the profile load error when the profile fails to load', async () => {
			getUsersProfileData.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderProfileRoutes();

			expect(await screen.findByRole('heading', { name: "Couldn't load this profile" })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
			expect(screen.queryByRole('heading', { name: 'Posts' })).not.toBeInTheDocument();
		});

		it('shows the posts after Retry succeeds', async () => {
			getUsersProfileData.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce([buildProfile()]);
			renderProfileRoutes();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			expect(await screen.findAllByRole('article')).toHaveLength(3);
		});

		it('shows a blank page area when the user does not exist', async () => {
			getUsersProfileData.mockRejectedValue({ code: 'USER_NOT_FOUND', status: 404 });
			renderProfileRoutes();

			await waitFor(() => expect(getUsersProfileData).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(document.querySelector('.profile-posts-view')).not.toBeInTheDocument());
			expect(screen.queryByRole('heading', { name: "Couldn't load this profile" })).not.toBeInTheDocument();
		});

		it('ends the session when the profile load fails with UNAUTHENTICATED', async () => {
			getUsersProfileData.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderProfileRoutes();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});
	});

	describe('switching between the grid and the posts view', () => {
		it('opens the posts view at the clicked post from the grid', async () => {
			renderProfileRoutes({ entries: ['/user/user2'] });

			await screen.findByText('janedoe');
			userEvent.click(document.querySelectorAll('.profile-post-link')[1]);

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			expect(screen.getByTestId('path')).toHaveTextContent('/user/user2/posts');
			expect(screen.getByTestId('hash')).toHaveTextContent('#post2');
			expect(mockScrollIntoView.mock.instances[0].id).toBe('post2');
		});

		it('does not refetch the profile when going from the grid to the posts view', async () => {
			renderProfileRoutes({ entries: ['/user/user2'] });

			await screen.findByText('janedoe');
			userEvent.click(document.querySelectorAll('.profile-post-link')[0]);
			await screen.findAllByRole('article');

			expect(getUsersProfileData).toHaveBeenCalledTimes(1);
		});

		it('does not refetch the profile when going back from the posts view to the grid', async () => {
			renderProfileRoutes({ entries: ['/user/user2'] });

			await screen.findByText('janedoe');
			userEvent.click(document.querySelectorAll('.profile-post-link')[0]);
			await screen.findAllByRole('article');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/user\/user2$/));
			expect(screen.getAllByAltText('user-post')).toHaveLength(3);
			expect(getUsersProfileData).toHaveBeenCalledTimes(1);
		});

		it('shows the grid newest first, in the order the profile returned the posts', async () => {
			renderProfileRoutes({ entries: ['/user/user2'] });

			await screen.findByText('janedoe');
			expect(screen.getAllByAltText('user-post').map((image) => image.getAttribute('src'))).toEqual([
				'https://example.com/post3.jpg',
				'https://example.com/post2.jpg',
				'https://example.com/post1.jpg',
			]);
		});

		it('shows a like given in the posts view on the grid tile', async () => {
			likeUserPost.mockResolvedValue({ _id: 'post3', likes: ['user1'] });
			renderProfileRoutes({ entries: ['/user/user2'] });

			await screen.findByText('janedoe');
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
			renderProfileRoutes({ entries: ['/user/user2'] });

			await screen.findByText('janedoe');
			userEvent.click(document.querySelectorAll('.profile-post-link')[0]);
			const articles = await screen.findAllByRole('article');

			userEvent.type(within(articles[0]).getByPlaceholderText('Add a comment...'), 'Nice shot');
			userEvent.click(within(articles[0]).getByRole('button', { name: 'Post' }));
			await within(articles[0]).findByRole('button', { name: '1 comment' });
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await screen.findAllByAltText('user-post');
			expect(getTileStatTexts(0)[1]).toBe('1');
		});
	});

	describe('the back chevron', () => {
		it('goes back in history when the posts view was opened from another page', async () => {
			renderProfileRoutes({ entries: ['/popular-posts', '/user/user2/posts#post1'], initialIndex: 1 });

			await screen.findAllByRole('article');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			expect(await screen.findByText('Popular posts page')).toBeInTheDocument();
			expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts');
		});

		it('goes back to the profile grid when it was opened from the grid', async () => {
			renderProfileRoutes({ entries: ['/user/user2', '/user/user2/posts#post1'], initialIndex: 1 });

			await screen.findAllByRole('article');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/user\/user2$/));
			expect(screen.getAllByAltText('user-post')).toHaveLength(3);
		});

		it('goes to the profile grid when the posts view is the first history entry', async () => {
			renderProfileRoutes({ entries: ['/user/user2/posts#post2'] });

			await screen.findAllByRole('article');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/user\/user2$/));
			expect(screen.getAllByAltText('user-post')).toHaveLength(3);
		});

		it('replaces the first history entry instead of adding one when going to the grid', async () => {
			renderProfileRoutes({ entries: ['/user/user2/posts#post2'] });

			await screen.findAllByRole('article');
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			await waitFor(() => expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE'));
		});
	});

	describe('post actions on your own profile', () => {
		it('shows the three-dots actions on every post of your own profile', async () => {
			renderProfileRoutes({ user: ownUser });

			await screen.findAllByRole('article');
			expect(screen.getAllByRole('button', { name: 'Post actions' })).toHaveLength(3);
		});

		it("shows no post actions on someone else's posts", async () => {
			renderProfileRoutes({ user: otherUser });

			await screen.findAllByRole('article');
			expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
		});

		it('shows no post actions to a guest', async () => {
			renderProfileRoutes({ user: null });

			await screen.findAllByRole('article');
			expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
		});

		it('opens the Edit and Delete menu from a post header', async () => {
			renderProfileRoutes({ user: ownUser });

			await screen.findAllByRole('article');
			userEvent.click(screen.getAllByRole('button', { name: 'Post actions' })[0]);

			expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		});

		it('opens the Edit Picture popup prefilled with the caption of that post', async () => {
			renderProfileRoutes({ user: ownUser });

			await screen.findAllByRole('article');
			userEvent.click(screen.getAllByRole('button', { name: 'Post actions' })[1]);
			userEvent.click(screen.getByRole('button', { name: 'Edit' }));

			expect(screen.getByRole('heading', { name: 'Edit Picture' })).toBeInTheDocument();
			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('Caption of post2');
		});

		it('shows the edited caption on the card after saving', async () => {
			updateUserPostCaption.mockResolvedValue({ _id: 'post2', caption: 'Edited caption' });
			renderProfileRoutes({ user: ownUser });

			await screen.findAllByRole('article');
			userEvent.click(screen.getAllByRole('button', { name: 'Post actions' })[1]);
			userEvent.click(screen.getByRole('button', { name: 'Edit' }));
			userEvent.clear(screen.getByPlaceholderText('Write a caption...'));
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Edited caption');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() =>
				expect(updateUserPostCaption).toHaveBeenCalledWith({ userPostId: 'post2', caption: 'Edited caption', jwtToken: 'token123' }),
			);
			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Picture' })).not.toBeInTheDocument());
			expect(document.getElementById('post2').querySelector('.post-caption')).toHaveTextContent('Edited caption');
		});

		it('keeps the edited caption when going back to the grid and into the posts view again', async () => {
			updateUserPostCaption.mockResolvedValue({ _id: 'post3', caption: 'Edited caption' });
			renderProfileRoutes({ user: ownUser, entries: ['/user/user2', '/user/user2/posts#post3'], initialIndex: 1 });

			await screen.findAllByRole('article');
			userEvent.click(screen.getAllByRole('button', { name: 'Post actions' })[0]);
			userEvent.click(screen.getByRole('button', { name: 'Edit' }));
			userEvent.clear(screen.getByPlaceholderText('Write a caption...'));
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Edited caption');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));
			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Picture' })).not.toBeInTheDocument());

			userEvent.click(screen.getByRole('button', { name: 'Back' }));
			await screen.findAllByAltText('user-post');
			userEvent.click(document.querySelectorAll('.profile-post-link')[0]);
			await screen.findAllByRole('article');

			expect(document.getElementById('post3').querySelector('.post-caption')).toHaveTextContent('Edited caption');
			expect(getUsersProfileData).toHaveBeenCalledTimes(1);
		});

		it('asks for confirmation before deleting and sends nothing yet', async () => {
			renderProfileRoutes({ user: ownUser });

			await screen.findAllByRole('article');
			userEvent.click(screen.getAllByRole('button', { name: 'Post actions' })[0]);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(screen.getByText(/permanently deleted/i)).toBeInTheDocument();
			expect(deleteUserPost).not.toHaveBeenCalled();
		});

		it('removes the deleted post from the list', async () => {
			deleteUserPost.mockResolvedValue(undefined);
			renderProfileRoutes({ user: ownUser });

			await screen.findAllByRole('article');
			userEvent.click(screen.getAllByRole('button', { name: 'Post actions' })[1]);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(getRenderedPostIds()).toEqual(['post3', 'post1']));
			expect(deleteUserPost).toHaveBeenCalledWith({ userPostId: 'post2', jwtToken: 'token123' });
		});

		it('shows the deleted post gone from the grid as well', async () => {
			deleteUserPost.mockResolvedValue(undefined);
			renderProfileRoutes({ user: ownUser, entries: ['/user/user2', '/user/user2/posts#post3'], initialIndex: 1 });

			await screen.findAllByRole('article');
			userEvent.click(screen.getAllByRole('button', { name: 'Post actions' })[1]);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			await waitFor(() => expect(getRenderedPostIds()).toEqual(['post3', 'post1']));
			userEvent.click(screen.getByRole('button', { name: 'Back' }));

			expect(await screen.findAllByAltText('user-post')).toHaveLength(2);
		});

		describe('deleting from the posts view', () => {
			const deletePostAt = (index) => {
				userEvent.click(screen.getAllByRole('button', { name: 'Post actions' })[index]);
				userEvent.click(screen.getByRole('button', { name: 'Delete' }));
				userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			};

			it('goes to the profile grid, replacing the entry, when the last post is deleted', async () => {
				deleteUserPost.mockResolvedValue(undefined);
				getUsersProfileData.mockResolvedValue([buildProfile({ posts: [buildPost('post1')] })]);
				renderProfileRoutes({ user: ownUser, entries: ['/popular-posts', '/user/user2/posts#post1'], initialIndex: 1 });

				await screen.findAllByRole('article');
				deletePostAt(0);

				await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/user\/user2$/));
				expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
				expect(screen.getByTestId('hash')).toBeEmptyDOMElement();
			});

			it('shows the empty grid after the last post is deleted', async () => {
				deleteUserPost.mockResolvedValue(undefined);
				getUsersProfileData.mockResolvedValue([buildProfile({ posts: [buildPost('post1')] })]);
				renderProfileRoutes({ user: ownUser, entries: ['/user/user2/posts#post1'] });

				await screen.findAllByRole('article');
				deletePostAt(0);

				await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/user\/user2$/));
				expect(screen.queryByRole('article')).not.toBeInTheDocument();
				expect(document.querySelectorAll('.profile-post')).toHaveLength(0);
			});

			it('stays on the posts view when a post other than the last is deleted', async () => {
				deleteUserPost.mockResolvedValue(undefined);
				renderProfileRoutes({ user: ownUser });

				await screen.findAllByRole('article');
				deletePostAt(1);

				await waitFor(() => expect(getRenderedPostIds()).toEqual(['post3', 'post1']));
				expect(screen.getByTestId('path')).toHaveTextContent(/^\/user\/user2\/posts$/);
			});

			it('stays on the posts view when the second to last post is deleted', async () => {
				deleteUserPost.mockResolvedValue(undefined);
				getUsersProfileData.mockResolvedValue([buildProfile({ posts: [buildPost('post2'), buildPost('post1')] })]);
				renderProfileRoutes({ user: ownUser, entries: ['/user/user2/posts#post2'] });

				await screen.findAllByRole('article');
				deletePostAt(0);

				await waitFor(() => expect(getRenderedPostIds()).toEqual(['post1']));
				expect(screen.getByTestId('path')).toHaveTextContent(/^\/user\/user2\/posts$/);
			});

			it('stays on the posts view when deleting the last post fails', async () => {
				deleteUserPost.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
				getUsersProfileData.mockResolvedValue([buildProfile({ posts: [buildPost('post1')] })]);
				renderProfileRoutes({ user: ownUser, entries: ['/user/user2/posts#post1'] });

				await screen.findAllByRole('article');
				deletePostAt(0);

				expect(await screen.findByText("Couldn't delete the post. Try again.")).toBeInTheDocument();
				expect(screen.getByTestId('path')).toHaveTextContent(/^\/user\/user2\/posts$/);
				expect(getRenderedPostIds()).toEqual(['post1']);
			});
		});

		it('shows the delete failure as a toast and keeps the post', async () => {
			deleteUserPost.mockRejectedValue({ code: 'POST_NOT_FOUND', status: 404 });
			renderProfileRoutes({ user: ownUser });

			await screen.findAllByRole('article');
			userEvent.click(screen.getAllByRole('button', { name: 'Post actions' })[0]);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(await screen.findByText('This post no longer exists')).toBeInTheDocument();
			expect(getRenderedPostIds()).toEqual(['post3', 'post2', 'post1']);
		});
	});

	describe('as a guest', () => {
		it('loads and shows the posts without a token', async () => {
			renderProfileRoutes({ user: null });

			expect(await screen.findAllByRole('article')).toHaveLength(3);
			expect(getUsersProfileData).toHaveBeenCalledWith({ userIds: ['user2'], jwtToken: null });
		});

		it('shows the like control and the comment box on every post', async () => {
			renderProfileRoutes({ user: null });

			await screen.findAllByRole('article');
			expect(screen.getAllByRole('button', { name: 'Like post' })).toHaveLength(3);
			expect(screen.getAllByPlaceholderText('Add a comment...')).toHaveLength(3);
		});

		it('sends the guest to /log-in with the same URL, hash included, when Like is clicked', async () => {
			renderProfileRoutes({ user: null, entries: ['/user/user2/posts#post2'] });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: 'Like post' }));

			expect(await screen.findByTestId('login-from')).toHaveTextContent('/user/user2/posts#post2');
			expect(likeUserPost).not.toHaveBeenCalled();
		});

		it('sends the guest to /log-in with the same URL when the comment box is clicked', async () => {
			renderProfileRoutes({ user: null, entries: ['/user/user2/posts#post2'] });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByPlaceholderText('Add a comment...'));

			expect(await screen.findByTestId('login-from')).toHaveTextContent('/user/user2/posts#post2');
		});

		it('sends the guest to /log-in with the same URL when Post is clicked, adding no comment', async () => {
			renderProfileRoutes({ user: null, entries: ['/user/user2/posts#post2'] });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: 'Post' }));

			expect(await screen.findByTestId('login-from')).toHaveTextContent('/user/user2/posts#post2');
			expect(addComment).not.toHaveBeenCalled();
		});

		it('lets the guest open the comments popup and read every comment', async () => {
			getComments.mockResolvedValue([
				{ _id: 'c1', text: 'Hello there', likes: [], userId: { _id: 'user3', username: 'alice' }, replies: [] },
				{ _id: 'c2', text: 'Second comment', likes: [], userId: { _id: 'user4', username: 'bob' }, replies: [] },
			]);
			renderProfileRoutes({ user: null });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[0]).getByRole('button', { name: '0 comments' }));

			expect(await screen.findByText('Hello there', { selector: '.comment-text' })).toBeInTheDocument();
			expect(screen.getByText('Second comment', { selector: '.comment-text' })).toBeInTheDocument();
			expect(screen.queryByTestId('login-from')).not.toBeInTheDocument();
		});

		it('sends the guest to /log-in with the same URL when a comment heart is clicked in the popup', async () => {
			getComments.mockResolvedValue([{ _id: 'c1', text: 'Hello there', likes: [], userId: { _id: 'user3', username: 'alice' }, replies: [] }]);
			renderProfileRoutes({ user: null, entries: ['/user/user2/posts#post2'] });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: '0 comments' }));
			await screen.findByText('Hello there', { selector: '.comment-text' });
			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			expect(await screen.findByTestId('login-from')).toHaveTextContent('/user/user2/posts#post2');
			expect(likeComment).not.toHaveBeenCalled();
		});

		it('sends the guest to /log-in with the same URL when Reply is clicked in the popup', async () => {
			getComments.mockResolvedValue([{ _id: 'c1', text: 'Hello there', likes: [], userId: { _id: 'user3', username: 'alice' }, replies: [] }]);
			renderProfileRoutes({ user: null, entries: ['/user/user2/posts#post2'] });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: '0 comments' }));
			await screen.findByText('Hello there', { selector: '.comment-text' });
			userEvent.click(screen.getByRole('button', { name: 'Reply' }));

			expect(await screen.findByTestId('login-from')).toHaveTextContent('/user/user2/posts#post2');
		});

		it('sends the guest to /log-in when the comment box in the popup is clicked', async () => {
			getComments.mockResolvedValue([{ _id: 'c1', text: 'Hello there', likes: [], userId: { _id: 'user3', username: 'alice' }, replies: [] }]);
			renderProfileRoutes({ user: null, entries: ['/user/user2/posts#post2'] });

			const articles = await screen.findAllByRole('article');

			userEvent.click(within(articles[1]).getByRole('button', { name: '0 comments' }));
			await screen.findByText('Hello there', { selector: '.comment-text' });
			userEvent.click(document.querySelector('.comments-popup-form input'));

			expect(await screen.findByTestId('login-from')).toHaveTextContent('/user/user2/posts#post2');
		});

		it('lets the guest open the profile of the author from a post', async () => {
			renderProfileRoutes({ user: null });

			const articles = await screen.findAllByRole('article');

			expect(within(articles[0]).getByRole('link', { name: 'janedoe' })).toHaveAttribute('href', '/user/user2');
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

		it('is visible when the view opens', async () => {
			renderProfileRoutes();

			await screen.findAllByRole('article');
			expect(document.querySelector('.posts-bar')).not.toHaveClass('posts-bar-hidden');
		});

		it('hides when the page is scrolled down', async () => {
			renderProfileRoutes();

			await screen.findAllByRole('article');
			scrollTo(300);

			expect(document.querySelector('.posts-bar')).toHaveClass('posts-bar-hidden');
		});

		it('reappears when the page is scrolled up', async () => {
			renderProfileRoutes();

			await screen.findAllByRole('article');
			scrollTo(600);
			scrollTo(300);

			expect(document.querySelector('.posts-bar')).not.toHaveClass('posts-bar-hidden');
		});
	});
});
