import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotFoundContext from '../../contexts/NotFoundContext';
import ToastContext from '../../contexts/ToastContext';
import { dragDown, fireTransitionEnd, installBottomSheetEnvironment, restoreBottomSheetEnvironment } from '../../testUtils/bottomSheet';

import MobileTopBar from './MobileTopBar';

vi.mock('../../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', following: [] };

const renderTopBarAt = (path, user = loggedInUser, isNotFound = false) =>
	render(
		<LoggedInUserContext.Provider value={{ loggedInUser: user }}>
			<NotFoundContext.Provider value={{ isNotFound, setIsNotFound: vi.fn() }}>
				<MemoryRouter initialEntries={[path]}>
					<MobileTopBar logoutHandler={vi.fn()} />
				</MemoryRouter>
			</NotFoundContext.Provider>
		</LoggedInUserContext.Provider>,
	);

let user;

describe('MobileTopBar', () => {
	beforeEach(() => {
		user = userEvent.setup();
	});

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

	describe('while a 404 page is showing', () => {
		it.each([['/some/unknown/path'], ['/user/missing'], ['/user/missing/posts'], ['/user/missing/posts/']])('offers search at %s', (path) => {
			renderTopBarAt(path, loggedInUser, true);

			expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
		});

		it('offers search to a guest too', () => {
			renderTopBarAt('/user/missing', null, true);

			expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
		});

		it('is not hidden on a profile posts path', () => {
			renderTopBarAt('/user/missing/posts', loggedInUser, true);

			expect(screen.getByRole('link')).toHaveAttribute('href', '/');
		});

		it('offers no search on someone else profile when no 404 is showing', () => {
			renderTopBarAt('/user/user2', loggedInUser, false);

			expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
		});

		it('opens the search field from the Search action', async () => {
			renderTopBarAt('/some/unknown/path', loggedInUser, true);

			await user.click(screen.getByRole('button', { name: 'Search' }));

			expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
		});
	});

	describe('Change password', () => {
		const renderOwnProfileTopBar = () =>
			render(
				<LoggedInUserContext.Provider value={{ loggedInUser }}>
					<NotFoundContext.Provider value={{ isNotFound: false, setIsNotFound: vi.fn() }}>
						<ToastContext.Provider value={{ showToast: vi.fn(), dismissToast: vi.fn() }}>
							<MemoryRouter initialEntries={['/user/user1']}>
								<MobileTopBar logoutHandler={vi.fn()} />
							</MemoryRouter>
						</ToastContext.Provider>
					</NotFoundContext.Provider>
				</LoggedInUserContext.Provider>,
			);

		it('opens the Change Password popup from the account menu sheet and closes the sheet', async () => {
			renderOwnProfileTopBar();

			await user.click(screen.getByRole('button', { name: 'Account menu' }));
			await user.click(screen.getByRole('button', { name: 'Change password' }));

			expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
		});

		it('closes the popup again with Cancel', async () => {
			renderOwnProfileTopBar();

			await user.click(screen.getByRole('button', { name: 'Account menu' }));
			await user.click(screen.getByRole('button', { name: 'Change password' }));
			await user.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(screen.queryByRole('heading', { name: 'Change Password' })).not.toBeInTheDocument();
		});
	});

	describe('the account menu sheet', () => {
		const openMenu = async () => {
			const rendered = renderTopBarAt('/user/user1');

			await user.click(screen.getByRole('button', { name: 'Account menu' }));

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

		it('shows the drag handle when opened', async () => {
			const { sheet, handle } = await openMenu();

			expect(sheet).toContainElement(handle);
		});

		it('shows no handle while the menu is closed', () => {
			const { container } = renderTopBarAt('/user/user1');

			expect(container.querySelector('.bottom-sheet-handle')).not.toBeInTheDocument();
		});

		it('closes after the handle is dragged down past 25% and the sheet has slid out', async () => {
			const { sheet, handle } = await openMenu();

			dragDown(handle, 120);

			expect(sheet).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute('aria-expanded', 'true');

			fireTransitionEnd(sheet);

			expect(sheet).not.toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute('aria-expanded', 'false');
		});

		it('stays open when released short of 25%', async () => {
			const { sheet, handle } = await openMenu();

			dragDown(handle, 40);
			fireTransitionEnd(sheet);

			expect(sheet).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute('aria-expanded', 'true');
		});

		it('stays open when the drag starts on a row', async () => {
			const { sheet } = await openMenu();

			dragDown(screen.getByRole('button', { name: 'Log out' }), 300);
			fireTransitionEnd(sheet);

			expect(sheet).toBeInTheDocument();
		});

		it('can be opened again after being swiped closed', async () => {
			const { sheet, handle } = await openMenu();

			dragDown(handle, 120);
			fireTransitionEnd(sheet);
			await user.click(screen.getByRole('button', { name: 'Account menu' }));

			expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
		});
	});
});
