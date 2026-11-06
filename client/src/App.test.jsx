import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';

import { APP_NAME } from './constants/app';
import ToastContext from './contexts/ToastContext';
import { getUnreadNotificationCount } from './services/notificationService';
import { getCurrentUser, logout } from './services/userService';

import App from './App';

const mockSeenEndSessions = [];

vi.mock('./components/DemoStrip/DemoStrip', () => ({ default: () => <aside>Demo strip</aside> }));
vi.mock('./components/Header/MainHeader', () => ({
	default: ({ logoutHandler }) => (
		<header>
			<button type='button' onClick={logoutHandler}>
				Log out
			</button>
		</header>
	),
}));
vi.mock('./components/Header/MobileTopBar', () => ({ default: () => <header>Mobile top bar</header> }));
vi.mock('./components/TabBar/TabBar', () => ({ default: () => <nav>Tab bar</nav> }));
vi.mock('./Router', async () => {
	const { useContext } = await import('react');
	const { useNavigate } = await import('react-router');
	const { default: LoggedInUserContext } = await import('./contexts/LoggedInUserContext');

	return {
		default: function MockRouter() {
			const { endSession, loggedInUser, updateLoggedInUser } = useContext(LoggedInUserContext);
			const navigate = useNavigate();

			mockSeenEndSessions.push(endSession);

			return (
				<main>
					<p data-testid='user'>{loggedInUser ? loggedInUser.username : 'guest'}</p>

					<button type='button' onClick={() => navigate('/popular-posts')}>
						Go to popular
					</button>

					<button type='button' onClick={() => navigate('/popular-posts/posts')}>
						Go to posts view
					</button>

					<button type='button' onClick={endSession}>
						End session
					</button>

					<button type='button' onClick={() => updateLoggedInUser({ user: { _id: 'user1', username: 'renamed' } })}>
						Update user
					</button>
				</main>
			);
		},
	};
});
vi.mock('./services/userService');
vi.mock('./services/notificationService');

const LocationProbe = () => <p data-testid='path'>{useLocation().pathname}</p>;

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const showToast = vi.fn();

const renderApp = (initialEntries = ['/']) =>
	render(
		<ToastContext.Provider value={{ showToast }}>
			<MemoryRouter initialEntries={initialEntries}>
				<App />

				<LocationProbe />
			</MemoryRouter>
		</ToastContext.Provider>,
	);

let user;

