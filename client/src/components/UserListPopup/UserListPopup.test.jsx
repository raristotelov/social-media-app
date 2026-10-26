import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getFollowers, getFollowing } from '../../services/userService';
import { getStoryViewers } from '../../services/storyService';
import { getUserPostLikes } from '../../services/userPostService';
import { getCommentLikes } from '../../services/commentService';
import { dragDown, fireTransitionEnd, installBottomSheetEnvironment, restoreBottomSheetEnvironment } from '../../testUtils/bottomSheet';

import UserListPopup from './UserListPopup';

jest.mock('../../services/userService');
jest.mock('../../services/storyService');
jest.mock('../../services/userPostService');
jest.mock('../../services/commentService');

const buildRow = (overrides = {}) => ({
	_id: 'user1',
	username: 'janedoe',
	followersCount: 0,
	...overrides,
});

const CurrentPath = () => <p data-testid='current-path'>{useLocation().pathname}</p>;

const renderPopup = ({
	loggedInUser = null,
	userId = 'owner',
	storyId,
	userPostId,
	commentId,
	listType = 'followers',
	jwtToken = 'token123',
	onClose = jest.fn(),
	onAccountClick,
	endSession = jest.fn(),
} = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken, loggedInUser, endSession }}>
			<MemoryRouter initialEntries={['/user/owner']}>
				<UserListPopup
					userId={userId}
					storyId={storyId}
					userPostId={userPostId}
					commentId={commentId}
					listType={listType}
					onClose={onClose}
					onAccountClick={onAccountClick}
				/>

				<CurrentPath />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onClose, endSession };
};

const getRowUsernames = (container) => Array.from(container.querySelectorAll('.search-result-username')).map((row) => row.textContent);

