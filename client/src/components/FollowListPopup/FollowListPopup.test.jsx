import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getFollowers, getFollowing } from '../../services/userService';

import FollowListPopup from './FollowListPopup';

jest.mock('../../services/userService');

const buildRow = (overrides = {}) => ({
	_id: 'user1',
	username: 'janedoe',
	followersCount: 0,
	...overrides,
});

const CurrentPath = () => <p data-testid='current-path'>{useLocation().pathname}</p>;

const renderPopup = ({ loggedInUser = null, userId = 'owner', listType = 'followers', onClose = jest.fn() } = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser }}>
			<MemoryRouter initialEntries={['/user/owner']}>
				<FollowListPopup userId={userId} listType={listType} onClose={onClose} />

				<CurrentPath />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onClose };
};

const getRowUsernames = (container) => Array.from(container.querySelectorAll('.search-result-username')).map((row) => row.textContent);

describe('FollowListPopup', () => {
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

		it('shows "1 follower" in the singular and "N followers" in the plural', async () => {
			getFollowers.mockResolvedValue([
				buildRow({ _id: 'user1', username: 'janedoe', followersCount: 1 }),
				buildRow({ _id: 'user2', username: 'johndoe', followersCount: 3 }),
				buildRow({ _id: 'user3', username: 'nofollowers', followersCount: 0 }),
			]);

			renderPopup();

			expect(await screen.findByText('1 follower')).toBeInTheDocument();
			expect(screen.getByText('3 followers')).toBeInTheDocument();
			expect(screen.getByText('0 followers')).toBeInTheDocument();
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

	describe('for a guest', () => {
		it('loads and lists the users without a logged-in user', async () => {
			renderPopup({ loggedInUser: null });

			expect(await screen.findByText('janedoe')).toBeInTheDocument();
			expect(screen.getByText('johndoe')).toBeInTheDocument();
		});
	});
});
