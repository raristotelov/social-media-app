import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getUsersProfileData, followUser, updateUserProfileData } from '../../services/userService';
import { addUserPost, updateUserPostCaption, deleteUserPost } from '../../services/userPostService';
import { uploadImageToCloudinary } from '../../services/cloudinaryService';

import ProfileView from './ProfileView';

jest.mock('../../services/userService');
jest.mock('../../services/userPostService');
jest.mock('../../services/cloudinaryService');

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
	const actual = jest.requireActual('react-router-dom');

	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

const profileUser = {
	_id: 'user2',
	username: 'janedoe',
	bio: 'Just a bio',
	posts: [],
	followers: [],
	following: [],
};

const renderProfileView = (loggedInUser) => {
	getUsersProfileData.mockResolvedValue([profileUser]);

	return render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn() }}>
			<MemoryRouter initialEntries={['/user/user2']}>
				<Routes>
					<Route path='/user/:userId' element={<ProfileView />} />
				</Routes>
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);
};

describe('ProfileView', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('renders the profile content for a guest and navigates to /log-in instead of calling followUser when Follow is clicked', async () => {
		renderProfileView(null);

		expect(await screen.findByText('janedoe')).toBeInTheDocument();

		userEvent.click(screen.getByRole('button', { name: 'Follow' }));

		expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2' } });
		expect(followUser).not.toHaveBeenCalled();
	});

	it("calls followUser when a logged-in user clicks Follow on someone else's profile", async () => {
		followUser.mockResolvedValue({ user: profileUser });

		renderProfileView({ _id: 'user1', username: 'johndoe', following: [] });

		expect(await screen.findByText('janedoe')).toBeInTheDocument();

		userEvent.click(screen.getByRole('button', { name: 'Follow' }));

		await waitFor(() => expect(followUser).toHaveBeenCalledWith({ userId: 'user1', jwtToken: 'token123', userIdToFollow: 'user2' }));
	});
});

