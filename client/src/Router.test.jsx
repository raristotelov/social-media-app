import '@testing-library/jest-dom';
import { Fragment } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';

import LoggedInUserContext from './contexts/LoggedInUserContext';

import Router from './Router';

jest.mock('./components/SignUpView/SignUpView', () => () => <p>Sign up view</p>);
jest.mock('./components/LoginView/LoginView', () => () => <p>Login view</p>);
jest.mock('./components/ProfileView/ProfileView', () => () => <p>Profile view</p>);
jest.mock('./components/ProfilePostsView/ProfilePostsView', () => () => <p>Profile posts view</p>);
jest.mock('./components/ProfileLayout/ProfileLayout', () => {
	const { Outlet } = require('react-router-dom');

	return () => (
		<div data-testid='profile-layout'>
			<Outlet />
		</div>
	);
});
jest.mock('./components/FeedView/FeedView', () => () => <p>Feed view</p>);
jest.mock('./components/PopularPostsLayout/PopularPostsLayout', () => {
	const { Outlet } = require('react-router-dom');

	return () => (
		<div data-testid='popular-posts-layout'>
			<Outlet />
		</div>
	);
});
jest.mock('./components/PopularPostsView/PopularPostsView', () => () => <p>Popular posts view</p>);
jest.mock('./components/PopularPostsPostsView/PopularPostsPostsView', () => () => <p>Popular posts posts view</p>);

const LocationDisplay = () => {
	const location = useLocation();
	const navigationType = useNavigationType();

	return (
		<Fragment>
			<p data-testid='location'>{location.pathname}</p>

			<p data-testid='location-from'>{location.state?.from}</p>

			<p data-testid='navigation-type'>{navigationType}</p>
		</Fragment>
	);
};

const renderRouterAt = (path, jwtToken) =>
	render(
		<LoggedInUserContext.Provider value={{ jwtToken, loggedInUser: null }}>
			<MemoryRouter initialEntries={[path]}>
				<Router />

				<LocationDisplay />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

describe('Router', () => {
	describe('opening /', () => {
		it('sends a guest to the popular posts page', () => {
			renderRouterAt('/', null);

			expect(screen.getByText('Popular posts view')).toBeInTheDocument();
			expect(screen.getByTestId('location')).toHaveTextContent(/^\/popular-posts$/);
		});

		it('does not send a guest to the login page', () => {
			renderRouterAt('/', null);

			expect(screen.queryByText('Login view')).not.toBeInTheDocument();
		});

		it('sends a logged-in user to the feed', () => {
			renderRouterAt('/', 'token123');

			expect(screen.getByText('Feed view')).toBeInTheDocument();
			expect(screen.getByTestId('location')).toHaveTextContent(/^\/user-feed$/);
		});

		it.each([
			['a guest', null],
			['a logged-in user', 'token123'],
		])('replaces / in the history for %s, so Back does not land on the redirect again', (_name, jwtToken) => {
			renderRouterAt('/', jwtToken);

			expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
		});
	});

	describe('opening /user-feed', () => {
		it('shows the feed to a logged-in user', () => {
			renderRouterAt('/user-feed', 'token123');

			expect(screen.getByText('Feed view')).toBeInTheDocument();
			expect(screen.getByTestId('location')).toHaveTextContent(/^\/user-feed$/);
		});

		it('sends a guest to the login page', () => {
			renderRouterAt('/user-feed', null);

			expect(screen.getByText('Login view')).toBeInTheDocument();
			expect(screen.getByTestId('location')).toHaveTextContent(/^\/log-in$/);
		});

		it('does not show the feed to a guest', () => {
			renderRouterAt('/user-feed', null);

			expect(screen.queryByText('Feed view')).not.toBeInTheDocument();
		});

		it('tells the login page to return the guest to /user-feed', () => {
			renderRouterAt('/user-feed', null);

			expect(screen.getByTestId('location-from')).toHaveTextContent(/^\/user-feed$/);
		});

		it('replaces /user-feed in the history for a guest, so Back does not land on the redirect again', () => {
			renderRouterAt('/user-feed', null);

			expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
		});
	});

	describe('the popular posts routes', () => {
		it.each([
			['a guest', null],
			['a logged-in user', 'token123'],
		])('shows the popular grid inside the popular layout to %s', (_name, jwtToken) => {
			renderRouterAt('/popular-posts', jwtToken);

			expect(screen.getByTestId('popular-posts-layout')).toContainElement(screen.getByText('Popular posts view'));
		});

		it.each([
			['a guest', null],
			['a logged-in user', 'token123'],
		])('shows the popular posts view inside the popular layout to %s', (_name, jwtToken) => {
			renderRouterAt('/popular-posts/posts', jwtToken);

			expect(screen.getByTestId('popular-posts-layout')).toContainElement(screen.getByText('Popular posts posts view'));
		});

		it('does not show the grid on the posts route', () => {
			renderRouterAt('/popular-posts/posts', null);

			expect(screen.queryByText('Popular posts view')).not.toBeInTheDocument();
		});

		it('does not show the posts view on the grid route', () => {
			renderRouterAt('/popular-posts', null);

			expect(screen.queryByText('Popular posts posts view')).not.toBeInTheDocument();
		});

		it('keeps the guest on the popular posts route instead of sending them to log in', () => {
			renderRouterAt('/popular-posts/posts', null);

			expect(screen.getByTestId('location')).toHaveTextContent(/^\/popular-posts\/posts$/);
		});
	});

	describe('the profile routes', () => {
		it.each([
			['a guest', null],
			['a logged-in user', 'token123'],
		])('shows the profile grid inside the profile layout to %s', (_name, jwtToken) => {
			renderRouterAt('/user/user2', jwtToken);

			expect(screen.getByTestId('profile-layout')).toContainElement(screen.getByText('Profile view'));
		});

		it.each([
			['a guest', null],
			['a logged-in user', 'token123'],
		])('shows the profile posts view inside the profile layout to %s', (_name, jwtToken) => {
			renderRouterAt('/user/user2/posts', jwtToken);

			expect(screen.getByTestId('profile-layout')).toContainElement(screen.getByText('Profile posts view'));
		});

		it('does not show the grid on the posts route', () => {
			renderRouterAt('/user/user2/posts', null);

			expect(screen.queryByText('Profile view')).not.toBeInTheDocument();
		});

		it('does not show the posts view on the grid route', () => {
			renderRouterAt('/user/user2', null);

			expect(screen.queryByText('Profile posts view')).not.toBeInTheDocument();
		});

		it('keeps the guest on the posts route instead of sending them to log in', () => {
			renderRouterAt('/user/user2/posts', null);

			expect(screen.getByTestId('location')).toHaveTextContent(/^\/user\/user2\/posts$/);
		});
	});
});
