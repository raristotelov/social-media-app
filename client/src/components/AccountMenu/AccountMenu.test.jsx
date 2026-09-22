import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { updateUserProfileData } from '../../services/userService';

import AccountMenu from './AccountMenu';

jest.mock('../../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', theme: 'light' };

const renderAccountMenu = (isOpen, props = {}) =>
	render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn() }}>
			<MemoryRouter>
				<AccountMenu isOpen={isOpen} onClose={jest.fn()} logoutHandler={jest.fn()} {...props} />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

describe('AccountMenu', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('renders the Profile, Dark mode and Log out rows when open', () => {
		renderAccountMenu(true);

		expect(screen.getByText('Profile')).toBeInTheDocument();
		expect(screen.getByText('Dark mode')).toBeInTheDocument();
		expect(screen.getByText('Log out')).toBeInTheDocument();
	});

	it('renders nothing when isOpen is false', () => {
		const { container } = renderAccountMenu(false);

		expect(container.querySelector('.account-menu')).not.toBeInTheDocument();
	});

	it('calls logoutHandler when Log out is clicked', () => {
		const logoutHandler = jest.fn();
		renderAccountMenu(true, { logoutHandler });

		userEvent.click(screen.getByRole('button', { name: 'Log out' }));

		expect(logoutHandler).toHaveBeenCalledTimes(1);
	});

	it('calls updateUserProfileData with the opposite theme when the dark mode switch is toggled', async () => {
		updateUserProfileData.mockResolvedValue({ ...loggedInUser, theme: 'dark' });

		renderAccountMenu(true);

		userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));

		await waitFor(() =>
			expect(updateUserProfileData).toHaveBeenCalledWith({
				userId: 'user1',
				jwtToken: 'token123',
				updatedProfileData: { theme: 'dark' },
			}),
		);
	});
});
