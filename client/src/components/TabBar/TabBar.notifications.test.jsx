import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotificationsContext from '../../contexts/NotificationsContext';

import TabBar from './TabBar';

const member = { _id: 'user1', username: 'johndoe', following: [] };

const renderTabBar = ({ unreadCount = 0, user = member, path = '/user-feed' } = {}) =>
	render(
		<LoggedInUserContext.Provider value={{ jwtToken: user ? 'token123' : null, loggedInUser: user }}>
			<NotificationsContext.Provider value={{ unreadCount, clearUnreadCount: jest.fn() }}>
				<MemoryRouter initialEntries={[path]}>
					<TabBar />
				</MemoryRouter>
			</NotificationsContext.Provider>
		</LoggedInUserContext.Provider>,
	);

describe('TabBar unread dot', () => {
	it('shows the dot on the profile photo when there are unread notifications', () => {
		renderTabBar({ unreadCount: 4 });

		expect(within(screen.getByRole('link', { name: /Profile/ })).getByRole('img', { name: 'Unread notifications' })).toBeInTheDocument();
	});

	it('shows the dot only on the Profile tab, not on Feed or Popular', () => {
		renderTabBar({ unreadCount: 4 });

		expect(within(screen.getByRole('link', { name: 'Feed' })).queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
		expect(within(screen.getByRole('link', { name: 'Popular' })).queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
	});

	it('shows a single dot however many are unread', () => {
		renderTabBar({ unreadCount: 250 });

		expect(screen.getAllByRole('img', { name: 'Unread notifications' })).toHaveLength(1);
	});

	it('shows no dot when everything is read', () => {
		renderTabBar({ unreadCount: 0 });

		expect(screen.queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
	});

	it('shows no dot for a guest', () => {
		renderTabBar({ user: null, unreadCount: 3, path: '/popular-posts' });

		expect(screen.queryByRole('img', { name: 'Unread notifications' })).not.toBeInTheDocument();
	});

	it('still links the Profile tab to the user profile', () => {
		renderTabBar({ unreadCount: 4 });

		expect(screen.getByRole('link', { name: /Profile/ })).toHaveAttribute('href', '/user/user1');
	});
});