describe('App', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		user = userEvent.setup();
		mockSeenEndSessions.length = 0;
		window.localStorage.clear();
		document.title = '';
		window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
		getCurrentUser.mockResolvedValue(null);
		logout.mockResolvedValue({});
		getUnreadNotificationCount.mockResolvedValue({ count: 0 });
	});

	it('sets the tab title from the app name constant', async () => {
		renderApp();

		await waitFor(() => expect(document.title).toBe(APP_NAME));
	});

	describe('restoring the session', () => {
		it('asks the server who is logged in, once, without passing a token', async () => {
			renderApp();

			await screen.findByTestId('user');

			expect(getCurrentUser).toHaveBeenCalledTimes(1);
			expect(getCurrentUser).toHaveBeenCalledWith();
		});

		it('shows a loading state, not the app, until the server has answered', async () => {
			const request = buildDeferred();

			getCurrentUser.mockReturnValue(request.promise);

			renderApp();

			expect(screen.queryByTestId('user')).not.toBeInTheDocument();

			await act(async () => request.resolve(null));

			expect(screen.getByTestId('user')).toBeInTheDocument();
		});

		it('logs the user in with the profile the server returned', async () => {
			getCurrentUser.mockResolvedValue({ _id: 'user1', username: 'johndoe' });

			renderApp();

			expect(await screen.findByTestId('user')).toHaveTextContent('johndoe');
		});

		it('leaves a guest when the server answers null', async () => {
			getCurrentUser.mockResolvedValue(null);

			renderApp();

			expect(await screen.findByTestId('user')).toHaveTextContent('guest');
		});

		it('leaves a clean guest, with no toast and no redirect, when the session is expired', async () => {
			getCurrentUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			renderApp(['/popular-posts']);

			expect(await screen.findByTestId('user')).toHaveTextContent('guest');
			expect(showToast).not.toHaveBeenCalled();
			expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts');
		});

		it('leaves a guest when the server cannot be reached', async () => {
			getCurrentUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 0 });

			renderApp();

			expect(await screen.findByTestId('user')).toHaveTextContent('guest');
		});

		it('ignores an answer that arrives after the app unmounted', async () => {
			const request = buildDeferred();

			getCurrentUser.mockReturnValue(request.promise);

			const { unmount } = renderApp();

			unmount();

			await act(async () => request.resolve({ _id: 'user1', username: 'johndoe' }));

			expect(screen.queryByTestId('user')).not.toBeInTheDocument();
		});

		it('does not read a token from localStorage, even if an old one is left there', async () => {
			window.localStorage.setItem('jwt-token', JSON.stringify('stale.jwt.token'));

			renderApp();

			expect(await screen.findByTestId('user')).toHaveTextContent('guest');
			expect(getCurrentUser).toHaveBeenCalledWith();
		});

		it('writes no token to localStorage after restoring a user', async () => {
			getCurrentUser.mockResolvedValue({ _id: 'user1', username: 'johndoe' });

			renderApp();

			await screen.findByTestId('user');

			expect(Object.keys(window.localStorage).filter((key) => /jwt|token/i.test(key))).toEqual([]);
		});
	});

	describe('updating the logged-in user', () => {
		it('replaces the user with the one in the response, and stores nothing', async () => {
			getCurrentUser.mockResolvedValue({ _id: 'user1', username: 'johndoe' });

			renderApp();

			await screen.findByTestId('user');
			await user.click(screen.getByRole('button', { name: 'Update user' }));

			expect(screen.getByTestId('user')).toHaveTextContent('renamed');
			expect(Object.keys(window.localStorage).filter((key) => /jwt|token/i.test(key))).toEqual([]);
		});
	});

	describe('logging out', () => {
		beforeEach(() => {
			getCurrentUser.mockResolvedValue({ _id: 'user1', username: 'johndoe' });
		});

		it('calls the logout endpoint', async () => {
			renderApp();

			await screen.findByTestId('user');
			await user.click(screen.getByRole('button', { name: 'Log out' }));

			await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
		});

		it('turns the user into a guest and sends them to /log-in once the server has cleared the cookie', async () => {
			renderApp(['/popular-posts']);

			await screen.findByTestId('user');
			await user.click(screen.getByRole('button', { name: 'Log out' }));

			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/log-in'));
			expect(screen.getByTestId('user')).toHaveTextContent('guest');
		});

		it('keeps the user logged in until the server has answered', async () => {
			const request = buildDeferred();

			logout.mockReturnValue(request.promise);

			renderApp(['/popular-posts']);

			await screen.findByTestId('user');
			await user.click(screen.getByRole('button', { name: 'Log out' }));

			expect(screen.getByTestId('user')).toHaveTextContent('johndoe');
			expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts');

			await act(async () => request.resolve({}));
		});

		describe('when the logout request fails', () => {
			beforeEach(() => {
				logout.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			});

			it('keeps the user logged in and on the same page', async () => {
				renderApp(['/popular-posts']);

				await screen.findByTestId('user');
				await user.click(screen.getByRole('button', { name: 'Log out' }));

				await waitFor(() => expect(showToast).toHaveBeenCalled());
				expect(screen.getByTestId('user')).toHaveTextContent('johndoe');
				expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts');
			});

			it('shows the log out failure toast', async () => {
				renderApp();

				await screen.findByTestId('user');
				await user.click(screen.getByRole('button', { name: 'Log out' }));

				await waitFor(() => expect(showToast).toHaveBeenCalledWith("Couldn't log you out. Try again."));
			});

			it('shows the toast for an error that is not a RequestError', async () => {
				logout.mockRejectedValue(new Error('network down'));

				renderApp();

				await screen.findByTestId('user');
				await user.click(screen.getByRole('button', { name: 'Log out' }));

				await waitFor(() => expect(showToast).toHaveBeenCalledWith("Couldn't log you out. Try again."));
			});
		});
	});

	describe('endSession', () => {
		it('keeps the same identity across route changes', async () => {
			renderApp();

			await user.click(await screen.findByRole('button', { name: 'Go to popular' }));
			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts'));

			await user.click(screen.getByRole('button', { name: 'Go to posts view' }));
			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts/posts'));

			expect(new Set(mockSeenEndSessions).size).toBe(1);
		});

		it('still sends the user to /log-in after the route has changed', async () => {
			renderApp();

			await user.click(await screen.findByRole('button', { name: 'Go to popular' }));
			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts'));

			await user.click(screen.getByRole('button', { name: 'End session' }));

			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/log-in'));
		});

		it('turns a logged-in user into a guest without calling the logout endpoint', async () => {
			getCurrentUser.mockResolvedValue({ _id: 'user1', username: 'johndoe' });

			renderApp();

			await screen.findByTestId('user');
			await user.click(screen.getByRole('button', { name: 'End session' }));

			await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('guest'));
			expect(logout).not.toHaveBeenCalled();
		});
	});
});
