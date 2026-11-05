import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { NOTIFICATION_TARGET_STATE_KEY } from '../../constants/notifications';
import { getUsersProfileData } from '../../services/userService';
import { getComments } from '../../services/commentService';

import ToastProvider from '../ToastProvider/ToastProvider';
import NotFoundProvider from '../NotFoundProvider/NotFoundProvider';
import ProfileLayout from '../ProfileLayout/ProfileLayout';
import ProfileView from '../ProfileView/ProfileView';

import ProfilePostsView from './ProfilePostsView';

jest.mock('../../services/userService');
jest.mock('../../services/userPostService');
jest.mock('../../services/commentService');

const buildPost = (id) => ({
	_id: id,
	imageIdentifier: `img-${id}`,
	imageUrl: `https://example.com/${id}.jpg`,
	caption: `Caption of ${id}`,
	likes: [],
	commentsCount: 0,
	previewComments: [],
});

const profile = {
	_id: 'user2',
	username: 'janedoe',
	posts: [buildPost('post3'), buildPost('post2'), buildPost('post1')],
	followers: [],
	following: [],
};

const viewer = { _id: 'user1', username: 'johndoe', following: [] };

const notificationEntry = (postId, shouldOpenComments) => ({
	pathname: '/user/user2/posts',
	hash: `#${postId}`,
	state: { [NOTIFICATION_TARGET_STATE_KEY]: { postId, shouldOpenComments } },
});

const renderPostsView = (entry) =>
	render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser: viewer, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
			<ToastProvider>
				<NotFoundProvider>
					<MemoryRouter initialEntries={[entry]}>
						<Routes>
							<Route path='/user/:userId' element={<ProfileLayout />}>
								<Route index element={<ProfileView />} />

								<Route path='posts' element={<ProfilePostsView />} />
							</Route>
						</Routes>
					</MemoryRouter>
				</NotFoundProvider>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

describe('ProfilePostsView opened from a notification', () => {
	let mockScrollIntoView;

	beforeEach(() => {
		jest.resetAllMocks();
		mockScrollIntoView = jest.fn();
		window.HTMLElement.prototype.scrollIntoView = mockScrollIntoView;
		getUsersProfileData.mockResolvedValue([profile]);
		getComments.mockResolvedValue([
			{
				_id: 'c1',
				text: 'Hello there',
				likes: [],
				createdAt: '2024-01-01T00:00:00.000Z',
				userId: { _id: 'user3', username: 'alice' },
				replies: [],
			},
		]);
	});

	afterEach(() => {
		delete window.HTMLElement.prototype.scrollIntoView;
	});

	describe('a like notification', () => {
		it('scrolls to the post named by the notification', async () => {
			renderPostsView(notificationEntry('post2', false));

			await screen.findAllByRole('article');

			await waitFor(() => expect(mockScrollIntoView.mock.instances.map((element) => element.id)).toContain('post2'));
		});

		it('does not open the comments', async () => {
			renderPostsView(notificationEntry('post2', false));

			await screen.findAllByRole('article');

			expect(screen.queryByRole('heading', { name: 'Comments' })).not.toBeInTheDocument();
			expect(getComments).not.toHaveBeenCalled();
		});
	});

	describe('a comment, reply or comment like notification', () => {
		it('opens the comments of the post named by the notification', async () => {
			renderPostsView(notificationEntry('post2', true));

			expect(await screen.findByRole('heading', { name: 'Comments' })).toBeInTheDocument();
			expect(getComments).toHaveBeenCalledWith(expect.objectContaining({ userPostId: 'post2' }));
		});

		it('opens the comments of that post only', async () => {
			renderPostsView(notificationEntry('post2', true));

			await screen.findByRole('heading', { name: 'Comments' });

			expect(screen.getAllByRole('heading', { name: 'Comments' })).toHaveLength(1);
			expect(getComments).toHaveBeenCalledTimes(1);
		});

		it('scrolls to the post as well', async () => {
			renderPostsView(notificationEntry('post2', true));

			await screen.findByRole('heading', { name: 'Comments' });

			await waitFor(() => expect(mockScrollIntoView.mock.instances.map((element) => element.id)).toContain('post2'));
		});

		it('does not open the comments again after they were closed', async () => {
			renderPostsView(notificationEntry('post2', true));

			await screen.findByRole('heading', { name: 'Comments' });
			await waitFor(() => expect(getComments).toHaveBeenCalledTimes(1));
			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(screen.queryByRole('heading', { name: 'Comments' })).not.toBeInTheDocument();
			expect(getComments).toHaveBeenCalledTimes(1);
		});

		it('opens nothing when the post is no longer on the profile', async () => {
			renderPostsView(notificationEntry('gone', true));

			await screen.findAllByRole('article');

			expect(screen.queryByRole('heading', { name: 'Comments' })).not.toBeInTheDocument();
			expect(getComments).not.toHaveBeenCalled();
		});
	});

	describe('opened without a notification', () => {
		it('does not open any comments for a plain hash link', async () => {
			renderPostsView({ pathname: '/user/user2/posts', hash: '#post2' });

			await screen.findAllByRole('article');

			expect(screen.queryByRole('heading', { name: 'Comments' })).not.toBeInTheDocument();
		});
	});
});
