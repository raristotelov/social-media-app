import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotificationsContext from '../../contexts/NotificationsContext';

import AccountMenu from './AccountMenu';

vi.mock('../../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', theme: 'light' };

const renderAccountMenu = ({ unreadCount = 0, ...props } = {}) => {
	const onClose = vi.fn();
	const onNotificationsClick = vi.fn();

	const rendered = render(
		<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn() }}>
			<NotificationsContext.Provider value={{ unreadCount, clearUnreadCount: vi.fn() }}>
				<MemoryRouter>
					<AccountMenu
						isOpen
						onClose={onClose}
						logoutHandler={vi.fn()}
						onChangePasswordClick={vi.fn()}
						onNotificationsClick={onNotificationsClick}
						{...props}
					/>
				</MemoryRouter>
			</NotificationsContext.Provider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onClose, onNotificationsClick };
};

let user;

describe('AccountMenu Notifications row', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		user = userEvent.setup();
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

	it('closes the menu and calls onNotificationsClick when clicked', async () => {
		const { onClose, onNotificationsClick } = renderAccountMenu();

		await user.click(screen.getByRole('button', { name: 'Notifications' }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onNotificationsClick).toHaveBeenCalledTimes(1);
	});

	it('does not log out or change the password when clicked', async () => {
		const logoutHandler = vi.fn();
		const onChangePasswordClick = vi.fn();

		renderAccountMenu({ logoutHandler, onChangePasswordClick });

		await user.click(screen.getByRole('button', { name: 'Notifications' }));

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
