import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotificationsContext from '../../contexts/NotificationsContext';
import { getNotifications, markAllNotificationsRead } from '../../services/notificationService';
import { getUsersProfileData } from '../../services/userService';

import MainHeader from './MainHeader';

vi.mock('../../services/userService');
vi.mock('../../services/notificationService');

const member = { _id: 'user1', username: 'johndoe', following: [] };

const renderMainHeader = ({ unreadCount = 0, user = member } = {}) =>
	render(
		<LoggedInUserContext.Provider value={{ loggedInUser: user, endSession: vi.fn() }}>
			<NotificationsContext.Provider value={{ unreadCount, clearUnreadCount: vi.fn() }}>
				<MemoryRouter>
					<MainHeader logoutHandler={vi.fn()} />
				</MemoryRouter>
			</NotificationsContext.Provider>
		</LoggedInUserContext.Provider>,
	);

let user;

describe('MainHeader notifications', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		user = userEvent.setup();
		getUsersProfileData.mockResolvedValue([]);
		getNotifications.mockResolvedValue({ notifications: [], hasMore: false, nextCursor: null, unreadSince: null });
		markAllNotificationsRead.mockResolvedValue(undefined);
	});

	describe('unread dot', () => {
		it('shows the red dot on the avatar when there are unread notifications', () => {
			renderMainHeader({ unreadCount: 2 });

			expect(within(screen.getByRole('button', { name: /johndoe/ })).getByRole('img', { name: 'Unread notifications' })).toBeInTheDocument();
		});

		it('shows a single dot however many are unread', () => {
			renderMainHeader({ unreadCount: 250 });

			expect(screen.getAllByRole('img', { name: 'Unread notifications' })).toHaveLength(1);
		});

		it('shows no dot when everything is read', () => {
			renderMainHeader({ unreadCount: 0 });

			expect(screen.queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
		});

		it('shows no dot for a guest', () => {
			renderMainHeader({ user: null });

			expect(screen.queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
		});
	});

	describe('notifications popup', () => {
		const openNotifications = async () => {
			await user.click(screen.getByRole('button', { name: /johndoe/ }));
			await user.click(screen.getByRole('button', { name: 'Notifications' }));
		};

		it('is closed to begin with', () => {
			renderMainHeader();

			expect(screen.queryByRole('heading', { name: 'Notifications' })).not.toBeInTheDocument();
		});

		it('opens from the Notifications row of the account menu', async () => {
			renderMainHeader();

			await openNotifications();

			expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
			expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
		});

		it('closes the account menu when it opens', async () => {
			renderMainHeader();

			await openNotifications();

			expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
			await screen.findByText('No notifications yet');
		});

		it('closes with its close button', async () => {
			renderMainHeader();

			await openNotifications();
			await screen.findByText('No notifications yet');
			await user.click(screen.getByRole('button', { name: 'Close' }));

			expect(screen.queryByRole('heading', { name: 'Notifications' })).not.toBeInTheDocument();
		});

		it('fetches the list afresh each time it is opened', async () => {
			renderMainHeader();

			await openNotifications();
			await screen.findByText('No notifications yet');
			await user.click(screen.getByRole('button', { name: 'Close' }));
			await openNotifications();
			await screen.findByText('No notifications yet');

			expect(getNotifications).toHaveBeenCalledTimes(2);
		});
	});
});
