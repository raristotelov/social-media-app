import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getUsersProfileData } from '../../services/userService';

import MainHeader from './MainHeader';

jest.mock('../../services/userService');

const renderMainHeader = (loggedInUser, logoutHandler = jest.fn(), searchResults = []) => {
	getUsersProfileData.mockResolvedValue(searchResults);

	return render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser }}>
			<MemoryRouter>
				<MainHeader logoutHandler={logoutHandler} />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);
};

describe('MainHeader', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('shows Log in and Sign up links, and still renders the search field, for a guest', () => {
		renderMainHeader(null);

		expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
		expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
	});

	it("shows the logged-in user's username, the account menu trigger and the Feed/Popular navigation", () => {
		const { container } = renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] });

		expect(screen.getByText('johndoe')).toBeInTheDocument();
		expect(container.querySelector('[aria-haspopup="menu"]')).toBeInTheDocument();
		expect(screen.getByText('Feed')).toBeInTheDocument();
		expect(screen.getByText('Popular')).toBeInTheDocument();
	});

	it('calls getUsersProfileData with the search word once at least two characters have been typed', async () => {
		renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] });

		userEvent.type(screen.getByPlaceholderText('Search'), 'ab');

		await waitFor(() => expect(getUsersProfileData).toHaveBeenCalledWith({ searchWord: 'ab', jwtToken: 'token123' }));
	});

	describe('search dropdown', () => {
		const searchResults = [
			{ _id: 'user2', username: 'janedoe', followers: ['user3', 'user4'] },
			{ _id: 'user5', username: 'janet', followers: [] },
		];

		it('renders the designed result rows with username and follower count', async () => {
			const { container } = renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] }, jest.fn(), searchResults);

			userEvent.type(screen.getByPlaceholderText('Search'), 'jan');

			expect(await screen.findByText('janedoe')).toHaveClass('search-result-username');
			expect(screen.getByText('2 followers')).toHaveClass('search-result-followers');
			expect(screen.getByText('janet')).toBeInTheDocument();
			expect(screen.getByText('0 followers')).toBeInTheDocument();
			expect(container.querySelectorAll('.search-results-dropdown .search-result')).toHaveLength(2);
		});

		it('uses the singular for a user with exactly one follower', async () => {
			renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] }, jest.fn(), [
				{ _id: 'user2', username: 'janedoe', followers: ['user3'] },
			]);

			userEvent.type(screen.getByPlaceholderText('Search'), 'jan');

			expect(await screen.findByText('1 follower')).toHaveClass('search-result-followers');
		});

		it('links each row to the matching profile', async () => {
			renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] }, jest.fn(), searchResults);

			userEvent.type(screen.getByPlaceholderText('Search'), 'jan');

			expect((await screen.findByText('janedoe')).closest('a')).toHaveAttribute('href', '/user/user2');
		});

		it('shows the designed empty state when nothing matches', async () => {
			renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] });

			userEvent.type(screen.getByPlaceholderText('Search'), 'zz');

			expect(await screen.findByText('No users found')).toBeInTheDocument();
		});

		it('shows the dropdown to a guest as well', async () => {
			renderMainHeader(null, jest.fn(), searchResults);

			userEvent.type(screen.getByPlaceholderText('Search'), 'jan');

			expect(await screen.findByText('2 followers')).toBeInTheDocument();
		});

		it('closes the dropdown and clears the field when a row is clicked', async () => {
			renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] }, jest.fn(), searchResults);

			userEvent.type(screen.getByPlaceholderText('Search'), 'jan');
			userEvent.click(await screen.findByText('janedoe'));

			expect(screen.queryByText('2 followers')).not.toBeInTheDocument();
			expect(screen.getByPlaceholderText('Search')).toHaveValue('');
		});
	});

	describe('navigation icons', () => {
		it('draws the Feed and Popular icons in currentColor so they follow the theme', () => {
			renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] });

			expect(screen.getByRole('link', { name: 'Feed' }).querySelector('svg')).toHaveAttribute('stroke', 'currentColor');
			expect(screen.getByRole('link', { name: 'Popular' }).querySelector('svg')).toHaveAttribute('stroke', 'currentColor');
		});
	});
});
