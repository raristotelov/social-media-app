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
		const signUpHandler = jest.fn().mockRejectedValue({ code: 'EMAIL_TAKEN', fields: { email: 'EMAIL_TAKEN' }, status: 409 });
		const { container } = renderSignUpForm(signUpHandler);

		fillValidSignUp();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('This email is already registered');
		expect(message).toHaveClass('field-error');
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('renders a taken username under the username input', async () => {
		const signUpHandler = jest.fn().mockRejectedValue({ code: 'USERNAME_TAKEN', fields: { username: 'USERNAME_TAKEN' }, status: 409 });
		const { container } = renderSignUpForm(signUpHandler);

		fillValidSignUp();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('This username is taken');
		expect(message).toHaveClass('field-error');
		expect(message.closest('.auth-input-wrapper').querySelector('#username')).toBeInTheDocument();
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('renders several field codes, each under its own input', async () => {
		const signUpHandler = jest.fn().mockRejectedValue({
			code: 'EMAIL_INVALID',
			fields: { email: 'EMAIL_INVALID', password: 'PASSWORD_TOO_LONG' },
			status: 400,
		});
		renderSignUpForm(signUpHandler);

		fillValidSignUp();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Please provide a valid email address')).toHaveClass('field-error');
		expect(screen.getByText('Password must be at most 72 bytes')).toHaveClass('field-error');
	});

	it('shows the sign-up fallback copy as the form message for INTERNAL_ERROR', async () => {
		const signUpHandler = jest.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
		const { container } = renderSignUpForm(signUpHandler);

		fillValidSignUp();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText("Couldn't sign up. Try again.");
		expect(message).toHaveClass('form-error');
		expect(container.querySelector('.field-error')).not.toBeInTheDocument();
	});

	it('shows the sign-up fallback copy when the rejection has no usable code (e.g. a plain Error)', async () => {
		const signUpHandler = jest.fn().mockRejectedValue(new Error('boom'));
		renderSignUpForm(signUpHandler);

		fillValidSignUp();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText("Couldn't sign up. Try again.")).toBeInTheDocument();
	});

	it('shows no form error for UNAUTHENTICATED', async () => {
		const signUpHandler = jest.fn().mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
		const { container } = renderSignUpForm(signUpHandler);

		fillValidSignUp();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await screen.findByRole('button', { name: 'Submit' });
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});
});
