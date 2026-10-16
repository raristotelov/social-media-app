import '@testing-library/jest-dom';
import { Fragment } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';

import LoggedInUserContext from './contexts/LoggedInUserContext';

import Router from './Router';

jest.mock('./components/SignUpView/SignUpView', () => () => <p>Sign up view</p>);
jest.mock('./components/LoginView/LoginView', () => () => <p>Login view</p>);
jest.mock('./components/ProfileView/ProfileView', () => () => <p>Profile view</p>);
jest.mock('./components/FeedView/FeedView', () => () => <p>Feed view</p>);
jest.mock('./components/PopularPostsView/PopularPostsView', () => () => <p>Popular posts view</p>);

const LocationDisplay = () => {
	const location = useLocation();
	const navigationType = useNavigationType();

	return (
		<Fragment>
			<p data-testid='location'>{location.pathname}</p>

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
});