describe('ProfileView post actions and profile picture removal', () => {
	const posts = [
		{ _id: 'post1', imageIdentifier: 'img1', imageUrl: 'https://example.com/1.jpg', caption: 'First caption' },
		{ _id: 'post2', imageIdentifier: 'img2', imageUrl: 'https://example.com/2.jpg', caption: 'Second caption' },
	];

	const ownUser = { _id: 'user2', username: 'janedoe', following: [] };

	const renderProfile = ({ loggedInUser = ownUser, profile = {}, updateLoggedInUser = jest.fn() } = {}) => {
		getUsersProfileData.mockResolvedValue([{ ...profileUser, posts, ...profile }]);

		render(
			<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser }}>
				<MemoryRouter initialEntries={['/user/user2']}>
					<Routes>
						<Route path='/user/:userId' element={<ProfileView />} />
					</Routes>
				</MemoryRouter>
			</LoggedInUserContext.Provider>,
		);

		return { updateLoggedInUser };
	};

	const renderOwnProfile = async (options) => {
		const rendered = renderProfile(options);

		await screen.findByText('janedoe');

		return rendered;
	};

	const getTileActionButtons = () => screen.getAllByRole('button', { name: 'Post actions' });

	const openDeleteConfirmForTile = (index) => {
		userEvent.click(getTileActionButtons()[index]);
		userEvent.click(screen.getByRole('button', { name: 'Delete' }));
	};

	const openEditFormForTile = (index) => {
		userEvent.click(getTileActionButtons()[index]);
		userEvent.click(screen.getByRole('button', { name: 'Edit' }));
	};

	const getPostsCountText = () => document.querySelector('.profile-stat').textContent;

	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('post actions visibility', () => {
		it('shows a three-dots button on every tile of your own profile', async () => {
			await renderOwnProfile();

			expect(getTileActionButtons()).toHaveLength(2);
		});

		it("shows no three-dots buttons on another user's profile", async () => {
			await renderOwnProfile({ loggedInUser: { _id: 'user1', username: 'johndoe', following: [] } });

			expect(screen.getAllByAltText('user-post')).toHaveLength(2);
			expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
		});

		it('shows no three-dots buttons to a guest', async () => {
			await renderOwnProfile({ loggedInUser: null });

			expect(screen.getAllByAltText('user-post')).toHaveLength(2);
			expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
		});

		it('opens a menu with Edit and Delete from a tile', async () => {
			await renderOwnProfile();

			userEvent.click(getTileActionButtons()[0]);

			expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		});
	});

	describe('uploading a post', () => {
		const createdImage = { imageIdentifier: 'img3', imageUrl: 'https://example.com/3.jpg' };
		const savedPost = { _id: 'post3', ...createdImage, caption: 'Third caption' };

		beforeEach(() => {
			global.URL.createObjectURL = jest.fn(() => 'blob:preview');
			global.URL.revokeObjectURL = jest.fn();
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		const submitUpload = () => {
			userEvent.click(screen.getByRole('button', { name: /Upload Picture/ }));
			userEvent.upload(document.querySelector('.popup-body input[type="file"]'), new File(['(image)'], 'new.png', { type: 'image/png' }));
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Third caption');
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));
		};

		it('adds the tile and updates the header post count immediately after a successful upload', async () => {
			uploadImageToCloudinary.mockResolvedValue(createdImage);
			addUserPost.mockResolvedValue(savedPost);
			await renderOwnProfile();

			submitUpload();

			await waitFor(() => expect(screen.getAllByAltText('user-post')).toHaveLength(3));
			expect(getPostsCountText()).toBe('3posts');
			expect(addUserPost).toHaveBeenCalledWith({ ...createdImage, caption: 'Third caption' }, 'token123');
		});

		it('shows the singular label when the first post is uploaded', async () => {
			uploadImageToCloudinary.mockResolvedValue(createdImage);
			addUserPost.mockResolvedValue(savedPost);
			await renderOwnProfile({ profile: { posts: [] } });

			expect(getPostsCountText()).toBe('0posts');

			submitUpload();

			await waitFor(() => expect(getPostsCountText()).toBe('1post'));
		});

		it('leaves the post count unchanged when the save fails', async () => {
			uploadImageToCloudinary.mockResolvedValue(createdImage);
			addUserPost.mockRejectedValue({ error: 'Could not save the user post' });
			jest.spyOn(console, 'log').mockImplementation(() => {});
			await renderOwnProfile();

			submitUpload();

			await waitFor(() => expect(addUserPost).toHaveBeenCalled());
			expect(screen.getAllByAltText('user-post')).toHaveLength(2);
			expect(getPostsCountText()).toBe('2posts');
		});
	});

	describe('deleting a post', () => {
		it('shows a confirmation with Delete and Cancel and sends nothing yet', async () => {
			await renderOwnProfile();

			openDeleteConfirmForTile(0);

			expect(screen.getByText(/permanently deleted/i)).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
			expect(deleteUserPost).not.toHaveBeenCalled();
		});

		it('leaves the grid and post count unchanged and sends nothing when Cancel is clicked', async () => {
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(screen.queryByText(/permanently deleted/i)).not.toBeInTheDocument();
			expect(screen.getAllByAltText('user-post')).toHaveLength(2);
			expect(getPostsCountText()).toBe('2posts');
			expect(deleteUserPost).not.toHaveBeenCalled();
		});

		it('leaves everything unchanged when the confirmation is dismissed with the close icon', async () => {
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(screen.queryByText(/permanently deleted/i)).not.toBeInTheDocument();
			expect(screen.getAllByAltText('user-post')).toHaveLength(2);
			expect(deleteUserPost).not.toHaveBeenCalled();
		});

		it('requests deletion of the chosen post with the token', async () => {
			deleteUserPost.mockResolvedValue(undefined);
			await renderOwnProfile();

			openDeleteConfirmForTile(1);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(deleteUserPost).toHaveBeenCalledWith({ userPostId: 'post2', jwtToken: 'token123' }));
		});

		it('removes only the deleted tile, updates the post count and closes the confirmation on success', async () => {
			deleteUserPost.mockResolvedValue(undefined);
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(screen.getAllByAltText('user-post')).toHaveLength(1));
			expect(screen.getByAltText('user-post')).toHaveAttribute('src', posts[1].imageUrl);
			expect(getPostsCountText()).toBe('1post');
			expect(screen.queryByText(/permanently deleted/i)).not.toBeInTheDocument();
		});

		it('shows zero posts after the last remaining post is deleted', async () => {
			deleteUserPost.mockResolvedValue(undefined);
			await renderOwnProfile({ profile: { posts: [{ ...posts[0] }] } });

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(screen.queryByAltText('user-post')).not.toBeInTheDocument());
			expect(getPostsCountText()).toBe('0posts');
		});

		it('disables Delete while the request is in flight', async () => {
			let resolveDelete;

			deleteUserPost.mockReturnValue(
				new Promise((resolve) => {
					resolveDelete = resolve;
				}),
			);
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled());

			resolveDelete();

			await waitFor(() => expect(screen.queryByText(/permanently deleted/i)).not.toBeInTheDocument());
		});

		it('shows the server error in the popup and keeps the post when the request fails', async () => {
			deleteUserPost.mockRejectedValue({ error: 'Could not delete image img1' });
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(await screen.findByText('Could not delete image img1')).toBeInTheDocument();
			expect(screen.getByText(/permanently deleted/i)).toBeInTheDocument();
			expect(screen.getAllByAltText('user-post')).toHaveLength(2);
			expect(getPostsCountText()).toBe('2posts');
		});

		it('shows a generic message when the failure carries no server message', async () => {
			deleteUserPost.mockRejectedValue(new Error('network down'));
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
		});

		it('enables Delete again after a failure so the user can retry, and removes the post when the retry succeeds', async () => {
			deleteUserPost.mockRejectedValueOnce({ error: 'Could not delete image img1' }).mockResolvedValueOnce(undefined);
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await screen.findByText('Could not delete image img1');
			expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();

			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(screen.getAllByAltText('user-post')).toHaveLength(1));
			expect(deleteUserPost).toHaveBeenCalledTimes(2);
		});

		it('does not show a stale error when the confirmation is reopened after a failure', async () => {
			deleteUserPost.mockRejectedValue({ error: 'Could not delete image img1' });
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			await screen.findByText('Could not delete image img1');

			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			openDeleteConfirmForTile(0);

			expect(screen.queryByText('Could not delete image img1')).not.toBeInTheDocument();
		});
	});

	describe('editing a post caption', () => {
		it('opens the Edit Picture popup prefilled with the post caption', async () => {
			await renderOwnProfile();

			openEditFormForTile(1);

			expect(screen.getByRole('heading', { name: 'Edit Picture' })).toBeInTheDocument();
			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('Second caption');
			expect(screen.getByAltText('post')).toHaveAttribute('src', posts[1].imageUrl);
		});

		it('closes without sending anything when Save is clicked on an untouched form', async () => {
			await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Picture' })).not.toBeInTheDocument());
			expect(updateUserPostCaption).not.toHaveBeenCalled();
		});

		it('closes without sending anything when Cancel is clicked after typing', async () => {
			await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' more');
			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(screen.queryByRole('heading', { name: 'Edit Picture' })).not.toBeInTheDocument();
			expect(updateUserPostCaption).not.toHaveBeenCalled();
		});

		it('sends the new caption for the chosen post and closes the popup on success', async () => {
			updateUserPostCaption.mockResolvedValue({ ...posts[0], caption: 'Edited caption' });
			await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.clear(screen.getByPlaceholderText('Write a caption...'));
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Edited caption');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() =>
				expect(updateUserPostCaption).toHaveBeenCalledWith({ userPostId: 'post1', caption: 'Edited caption', jwtToken: 'token123' }),
			);
			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Picture' })).not.toBeInTheDocument());
		});

		it('shows the updated caption when the post is edited again, and keeps the image and other posts', async () => {
			updateUserPostCaption.mockResolvedValue({ ...posts[0], caption: 'Edited caption' });
			await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.clear(screen.getByPlaceholderText('Write a caption...'));
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Edited caption');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));
			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Picture' })).not.toBeInTheDocument());

			openEditFormForTile(0);

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('Edited caption');
			expect(screen.getByAltText('post')).toHaveAttribute('src', posts[0].imageUrl);

			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			openEditFormForTile(1);

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('Second caption');
			expect(screen.getAllByAltText('user-post')).toHaveLength(2);
		});

		it('shows an error in the popup and keeps it open when the request fails', async () => {
			updateUserPostCaption.mockRejectedValue({ error: 'You can only change your own posts' });
			await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' more');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));

			expect(await screen.findByText('You can only change your own posts')).toBeInTheDocument();
			expect(screen.getByRole('heading', { name: 'Edit Picture' })).toBeInTheDocument();
		});

		it('keeps the old caption after a failed save', async () => {
			updateUserPostCaption.mockRejectedValue({});
			await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' more');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));
			await screen.findByText('Something went wrong. Please try again.');

			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			openEditFormForTile(0);

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('First caption');
		});
	});

	describe('removing the profile picture from Edit Profile', () => {
		const profileWithPicture = {
			email: 'jane@example.com',
			profilePicture: { _id: 'pic1', imageUrl: 'https://example.com/me.jpg' },
		};

		beforeEach(() => {
			global.URL.createObjectURL = jest.fn(() => 'blob:preview');
			global.URL.revokeObjectURL = jest.fn();
		});

		const openEditProfile = () => userEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));

		it('sends profilePicture: null without uploading anything and refreshes the logged-in user on Submit', async () => {
			const updatedUser = { _id: 'user2', username: 'janedoe', posts, followers: [], following: [] };

			updateUserProfileData.mockResolvedValue({ user: updatedUser, jwt: 'new.jwt' });
			const { updateLoggedInUser } = await renderOwnProfile({ profile: profileWithPicture });

			openEditProfile();
			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() =>
				expect(updateUserProfileData).toHaveBeenCalledWith({
					userId: 'user2',
					jwtToken: 'token123',
					updatedProfileData: { profilePicture: null },
				}),
			);
			expect(uploadImageToCloudinary).not.toHaveBeenCalled();
			await waitFor(() => expect(updateLoggedInUser).toHaveBeenCalledWith({ user: updatedUser, jwt: 'new.jwt' }));
			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Profile' })).not.toBeInTheDocument());
		});

		it('sends nothing when Cancel is clicked after removing the picture', async () => {
			await renderOwnProfile({ profile: profileWithPicture });

			openEditProfile();
			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(screen.queryByRole('heading', { name: 'Edit Profile' })).not.toBeInTheDocument();
			expect(updateUserProfileData).not.toHaveBeenCalled();
		});

		it('still shows the picture when Edit Profile is reopened after Cancel', async () => {
			await renderOwnProfile({ profile: profileWithPicture });

			openEditProfile();
			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			openEditProfile();

			expect(screen.getByAltText('preview')).toHaveAttribute('src', profileWithPicture.profilePicture.imageUrl);
		});
	});
});
