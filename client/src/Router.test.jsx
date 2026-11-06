import { Fragment } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';

import LoggedInUserContext from './contexts/LoggedInUserContext';

import Router from './Router';

vi.mock('./components/SignUpView/SignUpView', () => ({ default: () => <p>Sign up view</p> }));
vi.mock('./components/LoginView/LoginView', () => ({ default: () => <p>Login view</p> }));
vi.mock('./components/ProfileView/ProfileView', () => ({ default: () => <p>Profile view</p> }));
vi.mock('./components/ProfilePostsView/ProfilePostsView', () => ({ default: () => <p>Profile posts view</p> }));
vi.mock('./components/ProfileLayout/ProfileLayout', async () => {
	const { Outlet } = await import('react-router');

	return {
		default: () => (
			<div data-testid='profile-layout'>
				<Outlet />
			</div>
		),
	};
});
vi.mock('./components/FeedView/FeedView', () => ({ default: () => <p>Feed view</p> }));
vi.mock('./components/PopularPostsLayout/PopularPostsLayout', async () => {
	const { Outlet } = await import('react-router');

	return {
		default: () => (
			<div data-testid='popular-posts-layout'>
				<Outlet />
			</div>
		),
	};
});
vi.mock('./components/PopularPostsView/PopularPostsView', () => ({ default: () => <p>Popular posts view</p> }));
vi.mock('./components/PopularPostsPostsView/PopularPostsPostsView', () => ({ default: () => <p>Popular posts posts view</p> }));
vi.mock('./components/NotFoundView/NotFoundView', () => ({ default: () => <p>Not found view</p> }));

const LOGGED_IN_USER = { _id: 'user1', username: 'johndoe' };

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

const renderRouterAt = (path, loggedInUser) =>
	render(
		<LoggedInUserContext.Provider value={{ loggedInUser }}>
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
			renderRouterAt('/', LOGGED_IN_USER);

			expect(screen.getByText('Feed view')).toBeInTheDocument();
			expect(screen.getByTestId('location')).toHaveTextContent(/^\/user-feed$/);
		});

		it.each([
			['a guest', null],
			['a logged-in user', LOGGED_IN_USER],
		])('replaces / in the history for %s, so Back does not land on the redirect again', (_name, loggedInUser) => {
			renderRouterAt('/', loggedInUser);

			expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
		});
	});

	describe('opening /user-feed', () => {
		it('shows the feed to a logged-in user', () => {
			renderRouterAt('/user-feed', LOGGED_IN_USER);

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
			['a logged-in user', LOGGED_IN_USER],
		])('shows the popular grid inside the popular layout to %s', (_name, loggedInUser) => {
			renderRouterAt('/popular-posts', loggedInUser);

			expect(screen.getByTestId('popular-posts-layout')).toContainElement(screen.getByText('Popular posts view'));
		});

		it.each([
			['a guest', null],
			['a logged-in user', LOGGED_IN_USER],
		])('shows the popular posts view inside the popular layout to %s', (_name, loggedInUser) => {
			renderRouterAt('/popular-posts/posts', loggedInUser);

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

	describe('an unknown route', () => {
		it.each([
			['a guest', null],
			['a logged-in user', LOGGED_IN_USER],
		])('shows the 404 page to %s', (_name, loggedInUser) => {
			renderRouterAt('/no/such/page', loggedInUser);

			expect(screen.getByText('Not found view')).toBeInTheDocument();
		});

		it('keeps the URL as typed instead of redirecting', () => {
			renderRouterAt('/no/such/page', null);

			expect(screen.getByTestId('location')).toHaveTextContent(/^\/no\/such\/page$/);
		});

		it.each([['/popular-posts/unknown'], ['/user'], ['/user/user2/unknown']])('shows the 404 page at the near-miss path %s', (path) => {
			renderRouterAt(path, LOGGED_IN_USER);

			expect(screen.getByText('Not found view')).toBeInTheDocument();
		});

		it.each([['/'], ['/user-feed'], ['/popular-posts'], ['/user/user2'], ['/user/user2/posts']])(
			'does not show the 404 page at the known route %s',
			(path) => {
				renderRouterAt(path, LOGGED_IN_USER);

				expect(screen.queryByText('Not found view')).not.toBeInTheDocument();
			},
		);
	});

	describe('the profile routes', () => {
		it.each([
			['a guest', null],
			['a logged-in user', LOGGED_IN_USER],
		])('shows the profile grid inside the profile layout to %s', (_name, loggedInUser) => {
			renderRouterAt('/user/user2', loggedInUser);

			expect(screen.getByTestId('profile-layout')).toContainElement(screen.getByText('Profile view'));
		});

		it.each([
			['a guest', null],
			['a logged-in user', LOGGED_IN_USER],
		])('shows the profile posts view inside the profile layout to %s', (_name, loggedInUser) => {
			renderRouterAt('/user/user2/posts', loggedInUser);

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
