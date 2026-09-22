import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import SignUpForm from './SignUpForm';

const renderSignUpForm = (signUpHandler) =>
	render(
		<MemoryRouter>
			<SignUpForm signUpHandler={signUpHandler} />
		</MemoryRouter>,
	);

const fillField = (placeholder, value) => {
	userEvent.type(screen.getByPlaceholderText(placeholder), value);
};

const fillValidSignUp = () => {
	fillField('Email', 'user@example.com');
	fillField('Username', 'johndoe');
	fillField('Password', 'Password123');
	fillField('Repeat password', 'Password123');
};

describe('SignUpForm', () => {
	it('flags email, username, password and repeatPassword on empty submit', async () => {
		const signUpHandler = jest.fn();
		renderSignUpForm(signUpHandler);

		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Email is required')).toBeInTheDocument();
		expect(screen.getByText('Username is required')).toBeInTheDocument();
		expect(screen.getByText('Password is required')).toBeInTheDocument();
		expect(screen.getByText('Please repeat your password')).toBeInTheDocument();
		expect(signUpHandler).not.toHaveBeenCalled();
	});

	it('shows the minimum-length message for a password under 8 characters', async () => {
		const signUpHandler = jest.fn();
		renderSignUpForm(signUpHandler);

		fillField('Email', 'user@example.com');
		fillField('Username', 'johndoe');
		fillField('Password', 'short1');
		fillField('Repeat password', 'short1');
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
		expect(signUpHandler).not.toHaveBeenCalled();
	});

	it('shows "Passwords do not match" in the form-level error, not under an input, when passwords differ', async () => {
		const signUpHandler = jest.fn();
		const { container } = renderSignUpForm(signUpHandler);

		fillField('Email', 'user@example.com');
		fillField('Username', 'johndoe');
		fillField('Password', 'Password123');
		fillField('Repeat password', 'Different123');
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('Passwords do not match');
		expect(message).toHaveClass('form-error');
		expect(container.querySelector('.field-error')).not.toBeInTheDocument();
		expect(signUpHandler).not.toHaveBeenCalled();
	});

	it('calls the handler once with all values, including repeatPassword, when input is valid', async () => {
		const signUpHandler = jest.fn().mockResolvedValue(undefined);
		renderSignUpForm(signUpHandler);

		fillValidSignUp();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => expect(signUpHandler).toHaveBeenCalledTimes(1));
		expect(signUpHandler).toHaveBeenCalledWith({
			email: 'user@example.com',
			username: 'johndoe',
			password: 'Password123',
			repeatPassword: 'Password123',
		});
	});

	it('renders a duplicate-email rejection under the email input', async () => {
		const signUpHandler = jest.fn().mockRejectedValue({ fields: { email: 'Email already in use' } });
		const { container } = renderSignUpForm(signUpHandler);

		fillValidSignUp();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('Email already in use');
		expect(message).toHaveClass('field-error');
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});
});
