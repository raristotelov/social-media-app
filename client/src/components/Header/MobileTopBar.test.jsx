import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';

import MobileTopBar from './MobileTopBar';

jest.mock('../../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', following: [] };

const renderTopBarAt = (path, user = loggedInUser) =>
	render(
		<LoggedInUserContext.Provider value={{ jwtToken: user ? 'token123' : null, loggedInUser: user }}>
			<MemoryRouter initialEntries={[path]}>
				<MobileTopBar logoutHandler={jest.fn()} />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

describe('MobileTopBar', () => {
	describe('on the profile posts view', () => {
		it.each([['/user/user2/posts'], ['/user/user2/posts/'], ['/user/user1/posts']])(
			'renders nothing at %s, because the Posts bar replaces it',
			(path) => {
				const { container } = renderTopBarAt(path);

				expect(container).toBeEmptyDOMElement();
			},
		);

		it('renders nothing for a guest either', () => {
			const { container } = renderTopBarAt('/user/user2/posts', null);

			expect(container).toBeEmptyDOMElement();
		});

		it('hides the logo', () => {
			renderTopBarAt('/user/user2/posts');

			expect(screen.queryByRole('link')).not.toBeInTheDocument();
		});
	});

	describe('elsewhere', () => {
		it.each([['/user-feed'], ['/popular-posts'], ['/user/user2'], ['/user/user1']])('renders the top bar at %s', (path) => {
			renderTopBarAt(path);

			expect(screen.getByRole('link')).toHaveAttribute('href', '/');
		});

		it('offers search on the feed', () => {
			renderTopBarAt('/user-feed');

			expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
		});

		it('offers the account menu on your own profile grid', () => {
			renderTopBarAt('/user/user1');

			expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
		});
	});
});
