import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotFoundContext from '../../contexts/NotFoundContext';
import NotificationsContext from '../../contexts/NotificationsContext';
import { getNotifications, markAllNotificationsRead } from '../../services/notificationService';

import MobileTopBar from './MobileTopBar';

vi.mock('../../services/userService');
vi.mock('../../services/notificationService');

const loggedInUser = { _id: 'user1', username: 'johndoe', following: [] };

const renderTopBarAt = (path, { unreadCount = 0, user = loggedInUser } = {}) =>
	render(
		<LoggedInUserContext.Provider value={{ loggedInUser: user, endSession: vi.fn() }}>
			<NotFoundContext.Provider value={{ isNotFound: false, setIsNotFound: vi.fn() }}>
				<NotificationsContext.Provider value={{ unreadCount, clearUnreadCount: vi.fn() }}>
					<MemoryRouter initialEntries={[path]}>
						<MobileTopBar logoutHandler={vi.fn()} />
					</MemoryRouter>
				</NotificationsContext.Provider>
			</NotFoundContext.Provider>
		</LoggedInUserContext.Provider>,
	);

let user;

describe('MobileTopBar notifications', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		user = userEvent.setup();
		getNotifications.mockResolvedValue({ notifications: [], hasMore: false, nextCursor: null, unreadSince: null });
		markAllNotificationsRead.mockResolvedValue(undefined);
	});

	describe('unread dot on the burger', () => {
		it('shows the dot on the burger of your own profile when there are unread notifications', () => {
			renderTopBarAt('/user/user1', { unreadCount: 2 });

			expect(
				within(screen.getByRole('button', { name: 'Account menu' })).getByRole('img', { name: 'Unread notifications' }),
			).toBeInTheDocument();
		});

		it('shows no dot on the burger when everything is read', () => {
			renderTopBarAt('/user/user1', { unreadCount: 0 });

			expect(screen.queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
		});

		it.each([['/user-feed'], ['/popular-posts']])('shows no dot at %s, where the trailing action is search', (path) => {
			renderTopBarAt(path, { unreadCount: 2 });

			expect(screen.queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
		});

		it("shows no dot on someone else's profile, which has no burger", () => {
			renderTopBarAt('/user/user2', { unreadCount: 2 });

			expect(screen.queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
		});

		it('shows no dot for a guest', () => {
			renderTopBarAt('/popular-posts', { unreadCount: 2, user: null });

			expect(screen.queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
		});
	});

	describe('the full-screen list', () => {
		const openNotifications = async () => {
			await user.click(screen.getByRole('button', { name: 'Account menu' }));
			await user.click(screen.getByRole('button', { name: 'Notifications' }));
		};

		it('opens from the Notifications row of the account menu sheet and closes the sheet', async () => {
			renderTopBarAt('/user/user1');

			await openNotifications();

			expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
			await screen.findByText('No notifications yet');
		});

		it('closes again with its close button', async () => {
			renderTopBarAt('/user/user1');

			await openNotifications();
			await screen.findByText('No notifications yet');
			await user.click(screen.getByRole('button', { name: 'Close' }));

			expect(screen.queryByRole('heading', { name: 'Notifications' })).not.toBeInTheDocument();
		});
	});
});
