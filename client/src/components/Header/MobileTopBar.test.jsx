import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { dragDown, fireTransitionEnd, installBottomSheetEnvironment, restoreBottomSheetEnvironment } from '../../testUtils/bottomSheet';

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

	describe('on the popular posts view', () => {
		it.each([['/popular-posts/posts'], ['/popular-posts/posts/']])('renders nothing at %s, because the Posts bar replaces it', (path) => {
			const { container } = renderTopBarAt(path);

			expect(container).toBeEmptyDOMElement();
		});

		it('renders nothing for a guest either', () => {
			const { container } = renderTopBarAt('/popular-posts/posts', null);

			expect(container).toBeEmptyDOMElement();
		});

		it('still renders the top bar on the popular grid', () => {
			renderTopBarAt('/popular-posts', null);

			expect(screen.getByRole('link')).toHaveAttribute('href', '/');
		});

		it.each([['/popular-posts/postsx'], ['/popular-posts/posts/extra'], ['/other/posts']])('still renders the top bar at %s', (path) => {
			renderTopBarAt(path);

			expect(screen.getByRole('link')).toHaveAttribute('href', '/');
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

	describe('the account menu sheet', () => {
		const openMenu = () => {
			const rendered = renderTopBarAt('/user/user1');

			userEvent.click(screen.getByRole('button', { name: 'Account menu' }));

			return {
				...rendered,
				sheet: rendered.container.querySelector('.account-menu'),
				handle: rendered.container.querySelector('.bottom-sheet-handle'),
			};
		};

		beforeEach(() => {
			installBottomSheetEnvironment();
		});

		afterEach(() => {
			restoreBottomSheetEnvironment();
		});

		it('shows the drag handle when opened', () => {
			const { sheet, handle } = openMenu();

			expect(sheet).toContainElement(handle);
		});

		it('shows no handle while the menu is closed', () => {
			const { container } = renderTopBarAt('/user/user1');

			expect(container.querySelector('.bottom-sheet-handle')).not.toBeInTheDocument();
		});

		it('closes after the handle is dragged down past 25% and the sheet has slid out', () => {
			const { sheet, handle } = openMenu();

			dragDown(handle, 120);

			expect(sheet).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute('aria-expanded', 'true');

			fireTransitionEnd(sheet);

			expect(sheet).not.toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute('aria-expanded', 'false');
		});

		it('stays open when released short of 25%', () => {
			const { sheet, handle } = openMenu();

			dragDown(handle, 40);
			fireTransitionEnd(sheet);

			expect(sheet).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute('aria-expanded', 'true');
		});

		it('stays open when the drag starts on a row', () => {
			const { sheet } = openMenu();

			dragDown(screen.getByRole('button', { name: 'Log out' }), 300);
			fireTransitionEnd(sheet);

			expect(sheet).toBeInTheDocument();
		});

		it('can be opened again after being swiped closed', () => {
			const { sheet, handle } = openMenu();

			dragDown(handle, 120);
			fireTransitionEnd(sheet);
			userEvent.click(screen.getByRole('button', { name: 'Account menu' }));

			expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
		});
	});
});
