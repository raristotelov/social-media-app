import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { signUp } from '../../services/userService';

import SignUpView from './SignUpView';

const mockNavigate = vi.fn();

vi.mock('react-router', async () => ({
	...(await vi.importActual('react-router')),
	useNavigate: () => mockNavigate,
}));

vi.mock('../../services/userService');

vi.mock('../SignUpForm/SignUpForm', () => ({
	default: ({ signUpHandler }) => (
		<button
			type='button'
			onClick={() =>
				signUpHandler({ email: 'new@example.com', username: 'newcomer', password: 'Password123', repeatPassword: 'Password123' }).catch(
					() => {},
				)
			}
		>
			Submit sign up
		</button>
	),
}));

const newUser = { _id: 'user1', username: 'newcomer' };

const renderSignUpView = () => {
	const setLoggedInUser = vi.fn();

	render(
		<LoggedInUserContext.Provider value={{ setLoggedInUser }}>
			<MemoryRouter>
				<SignUpView />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

	return { setLoggedInUser };
};

describe('SignUpView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		signUp.mockResolvedValue(newUser);
	});

	it('sends the new account data to the sign-up service without the repeated password', async () => {
		const user = userEvent.setup();

		renderSignUpView();

		await user.click(screen.getByRole('button', { name: 'Submit sign up' }));

		await waitFor(() => expect(signUp).toHaveBeenCalledWith({ email: 'new@example.com', username: 'newcomer', password: 'Password123' }));
	});

	it('logs in with the user the server returns, not a token', async () => {
		const user = userEvent.setup();
		const { setLoggedInUser } = renderSignUpView();

		await user.click(screen.getByRole('button', { name: 'Submit sign up' }));

		await waitFor(() => expect(setLoggedInUser).toHaveBeenCalledWith(newUser));
	});

	it('goes to the feed', async () => {
		const user = userEvent.setup();

		renderSignUpView();

		await user.click(screen.getByRole('button', { name: 'Submit sign up' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/user-feed'));
	});

	it('keeps no token in local storage', async () => {
		const user = userEvent.setup();

		window.localStorage.clear();
		renderSignUpView();

		await user.click(screen.getByRole('button', { name: 'Submit sign up' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
		expect(Object.keys(window.localStorage).filter((key) => /jwt|token/i.test(key))).toEqual([]);
	});

	describe('when the sign-up fails', () => {
		it('does not log in or navigate', async () => {
			const user = userEvent.setup();

			signUp.mockRejectedValue({ code: 'EMAIL_TAKEN', status: 409 });

			const { setLoggedInUser } = renderSignUpView();

			await user.click(screen.getByRole('button', { name: 'Submit sign up' }));

			await waitFor(() => expect(signUp).toHaveBeenCalled());

			expect(setLoggedInUser).not.toHaveBeenCalled();
			expect(mockNavigate).not.toHaveBeenCalled();
		});
	});
});
