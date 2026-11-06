import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotificationsContext from '../../contexts/NotificationsContext';

import AccountMenu from './AccountMenu';

jest.mock('../../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', theme: 'light' };

const renderAccountMenu = ({ unreadCount = 0, ...props } = {}) => {
	const onClose = jest.fn();
	const onNotificationsClick = jest.fn();

	const rendered = render(
		<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: jest.fn() }}>
			<NotificationsContext.Provider value={{ unreadCount, clearUnreadCount: jest.fn() }}>
				<MemoryRouter>
					<AccountMenu
						isOpen
						onClose={onClose}
						logoutHandler={jest.fn()}
						onChangePasswordClick={jest.fn()}
						onNotificationsClick={onNotificationsClick}
						{...props}
					/>
				</MemoryRouter>
			</NotificationsContext.Provider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onClose, onNotificationsClick };
};

describe('AccountMenu Notifications row', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('sits directly under Profile', () => {
		renderAccountMenu();

		const rowLabels = screen.getAllByText(/^(Profile|Notifications|Dark mode|Change password|Log out)$/).map((row) => row.textContent);

		expect(rowLabels).toEqual(['Profile', 'Notifications', 'Dark mode', 'Change password', 'Log out']);
	});

	it('is a button', () => {
		renderAccountMenu();

		expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('type', 'button');
	});

	it('closes the menu and calls onNotificationsClick when clicked', () => {
		const { onClose, onNotificationsClick } = renderAccountMenu();

		userEvent.click(screen.getByRole('button', { name: 'Notifications' }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onNotificationsClick).toHaveBeenCalledTimes(1);
	});

	it('does not log out or change the password when clicked', () => {
		const logoutHandler = jest.fn();
		const onChangePasswordClick = jest.fn();

		renderAccountMenu({ logoutHandler, onChangePasswordClick });

		userEvent.click(screen.getByRole('button', { name: 'Notifications' }));

		expect(logoutHandler).not.toHaveBeenCalled();
		expect(onChangePasswordClick).not.toHaveBeenCalled();
	});

	describe('unread badge', () => {
		it('shows no badge when everything is read', () => {
			const { container } = renderAccountMenu({ unreadCount: 0 });

			expect(container.querySelector('.account-menu-badge')).not.toBeInTheDocument();
		});

		it('shows the unread count', () => {
			const { container } = renderAccountMenu({ unreadCount: 7 });

			expect(container.querySelector('.account-menu-badge')).toHaveTextContent('7');
		});

		it('shows a count of one', () => {
			const { container } = renderAccountMenu({ unreadCount: 1 });

			expect(container.querySelector('.account-menu-badge')).toHaveTextContent('1');
		});

		it('shows 99 as it is', () => {
			const { container } = renderAccountMenu({ unreadCount: 99 });

			expect(container.querySelector('.account-menu-badge')).toHaveTextContent(/^99$/);
		});

		it.each([[100], [101], [5000]])('caps %i at 99+', (unreadCount) => {
			const { container } = renderAccountMenu({ unreadCount });

			expect(container.querySelector('.account-menu-badge')).toHaveTextContent(/^99\+$/);
		});

		it('is inside the Notifications row, not another row', () => {
			renderAccountMenu({ unreadCount: 7 });

			expect(screen.getByRole('button', { name: /Notifications/ })).toHaveTextContent('Notifications7');
			expect(screen.getByRole('button', { name: 'Dark mode' })).not.toHaveTextContent('7');
		});
	});
});
