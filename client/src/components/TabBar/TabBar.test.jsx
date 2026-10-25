import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';

import TabBar from './TabBar';

const member = { _id: 'user1', username: 'johndoe', following: [] };

const renderTabBarAt = (path, user = member) =>
	render(
		<LoggedInUserContext.Provider value={{ jwtToken: user ? 'token123' : null, loggedInUser: user }}>
			<MemoryRouter initialEntries={[path]}>
				<TabBar />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

describe('TabBar', () => {
	describe('for a guest', () => {
		it('shows Popular, Log in and Sign up, in that order', () => {
			renderTabBarAt('/popular-posts', null);

			expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Popular', 'Log in', 'Sign up']);
		});

		it('sends Popular to /popular-posts', () => {
			renderTabBarAt('/log-in', null);

			expect(screen.getByRole('link', { name: 'Popular' })).toHaveAttribute('href', '/popular-posts');
		});

		it.each([['/popular-posts'], ['/popular-posts/posts']])('marks Popular as current at %s', (path) => {
			renderTabBarAt(path, null);

			expect(screen.getByRole('link', { name: 'Popular' })).toHaveClass('tab-bar-item-active');
		});

		it.each([['/log-in'], ['/sign-up'], ['/user/user2']])('does not mark Popular as current at %s', (path) => {
			renderTabBarAt(path, null);

			expect(screen.getByRole('link', { name: 'Popular' })).not.toHaveClass('tab-bar-item-active');
		});

		it('marks Log in as current at /log-in and leaves Popular unmarked', () => {
			renderTabBarAt('/log-in', null);

			expect(screen.getByRole('link', { name: 'Log in' })).toHaveClass('tab-bar-item-active');
			expect(screen.getByRole('link', { name: 'Popular' })).not.toHaveClass('tab-bar-item-active');
		});

		it('shows no Feed or Profile tab', () => {
			renderTabBarAt('/popular-posts', null);

			expect(screen.queryByRole('link', { name: 'Feed' })).not.toBeInTheDocument();
			expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
		});
	});

	describe('for a member', () => {
		it('shows Feed, Popular and Profile, in that order', () => {
			renderTabBarAt('/user-feed');

			expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Feed', 'Popular', 'Profile']);
		});

		it('sends Popular to /popular-posts and Profile to their own profile', () => {
			renderTabBarAt('/user-feed');

			expect(screen.getByRole('link', { name: 'Popular' })).toHaveAttribute('href', '/popular-posts');
			expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/user/user1');
		});

		it.each([['/popular-posts'], ['/popular-posts/posts']])('marks Popular as current at %s', (path) => {
			renderTabBarAt(path);

			expect(screen.getByRole('link', { name: 'Popular' })).toHaveClass('tab-bar-item-active');
		});

		it('marks only Popular as current on the popular posts view', () => {
			renderTabBarAt('/popular-posts/posts');

			expect(screen.getByRole('link', { name: 'Feed' })).not.toHaveClass('tab-bar-item-active');
			expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveClass('tab-bar-item-active');
		});

		it.each([['/user-feed'], ['/user/user1'], ['/user/user2/posts']])('does not mark Popular as current at %s', (path) => {
			renderTabBarAt(path);

			expect(screen.getByRole('link', { name: 'Popular' })).not.toHaveClass('tab-bar-item-active');
		});

		it('marks Feed as current at /user-feed', () => {
			renderTabBarAt('/user-feed');

			expect(screen.getByRole('link', { name: 'Feed' })).toHaveClass('tab-bar-item-active');
		});

		it('marks Profile as current on their own profile', () => {
			renderTabBarAt('/user/user1');

			expect(screen.getByRole('link', { name: 'Profile' })).toHaveClass('tab-bar-item-active');
		});

		it('shows no Log in or Sign up tab', () => {
			renderTabBarAt('/popular-posts');

			expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
			expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
		});
	});
});
