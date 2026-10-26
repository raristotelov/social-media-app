import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import { getUsersProfileData } from '../../services/userService';

import MainHeader from './MainHeader';

jest.mock('../../services/userService');

const renderMainHeader = (loggedInUser, logoutHandler = jest.fn(), searchResults = [], path = '/') => {
	getUsersProfileData.mockResolvedValue(searchResults);

	return render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser }}>
			<MemoryRouter initialEntries={[path]}>
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
			{ _id: 'user2', username: 'janedoe', followersCount: 2 },
			{ _id: 'user5', username: 'janet', followersCount: 0 },
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
				{ _id: 'user2', username: 'janedoe', followersCount: 1 },
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

	describe('the Popular link', () => {
		const member = { _id: 'user1', username: 'johndoe', following: [] };

		it('is shown to a guest, next to Log in and Sign up', () => {
			renderMainHeader(null);

			expect(screen.getByRole('link', { name: 'Popular' })).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
		});

		it('comes before Log in and Sign up for a guest', () => {
			renderMainHeader(null);

			const links = screen.getAllByRole('link').map((link) => link.textContent);

			expect(links.indexOf('Popular')).toBeLessThan(links.indexOf('Log in'));
			expect(links.indexOf('Log in')).toBeLessThan(links.indexOf('Sign up'));
		});

		it('keeps Log in and Sign up together in their own group for a guest', () => {
			const { container } = renderMainHeader(null);

			const authActions = container.querySelector('.navigation-auth-actions');

			expect(
				within(authActions)
					.getAllByRole('link')
					.map((link) => link.textContent),
			).toEqual(['Log in', 'Sign up']);
		});

		it('is shown to a guest without the Feed link', () => {
			renderMainHeader(null);

			expect(screen.queryByRole('link', { name: 'Feed' })).not.toBeInTheDocument();
		});

		it.each([
			['a guest', null],
			['a member', member],
		])('goes to /popular-posts for %s', (_name, user) => {
			renderMainHeader(user);

			expect(screen.getByRole('link', { name: 'Popular' })).toHaveAttribute('href', '/popular-posts');
		});

		it.each([
			['a guest', null],
			['a member', member],
		])('is current on the popular grid for %s', (_name, user) => {
			renderMainHeader(user, jest.fn(), [], '/popular-posts');

			expect(screen.getByRole('link', { name: 'Popular' })).toHaveClass('navigation-item-active');
		});

		it.each([
			['a guest', null],
			['a member', member],
		])('is current on the popular posts view for %s', (_name, user) => {
			renderMainHeader(user, jest.fn(), [], '/popular-posts/posts');

			expect(screen.getByRole('link', { name: 'Popular' })).toHaveClass('navigation-item-active');
		});

		it.each([
			['a guest', null, '/log-in'],
			['a guest', null, '/sign-up'],
			['a member', member, '/user-feed'],
			['a member', member, '/user/user1'],
			['a member', member, '/user/user2/posts'],
		])('is not current for %s at %s', (_name, user, path) => {
			renderMainHeader(user, jest.fn(), [], path);

			expect(screen.getByRole('link', { name: 'Popular' })).not.toHaveClass('navigation-item-active');
		});

		it('marks Log in as current at /log-in, not Popular', () => {
			renderMainHeader(null, jest.fn(), [], '/log-in');

			expect(screen.getByRole('link', { name: 'Log in' })).toHaveClass('navigation-item-active');
		});
	});

	describe('Change password', () => {
		const renderLoggedInHeader = () => {
			getUsersProfileData.mockResolvedValue([]);

			return render(
				<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser: { _id: 'user1', username: 'johndoe', following: [] } }}>
					<ToastContext.Provider value={{ showToast: jest.fn(), dismissToast: jest.fn() }}>
						<MemoryRouter>
							<MainHeader logoutHandler={jest.fn()} />
						</MemoryRouter>
					</ToastContext.Provider>
				</LoggedInUserContext.Provider>,
			);
		};

		it('opens the Change Password popup from the account menu and closes the menu', () => {
			renderLoggedInHeader();

			userEvent.click(screen.getByRole('button', { name: /johndoe/ }));
			userEvent.click(screen.getByRole('button', { name: 'Change password' }));

			expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
		});

		it('closes the popup again with Cancel', () => {
			renderLoggedInHeader();

			userEvent.click(screen.getByRole('button', { name: /johndoe/ }));
			userEvent.click(screen.getByRole('button', { name: 'Change password' }));
			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(screen.queryByRole('heading', { name: 'Change Password' })).not.toBeInTheDocument();
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
