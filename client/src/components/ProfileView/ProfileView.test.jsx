import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getUsersProfileData, followUser, unfollowUser, updateUserProfileData } from '../../services/userService';
import { addUserPost, updateUserPostCaption, deleteUserPost } from '../../services/userPostService';
import { resizeImage } from '../../utils/images';

import ToastProvider from '../ToastProvider/ToastProvider';

import ProfileView from './ProfileView';

jest.mock('../../services/userService');
jest.mock('../../services/userPostService');
jest.mock('../../utils/images', () => ({
	...jest.requireActual('../../utils/images'),
	resizeImage: jest.fn(),
}));

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
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
			<ToastProvider>
				<MemoryRouter initialEntries={['/user/user2']}>
					<Routes>
						<Route path='/user/:userId' element={<ProfileView />} />
					</Routes>
				</MemoryRouter>
			</ToastProvider>
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

	const renderProfile = ({ loggedInUser = ownUser, profile = {}, updateLoggedInUser = jest.fn(), endSession = jest.fn() } = {}) => {
		getUsersProfileData.mockResolvedValue([{ ...profileUser, posts, ...profile }]);

		const rendered = render(
			<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser, endSession }}>
				<ToastProvider>
					<MemoryRouter initialEntries={['/user/user2']}>
						<Routes>
							<Route path='/user/:userId' element={<ProfileView />} />
						</Routes>
					</MemoryRouter>
				</ToastProvider>
			</LoggedInUserContext.Provider>,
		);

		return { ...rendered, updateLoggedInUser, endSession };
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
		const chosenFile = new File(['(image)'], 'new.png', { type: 'image/png' });
		const resizedFile = new File(['(resized)'], 'new.jpg', { type: 'image/jpeg' });

		beforeEach(() => {
			global.URL.createObjectURL = jest.fn(() => 'blob:preview');
			global.URL.revokeObjectURL = jest.fn();
			resizeImage.mockResolvedValue(resizedFile);
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		const submitUpload = () => {
			userEvent.click(screen.getByRole('button', { name: /Upload Picture/ }));
			userEvent.upload(document.querySelector('.popup-body input[type="file"]'), chosenFile);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Third caption');
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));
		};

		it('adds the tile and updates the header post count immediately after a successful upload', async () => {
			addUserPost.mockResolvedValue(savedPost);
			await renderOwnProfile();

			submitUpload();

			await waitFor(() => expect(screen.getAllByAltText('user-post')).toHaveLength(3));
			expect(getPostsCountText()).toBe('3posts');
		});

		it('resizes the chosen file and sends the resized file with the caption to the server', async () => {
			addUserPost.mockResolvedValue(savedPost);
			await renderOwnProfile();

			submitUpload();

			await waitFor(() => expect(addUserPost).toHaveBeenCalledWith({ image: resizedFile, caption: 'Third caption' }, 'token123'));
			expect(resizeImage).toHaveBeenCalledTimes(1);
			expect(resizeImage).toHaveBeenCalledWith(chosenFile);
		});

		it('resizes before sending the request', async () => {
			const callOrder = [];

			resizeImage.mockImplementation(async () => {
				callOrder.push('resize');

				return resizedFile;
			});
			addUserPost.mockImplementation(async () => {
				callOrder.push('request');

				return savedPost;
			});
			await renderOwnProfile();

			submitUpload();

			await waitFor(() => expect(addUserPost).toHaveBeenCalled());
			expect(callOrder).toEqual(['resize', 'request']);
		});

		it('closes the popup after a successful upload', async () => {
			addUserPost.mockResolvedValue(savedPost);
			await renderOwnProfile();

			submitUpload();

			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Upload Picture' })).not.toBeInTheDocument());
		});

		it('disables Submit while the upload is in flight and sends one request', async () => {
			let resolveUpload;

			addUserPost.mockReturnValue(
				new Promise((resolve) => {
					resolveUpload = resolve;
				}),
			);
			await renderOwnProfile();

			submitUpload();

			await waitFor(() => expect(addUserPost).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

			resolveUpload(savedPost);
			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Upload Picture' })).not.toBeInTheDocument());
			expect(addUserPost).toHaveBeenCalledTimes(1);
		});

		it('shows the size message under the picture and keeps the popup open when the server answers IMAGE_TOO_LARGE', async () => {
			addUserPost.mockRejectedValue({ code: 'IMAGE_TOO_LARGE', fields: { image: 'IMAGE_TOO_LARGE' }, status: 413 });
			await renderOwnProfile();

			submitUpload();

			const message = await screen.findByText('This image is over 10 MB');
			expect(message).toHaveClass('field-error');
			expect(screen.getByRole('heading', { name: 'Upload Picture' })).toBeInTheDocument();
			expect(document.querySelector('.form-error')).not.toBeInTheDocument();
		});

		it('shows the type message under the picture when the server answers IMAGE_TYPE_INVALID', async () => {
			addUserPost.mockRejectedValue({ code: 'IMAGE_TYPE_INVALID', fields: { image: 'IMAGE_TYPE_INVALID' }, status: 400 });
			await renderOwnProfile();

			submitUpload();

			expect(await screen.findByText('Choose a JPEG, PNG or WebP image')).toHaveClass('field-error');
		});

		it('shows the singular label when the first post is uploaded', async () => {
			addUserPost.mockResolvedValue(savedPost);
			await renderOwnProfile({ profile: { posts: [] } });

			expect(getPostsCountText()).toBe('0posts');

			submitUpload();

			await waitFor(() => expect(getPostsCountText()).toBe('1post'));
		});

		it('leaves the post count unchanged when the save fails', async () => {
			addUserPost.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			jest.spyOn(console, 'log').mockImplementation(() => {});
			await renderOwnProfile();

			submitUpload();

			await waitFor(() => expect(addUserPost).toHaveBeenCalled());
			expect(screen.getAllByAltText('user-post')).toHaveLength(2);
			expect(getPostsCountText()).toBe('2posts');
		});

		it('shows the upload-picture fallback copy in the popup when the save fails', async () => {
			addUserPost.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			await renderOwnProfile();

			submitUpload();

			const message = await screen.findByText("Couldn't upload the picture. Try again.");
			expect(message).toHaveClass('form-error');
			expect(screen.getByRole('heading', { name: 'Upload Picture' })).toBeInTheDocument();
		});

		it('shows the upload-picture fallback copy in the popup when resizing fails, and sends no request', async () => {
			resizeImage.mockRejectedValue(new Error('The source image could not be decoded'));
			await renderOwnProfile();

			submitUpload();

			expect(await screen.findByText("Couldn't upload the picture. Try again.")).toBeInTheDocument();
			expect(addUserPost).not.toHaveBeenCalled();
		});

		it('ends the session and shows no form error when the save fails with UNAUTHENTICATED', async () => {
			addUserPost.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = await renderOwnProfile();

			submitUpload();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(document.querySelector('.form-error')).not.toBeInTheDocument();
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

		it.each([
			['POST_NOT_FOUND', 404, 'This post no longer exists'],
			['POST_FORBIDDEN', 403, 'You can only change your own posts'],
		])('closes the confirmation, keeps the post and shows the %s copy as a toast', async (code, status, copy) => {
			deleteUserPost.mockRejectedValue({ code, status });
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(await within(screen.getByRole('alert')).findByText(copy)).toBeInTheDocument();
			expect(screen.queryByText(/permanently deleted/i)).not.toBeInTheDocument();
			expect(screen.getAllByAltText('user-post')).toHaveLength(2);
			expect(getPostsCountText()).toBe('2posts');
		});

		it('shows the delete-post fallback copy as a toast for INTERNAL_ERROR', async () => {
			deleteUserPost.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(await within(screen.getByRole('alert')).findByText("Couldn't delete the post. Try again.")).toBeInTheDocument();
			expect(screen.queryByText(/permanently deleted/i)).not.toBeInTheDocument();
		});

		it('shows the delete-post fallback copy as a toast when the failure is not a RequestError', async () => {
			deleteUserPost.mockRejectedValue(new Error('network down'));
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(await screen.findByText("Couldn't delete the post. Try again.")).toBeInTheDocument();
		});

		it('ends the session and shows no toast when the delete fails with UNAUTHENTICATED', async () => {
			deleteUserPost.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
			expect(screen.queryByText(/permanently deleted/i)).not.toBeInTheDocument();
		});

		it('lets the user delete again after a failure and removes the post when the retry succeeds', async () => {
			deleteUserPost.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(undefined);
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			await screen.findByText("Couldn't delete the post. Try again.");

			openDeleteConfirmForTile(0);
			expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(screen.getAllByAltText('user-post')).toHaveLength(1));
			expect(deleteUserPost).toHaveBeenCalledTimes(2);
		});

		it('replaces the showing toast when a second delete fails', async () => {
			deleteUserPost
				.mockRejectedValueOnce({ code: 'POST_NOT_FOUND', status: 404 })
				.mockRejectedValueOnce({ code: 'POST_FORBIDDEN', status: 403 });
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			await screen.findByText('This post no longer exists');

			openDeleteConfirmForTile(1);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(await screen.findByText('You can only change your own posts')).toBeInTheDocument();
			expect(screen.queryByText('This post no longer exists')).not.toBeInTheDocument();
		});

		it('shows no stale error inside the confirmation when it is reopened after a failure', async () => {
			deleteUserPost.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			await renderOwnProfile();

			openDeleteConfirmForTile(0);
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			await screen.findByText("Couldn't delete the post. Try again.");

			openDeleteConfirmForTile(0);

			expect(document.querySelector('.delete-post-confirm .form-error')).not.toBeInTheDocument();
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

		it('shows the code copy in the popup and keeps it open when the request fails', async () => {
			updateUserPostCaption.mockRejectedValue({ code: 'POST_FORBIDDEN', status: 403 });
			await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' more');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));

			expect(await screen.findByText('You can only change your own posts')).toHaveClass('form-error');
			expect(screen.getByRole('heading', { name: 'Edit Picture' })).toBeInTheDocument();
		});

		it('shows the edit-caption fallback copy in the popup for INTERNAL_ERROR', async () => {
			updateUserPostCaption.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' more');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));

			expect(await screen.findByText("Couldn't save the caption. Try again.")).toBeInTheDocument();
		});

		it('ends the session and shows no form error when the caption save fails with UNAUTHENTICATED', async () => {
			updateUserPostCaption.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' more');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(document.querySelector('.form-error')).not.toBeInTheDocument();
		});

		it('keeps the old caption after a failed save', async () => {
			updateUserPostCaption.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			await renderOwnProfile();

			openEditFormForTile(0);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' more');
			userEvent.click(screen.getByRole('button', { name: 'Save' }));
			await screen.findByText("Couldn't save the caption. Try again.");

			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			openEditFormForTile(0);

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('First caption');
		});
	});

	describe('uploading a profile picture from Edit Profile', () => {
		const chosenFile = new File(['(image)'], 'me.png', { type: 'image/png' });
		const resizedFile = new File(['(resized)'], 'me.jpg', { type: 'image/jpeg' });
		const profile = { email: 'jane@example.com' };

		beforeEach(() => {
			global.URL.createObjectURL = jest.fn(() => 'blob:preview');
			global.URL.revokeObjectURL = jest.fn();
			resizeImage.mockResolvedValue(resizedFile);
		});

		const chooseProfilePictureAndSubmit = () => {
			userEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
			userEvent.upload(document.querySelector('.popup-body input[type="file"]'), chosenFile);
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));
		};

		it('resizes the chosen file and sends the resized file to the server', async () => {
			const updatedUser = { _id: 'user2', username: 'janedoe', posts, followers: [], following: [] };

			updateUserProfileData.mockResolvedValue({ user: updatedUser, jwt: 'new.jwt' });
			await renderOwnProfile({ profile });

			chooseProfilePictureAndSubmit();

			await waitFor(() =>
				expect(updateUserProfileData).toHaveBeenCalledWith({
					userId: 'user2',
					jwtToken: 'token123',
					updatedProfileData: { profilePicture: resizedFile },
				}),
			);
			expect(resizeImage).toHaveBeenCalledTimes(1);
			expect(resizeImage).toHaveBeenCalledWith(chosenFile);
		});

		it('resizes before sending the request', async () => {
			const callOrder = [];

			resizeImage.mockImplementation(async () => {
				callOrder.push('resize');

				return resizedFile;
			});
			updateUserProfileData.mockImplementation(async () => {
				callOrder.push('request');

				return { user: { _id: 'user2', username: 'janedoe', posts, followers: [], following: [] }, jwt: 'new.jwt' };
			});
			await renderOwnProfile({ profile });

			chooseProfilePictureAndSubmit();

			await waitFor(() => expect(updateUserProfileData).toHaveBeenCalled());
			expect(callOrder).toEqual(['resize', 'request']);
		});

		it('refreshes the logged-in user and closes the popup after a successful upload', async () => {
			const updatedUser = { _id: 'user2', username: 'janedoe', posts, followers: [], following: [] };

			updateUserProfileData.mockResolvedValue({ user: updatedUser, jwt: 'new.jwt' });
			const { updateLoggedInUser } = await renderOwnProfile({ profile });

			chooseProfilePictureAndSubmit();

			await waitFor(() => expect(updateLoggedInUser).toHaveBeenCalledWith({ user: updatedUser, jwt: 'new.jwt' }));
			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Profile' })).not.toBeInTheDocument());
		});

		it('does not resize anything when only text fields change', async () => {
			updateUserProfileData.mockResolvedValue({ user: { _id: 'user2', username: 'janedoe', posts, followers: [], following: [] }, jwt: 'j' });
			await renderOwnProfile({ profile });

			userEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
			userEvent.clear(screen.getByPlaceholderText('Bio'));
			userEvent.type(screen.getByPlaceholderText('Bio'), 'New bio');
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() =>
				expect(updateUserProfileData).toHaveBeenCalledWith(expect.objectContaining({ updatedProfileData: { bio: 'New bio' } })),
			);
			expect(resizeImage).not.toHaveBeenCalled();
		});

		it('shows the size message under the picture and keeps the popup open when the server answers IMAGE_TOO_LARGE', async () => {
			updateUserProfileData.mockRejectedValue({ code: 'IMAGE_TOO_LARGE', fields: { profilePicture: 'IMAGE_TOO_LARGE' }, status: 413 });
			await renderOwnProfile({ profile });

			chooseProfilePictureAndSubmit();

			expect(await screen.findByText('This image is over 10 MB')).toHaveClass('field-error');
			expect(screen.getByRole('heading', { name: 'Edit Profile' })).toBeInTheDocument();
		});

		it('shows the save-profile fallback and keeps the popup open when resizing fails, sending no request', async () => {
			resizeImage.mockRejectedValue(new Error('The source image could not be decoded'));
			await renderOwnProfile({ profile });

			chooseProfilePictureAndSubmit();

			expect(await screen.findByText("Couldn't save your profile. Try again.")).toHaveClass('form-error');
			expect(updateUserProfileData).not.toHaveBeenCalled();
			expect(screen.getByRole('heading', { name: 'Edit Profile' })).toBeInTheDocument();
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
			expect(resizeImage).not.toHaveBeenCalled();
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

describe('ProfileView errors', () => {
	const ownUser = { _id: 'user2', username: 'janedoe', following: [] };
	const otherUser = { _id: 'user1', username: 'johndoe', following: [] };

	const renderProfile = ({ loggedInUser = otherUser, endSession = jest.fn() } = {}) => {
		const rendered = render(
			<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession }}>
				<ToastProvider>
					<MemoryRouter initialEntries={['/user/user2']}>
						<Routes>
							<Route path='/user/:userId' element={<ProfileView />} />
						</Routes>
					</MemoryRouter>
				</ToastProvider>
			</LoggedInUserContext.Provider>,
		);

		return { ...rendered, endSession };
	};

	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('when the profile fails to load', () => {
		it.each([
			['a server failure', { code: 'INTERNAL_ERROR', status: 500 }],
			['a network failure', { code: 'INTERNAL_ERROR', status: 0 }],
			['an unrecognised error', new Error('boom')],
		])('shows the full-page load error for %s', async (_name, error) => {
			getUsersProfileData.mockRejectedValue(error);

			renderProfile();

			expect(await screen.findByRole('heading', { name: "Couldn't load this profile" })).toBeInTheDocument();
			expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
			expect(screen.queryByText('janedoe')).not.toBeInTheDocument();
		});

		it('shows no toast alongside the full-page load error', async () => {
			getUsersProfileData.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderProfile();

			await screen.findByRole('heading', { name: "Couldn't load this profile" });
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});

		it('fetches the profile again when Retry is clicked and shows it once the request succeeds', async () => {
			getUsersProfileData
				.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 })
				.mockResolvedValueOnce([{ _id: 'user2', username: 'janedoe', posts: [], followers: [], following: [] }]);

			renderProfile();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			expect(await screen.findByText('janedoe')).toBeInTheDocument();
			expect(getUsersProfileData).toHaveBeenCalledTimes(2);
			expect(getUsersProfileData).toHaveBeenLastCalledWith({ userIds: ['user2'], jwtToken: 'token123' });
			expect(screen.queryByRole('heading', { name: "Couldn't load this profile" })).not.toBeInTheDocument();
		});

		it('keeps showing the load error when Retry fails again', async () => {
			getUsersProfileData.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderProfile();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			await waitFor(() => expect(getUsersProfileData).toHaveBeenCalledTimes(2));
			expect(await screen.findByRole('button', { name: 'Retry' })).toBeEnabled();
			expect(screen.getByRole('heading', { name: "Couldn't load this profile" })).toBeInTheDocument();
		});

		it('disables Retry while the retry request is in flight', async () => {
			let resolveRetry;

			getUsersProfileData.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockReturnValueOnce(
				new Promise((resolve) => {
					resolveRetry = resolve;
				}),
			);

			renderProfile();

			userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

			await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled());

			resolveRetry([{ _id: 'user2', username: 'janedoe', posts: [], followers: [], following: [] }]);

			expect(await screen.findByText('janedoe')).toBeInTheDocument();
		});

		it('renders a blank page area for USER_NOT_FOUND, with no load error and no toast', async () => {
			getUsersProfileData.mockRejectedValue({ code: 'USER_NOT_FOUND', status: 404 });

			const { container } = renderProfile();

			await waitFor(() => expect(getUsersProfileData).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(container.querySelector('.profile-view-wrapper')).not.toBeInTheDocument());

			expect(screen.queryByRole('heading', { name: "Couldn't load this profile" })).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});

		it('ends the session instead of showing a load error for UNAUTHENTICATED', async () => {
			getUsersProfileData.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderProfile();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByRole('heading', { name: "Couldn't load this profile" })).not.toBeInTheDocument();
		});
	});

	describe('Edit Profile failures', () => {
		const openEditProfile = async (updateRejection) => {
			getUsersProfileData.mockResolvedValue([{ ...ownUser, email: 'jane@example.com', posts: [], followers: [], following: [] }]);
			updateUserProfileData.mockRejectedValue(updateRejection);

			const rendered = renderProfile({ loggedInUser: ownUser });

			userEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }));
			userEvent.type(screen.getByPlaceholderText('Bio'), 'New bio');
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			return rendered;
		};

		it('shows a field code under its input and keeps the popup open', async () => {
			await openEditProfile({ code: 'USERNAME_TAKEN', fields: { username: 'USERNAME_TAKEN' }, status: 409 });

			expect(await screen.findByText('This username is taken')).toHaveClass('field-error');
			expect(screen.getByRole('heading', { name: 'Edit Profile' })).toBeInTheDocument();
		});

		it('shows the save-profile fallback copy as the form message for INTERNAL_ERROR', async () => {
			await openEditProfile({ code: 'INTERNAL_ERROR', status: 500 });

			expect(await screen.findByText("Couldn't save your profile. Try again.")).toHaveClass('form-error');
		});

		it('ends the session and shows no form error for UNAUTHENTICATED', async () => {
			const { endSession } = await openEditProfile({ code: 'UNAUTHENTICATED', status: 401 });

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(document.querySelector('.form-error')).not.toBeInTheDocument();
		});
	});

	describe('follow and unfollow failures', () => {
		const profile = { _id: 'user2', username: 'janedoe', posts: [], followers: [], following: [] };

		it('stay silent when following fails: no toast, no form error, profile still shown', async () => {
			getUsersProfileData.mockResolvedValue([profile]);
			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			const { endSession } = renderProfile();

			userEvent.click(await screen.findByRole('button', { name: 'Follow' }));

			await waitFor(() => expect(followUser).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
			expect(screen.getByText('janedoe')).toBeInTheDocument();
			expect(endSession).not.toHaveBeenCalled();
		});

		it('stay silent when unfollowing fails: no toast, no form error, profile still shown', async () => {
			getUsersProfileData.mockResolvedValue([profile]);
			unfollowUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			const { endSession } = renderProfile({ loggedInUser: { ...otherUser, following: ['user2'] } });

			userEvent.click(await screen.findByRole('button', { name: 'Unfollow' }));

			await waitFor(() => expect(unfollowUser).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
			expect(screen.getByText('janedoe')).toBeInTheDocument();
			expect(endSession).not.toHaveBeenCalled();
		});

		it('ends the session when following fails with UNAUTHENTICATED', async () => {
			getUsersProfileData.mockResolvedValue([profile]);
			followUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderProfile();

			userEvent.click(await screen.findByRole('button', { name: 'Follow' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});

		it('ends the session when unfollowing fails with UNAUTHENTICATED', async () => {
			getUsersProfileData.mockResolvedValue([profile]);
			unfollowUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderProfile({ loggedInUser: { ...otherUser, following: ['user2'] } });

			userEvent.click(await screen.findByRole('button', { name: 'Unfollow' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});
	});
});
