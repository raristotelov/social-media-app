import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { login } from '../../services/userService';

import LoginView from './LoginView';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useNavigate: () => mockNavigate,
}));

jest.mock('../../services/userService');

jest.mock('../LoginForm/LoginForm', () => ({ loginHandler }) => (
	<button type='button' onClick={() => loginHandler({ email: 'user@example.com', password: 'Password123' }).catch(() => {})}>
		Submit login
	</button>
));

const loggedInUser = { _id: 'user1', username: 'johndoe' };

const renderLoginView = (entry = '/log-in') => {
	const setLoggedInUser = jest.fn();

	render(
		<LoggedInUserContext.Provider value={{ setLoggedInUser }}>
			<MemoryRouter initialEntries={[entry]}>
				<LoginView />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

	return { setLoggedInUser };
};

describe('LoginView', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		login.mockResolvedValue(loggedInUser);
	});

	it('sends the entered credentials to the login service', async () => {
		renderLoginView();

		userEvent.click(screen.getByRole('button', { name: 'Submit login' }));

		await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'user@example.com', password: 'Password123' }));
	});

	it('logs in with the user the server returns, not a token', async () => {
		const { setLoggedInUser } = renderLoginView();

		userEvent.click(screen.getByRole('button', { name: 'Submit login' }));

		await waitFor(() => expect(setLoggedInUser).toHaveBeenCalledWith(loggedInUser));
	});

	it('goes to the feed by default, replacing the login page in the history', async () => {
		renderLoginView();

		userEvent.click(screen.getByRole('button', { name: 'Submit login' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/user-feed', { replace: true }));
	});

	it('goes back to the page the guest came from', async () => {
		renderLoginView({ pathname: '/log-in', state: { from: '/user/user2' } });

		userEvent.click(screen.getByRole('button', { name: 'Submit login' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/user/user2', { replace: true }));
	});

	it('keeps no token in local storage', async () => {
		window.localStorage.clear();
		renderLoginView();

		userEvent.click(screen.getByRole('button', { name: 'Submit login' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
		expect(Object.keys(window.localStorage).filter((key) => /jwt|token/i.test(key))).toEqual([]);
	});

	describe('when the login fails', () => {
		beforeEach(() => {
			login.mockRejectedValue({ code: 'WRONG_CREDENTIALS', status: 401 });
		});

		it('does not log in or navigate', async () => {
			const { setLoggedInUser } = renderLoginView();

			userEvent.click(screen.getByRole('button', { name: 'Submit login' }));

			await waitFor(() => expect(login).toHaveBeenCalled());

			expect(setLoggedInUser).not.toHaveBeenCalled();
			expect(mockNavigate).not.toHaveBeenCalled();
		});
	});
});