describe('UserListPopup', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		getFollowers.mockResolvedValue([buildRow({ _id: 'user1', username: 'janedoe' }), buildRow({ _id: 'user2', username: 'johndoe' })]);
		getFollowing.mockResolvedValue([buildRow({ _id: 'user3', username: 'followedone' })]);
	});

	describe('title and list type', () => {
		it.each([
			['followers', 'Followers'],
			['following', 'Following'],
		])('shows "%s" lists under the title "%s"', async (listType, title) => {
			renderPopup({ listType });

			expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
			await waitFor(() => expect(document.querySelector('.loading-spinner')).not.toBeInTheDocument());
		});

		it('loads the followers endpoint for the followers list', async () => {
			renderPopup({ listType: 'followers', userId: 'owner' });

			await screen.findByText('janedoe');

			expect(getFollowers).toHaveBeenCalledTimes(1);
			expect(getFollowers).toHaveBeenCalledWith({ userId: 'owner', jwtToken: 'token123' });
			expect(getFollowing).not.toHaveBeenCalled();
		});

		it('loads the following endpoint for the following list', async () => {
			renderPopup({ listType: 'following', userId: 'owner' });

			await screen.findByText('followedone');

			expect(getFollowing).toHaveBeenCalledTimes(1);
			expect(getFollowing).toHaveBeenCalledWith({ userId: 'owner', jwtToken: 'token123' });
			expect(getFollowers).not.toHaveBeenCalled();
		});
	});

	describe('the viewers list of a story', () => {
		beforeEach(() => {
			getStoryViewers.mockResolvedValue([
				buildRow({ _id: 'viewer1', username: 'alice', profilePicture: { imageUrl: 'https://example.com/alice.jpg' } }),
				buildRow({ _id: 'viewer2', username: 'bob' }),
			]);
		});

		it('is titled "Viewers"', async () => {
			renderPopup({ listType: 'viewers', storyId: 'story1' });

			expect(await screen.findByRole('heading', { name: 'Viewers' })).toBeInTheDocument();
			await screen.findByText('alice');
		});

		it('loads the viewers of the given story with the token', async () => {
			renderPopup({ listType: 'viewers', storyId: 'story1' });

			await screen.findByText('alice');

			expect(getStoryViewers).toHaveBeenCalledTimes(1);
			expect(getStoryViewers).toHaveBeenCalledWith(expect.objectContaining({ storyId: 'story1', jwtToken: 'token123' }));
			expect(getFollowers).not.toHaveBeenCalled();
			expect(getFollowing).not.toHaveBeenCalled();
		});

		it('lists each viewer by photo and username only', async () => {
			const { container } = renderPopup({ listType: 'viewers', storyId: 'story1' });

			await screen.findByText('alice');

			expect(getRowUsernames(container)).toEqual(['alice', 'bob']);
			expect(container.querySelector('img.search-result-avatar')).toHaveAttribute('src', 'https://example.com/alice.jpg');
			expect(container.querySelector('.search-result-followers')).not.toBeInTheDocument();
		});

		it('shows "No viewers yet", not "No users found", when the list is empty', async () => {
			getStoryViewers.mockResolvedValue([]);

			renderPopup({ listType: 'viewers', storyId: 'story1' });

			expect(await screen.findByText('No viewers yet')).toBeInTheDocument();
			expect(screen.queryByText('No users found')).not.toBeInTheDocument();
		});

		it('keeps "No users found" for an empty following list', async () => {
			getFollowing.mockResolvedValue([]);

			renderPopup({ listType: 'following' });

			expect(await screen.findByText('No users found')).toBeInTheDocument();
			expect(screen.queryByText('No viewers yet')).not.toBeInTheDocument();
		});

		it('offers a retry when the viewers fail to load', async () => {
			getStoryViewers.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

			renderPopup({ listType: 'viewers', storyId: 'story1' });

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			expect(await screen.findByText('alice')).toBeInTheDocument();
			expect(getStoryViewers).toHaveBeenCalledTimes(2);
		});

		it('ends the session when the token is no longer valid', async () => {
			getStoryViewers.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderPopup({ listType: 'viewers', storyId: 'story1' });

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});

		it('does not end the session for any other failure', async () => {
			getStoryViewers.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			const { endSession } = renderPopup({ listType: 'viewers', storyId: 'story1' });

			await screen.findByRole('button', { name: 'Try again' });
			expect(endSession).not.toHaveBeenCalled();
		});

		it('calls onClose from the close button', async () => {
			const { onClose } = renderPopup({ listType: 'viewers', storyId: 'story1' });

			await screen.findByText('alice');
			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	describe.each([
		['post-likes', 'userPostId', 'post1', getUserPostLikes, getCommentLikes],
		['comment-likes', 'commentId', 'comment1', getCommentLikes, getUserPostLikes],
	])('the %s list', (listType, idKey, idValue, loadLikes, otherLoadLikes) => {
		beforeEach(() => {
			loadLikes.mockResolvedValue([
				buildRow({ _id: 'liker1', username: 'newestliker', profilePicture: { imageUrl: 'https://example.com/newest.jpg' } }),
				buildRow({ _id: 'liker2', username: 'olderliker' }),
			]);
		});

		const renderLikes = (options = {}) => renderPopup({ listType, [idKey]: idValue, ...options });

		it('is titled "Likes"', async () => {
			renderLikes();

			expect(await screen.findByRole('heading', { name: 'Likes' })).toBeInTheDocument();
			await screen.findByText('newestliker');
		});

		it('loads the likes of the given id with the token, and nothing else', async () => {
			renderLikes();

			await screen.findByText('newestliker');

			expect(loadLikes).toHaveBeenCalledTimes(1);
			expect(loadLikes).toHaveBeenCalledWith(expect.objectContaining({ [idKey]: idValue, jwtToken: 'token123' }));
			expect(otherLoadLikes).not.toHaveBeenCalled();
			expect(getFollowers).not.toHaveBeenCalled();
			expect(getFollowing).not.toHaveBeenCalled();
			expect(getStoryViewers).not.toHaveBeenCalled();
		});

		it('lists the accounts in the order the server returned them, by photo and username only', async () => {
			const { container } = renderLikes();

			await screen.findByText('newestliker');

			expect(getRowUsernames(container)).toEqual(['newestliker', 'olderliker']);
			expect(container.querySelector('img.search-result-avatar')).toHaveAttribute('src', 'https://example.com/newest.jpg');
			expect(container.querySelector('.search-result-followers')).not.toBeInTheDocument();
		});

		it('links each account to its profile', async () => {
			renderLikes();

			await screen.findByText('newestliker');

			expect(screen.getByRole('link', { name: /newestliker/ })).toHaveAttribute('href', '/user/liker1');
			expect(screen.getByRole('link', { name: /olderliker/ })).toHaveAttribute('href', '/user/liker2');
		});

		it('shows "No likes yet", not "No users found", when the list is empty', async () => {
			loadLikes.mockResolvedValue([]);

			renderLikes();

			expect(await screen.findByText('No likes yet')).toBeInTheDocument();
			expect(screen.queryByText('No users found')).not.toBeInTheDocument();
		});

		it('loads once on open and does not request the list again', async () => {
			renderLikes();

			await screen.findByText('newestliker');

			expect(loadLikes).toHaveBeenCalledTimes(1);
		});

		it('is open to guests', async () => {
			renderLikes({ loggedInUser: null, jwtToken: null });

			expect(await screen.findByText('newestliker')).toBeInTheDocument();
			expect(loadLikes).toHaveBeenCalledWith(expect.objectContaining({ [idKey]: idValue, jwtToken: null }));
		});

		it('shows the inline error with a Try again button when the likes fail to load', async () => {
			loadLikes.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderLikes();

			const alert = await screen.findByRole('alert');

			expect(within(alert).getByText("Couldn't load this list")).toBeInTheDocument();
			expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
			expect(screen.queryByRole('link')).not.toBeInTheDocument();
		});

		it('keeps the title and close button while the error shows', async () => {
			loadLikes.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderLikes();

			await screen.findByRole('alert');

			expect(screen.getByRole('heading', { name: 'Likes' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
		});

		it('requests the likes again on Try again and lists them once it succeeds', async () => {
			loadLikes.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

			renderLikes();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			expect(await screen.findByText('newestliker')).toBeInTheDocument();
			expect(loadLikes).toHaveBeenCalledTimes(2);
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('leaves the session alone when the likes fail with 401, as the list is public', async () => {
			loadLikes.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderLikes();

			await screen.findByRole('button', { name: 'Try again' });
			expect(endSession).not.toHaveBeenCalled();
		});

		it('navigates to the profile and closes the popup when an account is clicked and there is no onAccountClick', async () => {
			const { onClose } = renderLikes();

			await screen.findByText('newestliker');
			userEvent.click(screen.getByRole('link', { name: /olderliker/ }));

			expect(screen.getByTestId('current-path')).toHaveTextContent('/user/liker2');
			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('calls onAccountClick instead of onClose when an account is clicked and onAccountClick is given', async () => {
			const onAccountClick = jest.fn();
			const { onClose } = renderLikes({ onAccountClick });

			await screen.findByText('newestliker');
			userEvent.click(screen.getByRole('link', { name: /newestliker/ }));

			expect(onAccountClick).toHaveBeenCalledTimes(1);
			expect(onClose).not.toHaveBeenCalled();
			expect(screen.getByTestId('current-path')).toHaveTextContent('/user/liker1');
		});

		it('calls onClose from the close button, not onAccountClick', async () => {
			const onAccountClick = jest.fn();
			const { onClose } = renderLikes({ onAccountClick });

			await screen.findByText('newestliker');
			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(onClose).toHaveBeenCalledTimes(1);
			expect(onAccountClick).not.toHaveBeenCalled();
		});
	});

	describe('loading the list', () => {
		it('shows a spinner while the request is in flight', () => {
			getFollowers.mockReturnValue(new Promise(() => {}));

			const { container } = renderPopup();

			expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
			expect(screen.queryByRole('link')).not.toBeInTheDocument();
		});

		it('replaces the spinner with the rows once loaded', async () => {
			const { container } = renderPopup();

			await screen.findByText('janedoe');

			expect(container.querySelector('.loading-spinner')).not.toBeInTheDocument();
			expect(screen.getAllByRole('link')).toHaveLength(2);
		});
	});

	describe('rows', () => {
		it('shows each user with a profile photo and a username', async () => {
			getFollowers.mockResolvedValue([
				buildRow({ _id: 'user1', username: 'janedoe', profilePicture: { imageUrl: 'https://example.com/jane.jpg' } }),
				buildRow({ _id: 'user2', username: 'johndoe' }),
			]);

			const { container } = renderPopup();

			await screen.findByText('janedoe');

			expect(container.querySelector('img.search-result-avatar')).toHaveAttribute('src', 'https://example.com/jane.jpg');
			expect(container.querySelector('svg.search-result-avatar')).toBeInTheDocument();
			expect(getRowUsernames(container)).toEqual(['janedoe', 'johndoe']);
		});

		it('links each row to that profile', async () => {
			renderPopup();

			await screen.findByText('janedoe');

			expect(screen.getByRole('link', { name: /janedoe/ })).toHaveAttribute('href', '/user/user1');
			expect(screen.getByRole('link', { name: /johndoe/ })).toHaveAttribute('href', '/user/user2');
		});

		it('shows only the photo and username on a followers row, without a follower count', async () => {
			getFollowers.mockResolvedValue([
				buildRow({ _id: 'user1', username: 'janedoe', followersCount: 1 }),
				buildRow({ _id: 'user2', username: 'johndoe', followersCount: 3 }),
			]);

			const { container } = renderPopup({ listType: 'followers' });

			await screen.findByText('janedoe');

			expect(container.querySelector('.search-result-followers')).not.toBeInTheDocument();
			expect(screen.queryByText(/follower\b|followers\b/)).not.toBeInTheDocument();
		});

		it('shows only the photo and username on a following row, without a follower count', async () => {
			getFollowing.mockResolvedValue([buildRow({ _id: 'user3', username: 'followedone', followersCount: 5 })]);

			const { container } = renderPopup({ listType: 'following' });

			await screen.findByText('followedone');

			expect(container.querySelector('.search-result-followers')).not.toBeInTheDocument();
			expect(screen.queryByText('5 followers')).not.toBeInTheDocument();
		});

		it('shows the rows in the order the server returned, which already has the logged-in user first', async () => {
			getFollowers.mockResolvedValue([
				buildRow({ _id: 'user2', username: 'me' }),
				buildRow({ _id: 'user1', username: 'janedoe' }),
				buildRow({ _id: 'user3', username: 'third' }),
			]);

			const { container } = renderPopup({ loggedInUser: { _id: 'user2' } });

			await screen.findByText('me');

			expect(getRowUsernames(container)).toEqual(['me', 'janedoe', 'third']);
		});

		it('does not reorder rows on the client', async () => {
			const { container } = renderPopup({ loggedInUser: { _id: 'user2' } });

			await screen.findByText('janedoe');

			expect(getRowUsernames(container)).toEqual(['janedoe', 'johndoe']);
		});

		it('shows "No users found" when the list is empty', async () => {
			getFollowers.mockResolvedValue([]);

			renderPopup();

			expect(await screen.findByText('No users found')).toBeInTheDocument();
		});
	});

	describe('clicking a row', () => {
		it('navigates to that profile', async () => {
			renderPopup();

			await screen.findByText('janedoe');
			userEvent.click(screen.getByRole('link', { name: /johndoe/ }));

			expect(screen.getByTestId('current-path')).toHaveTextContent('/user/user2');
		});

		it('closes the popup', async () => {
			const { onClose } = renderPopup();

			await screen.findByText('janedoe');
			userEvent.click(screen.getByRole('link', { name: /janedoe/ }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	describe('closing', () => {
		it('calls onClose from the close button', async () => {
			const { onClose } = renderPopup();

			await screen.findByText('janedoe');
			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	describe('when the list fails to load', () => {
		it('shows "Couldn\'t load this list" with a Try again button and no rows', async () => {
			getFollowers.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderPopup();

			const alert = await screen.findByRole('alert');

			expect(within(alert).getByText("Couldn't load this list")).toBeInTheDocument();
			expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
			expect(screen.queryByRole('link')).not.toBeInTheDocument();
		});

		it('shows the same error for a network failure', async () => {
			getFollowers.mockRejectedValue(new Error('network down'));

			renderPopup();

			expect(await screen.findByText("Couldn't load this list")).toBeInTheDocument();
		});

		it.each([['followers'], ['following']])('leaves the session alone when the %s list fails with 401, as before', async (listType) => {
			const loader = listType === 'followers' ? getFollowers : getFollowing;

			loader.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderPopup({ listType });

			await screen.findByRole('button', { name: 'Try again' });
			expect(endSession).not.toHaveBeenCalled();
		});

		it('shows the same error for a failing following list', async () => {
			getFollowing.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderPopup({ listType: 'following' });

			expect(await screen.findByText("Couldn't load this list")).toBeInTheDocument();
		});

		it('keeps the popup title and close button', async () => {
			getFollowing.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderPopup({ listType: 'following' });

			await screen.findByRole('alert');

			expect(screen.getByRole('heading', { name: 'Following' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
		});

		it('requests the list again when Try again is clicked and shows the rows once it succeeds', async () => {
			getFollowers.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });

			renderPopup();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			expect(await screen.findByText('janedoe')).toBeInTheDocument();
			expect(getFollowers).toHaveBeenCalledTimes(2);
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('shows a spinner instead of the error while the retry is in flight', async () => {
			getFollowers.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockReturnValueOnce(new Promise(() => {}));

			const { container } = renderPopup();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			await waitFor(() => expect(container.querySelector('.loading-spinner')).toBeInTheDocument());
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('shows the error again when the retry also fails', async () => {
			getFollowers.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderPopup();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			await waitFor(() => expect(getFollowers).toHaveBeenCalledTimes(2));
			expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
		});
	});

	describe('the bottom sheet handle', () => {
		beforeEach(() => {
			installBottomSheetEnvironment();
			getStoryViewers.mockResolvedValue([buildRow({ _id: 'v1', username: 'viewer1' })]);
		});

		afterEach(() => {
			restoreBottomSheetEnvironment();
		});

		it('is shown on the viewers list', async () => {
			const { container } = renderPopup({ listType: 'viewers', storyId: 'story1' });

			await screen.findByText('viewer1');

			expect(container.querySelector('.story-viewers-popup .bottom-sheet-handle')).toBeInTheDocument();
		});

		it.each([
			['followers', 'Followers'],
			['following', 'Following'],
		])('is not shown on the %s list', async (listType, title) => {
			const { container } = renderPopup({ listType });

			await screen.findByRole('heading', { name: title });
			await waitFor(() => expect(container.querySelector('.loading-spinner')).not.toBeInTheDocument());

			expect(container.querySelector('.bottom-sheet-handle')).not.toBeInTheDocument();
		});

		it('closes the viewers list when the handle is dragged down past 25%', async () => {
			const { container, onClose } = renderPopup({ listType: 'viewers', storyId: 'story1' });

			await screen.findByText('viewer1');
			dragDown(container.querySelector('.bottom-sheet-handle'), 120);

			expect(onClose).not.toHaveBeenCalled();

			fireTransitionEnd(container.querySelector('.story-viewers-popup .popup-body'));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes the viewers list when the Viewers title is dragged down past 25%', async () => {
			const { container, onClose } = renderPopup({ listType: 'viewers', storyId: 'story1' });

			await screen.findByText('viewer1');
			dragDown(screen.getByRole('heading', { name: 'Viewers' }), 120);
			fireTransitionEnd(container.querySelector('.story-viewers-popup .popup-body'));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('does not close when the drag starts on a viewer', async () => {
			const { container, onClose } = renderPopup({ listType: 'viewers', storyId: 'story1' });

			dragDown(await screen.findByText('viewer1'), 300);
			fireTransitionEnd(container.querySelector('.story-viewers-popup .popup-body'));

			expect(onClose).not.toHaveBeenCalled();
		});

		it('does not close the followers list on a drag from its title', async () => {
			const { container, onClose } = renderPopup({ listType: 'followers' });

			dragDown(await screen.findByRole('heading', { name: 'Followers' }), 300);
			fireTransitionEnd(container.querySelector('.popup-body'));

			expect(onClose).not.toHaveBeenCalled();
		});
	});

	describe('for a guest', () => {
		it('loads and lists the users without a logged-in user', async () => {
			renderPopup({ loggedInUser: null });

			expect(await screen.findByText('janedoe')).toBeInTheDocument();
			expect(screen.getByText('johndoe')).toBeInTheDocument();
		});
	});
});
