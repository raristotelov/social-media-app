import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import SignUpForm from './SignUpForm';

const renderSignUpForm = (signUpHandler) =>
	render(
		<MemoryRouter>
			<SignUpForm signUpHandler={signUpHandler} />
		</MemoryRouter>,
	);

let user;

const fillField = async (placeholder, value) => {
	await user.type(screen.getByPlaceholderText(placeholder), value);
};

const fillValidSignUp = async () => {
	await fillField('Email', 'user@example.com');
	await fillField('Username', 'johndoe');
	await fillField('Password', 'Password123');
	await fillField('Repeat password', 'Password123');
};

describe('SignUpForm', () => {
	beforeEach(() => {
		user = userEvent.setup();
	});

	it('flags email, username, password and repeatPassword on empty submit', async () => {
		const signUpHandler = vi.fn();
		renderSignUpForm(signUpHandler);

		await user.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Email is required')).toBeInTheDocument();
		expect(screen.getByText('Username is required')).toBeInTheDocument();
		expect(screen.getByText('Password is required')).toBeInTheDocument();
		expect(screen.getByText('Please repeat your password')).toBeInTheDocument();
		expect(signUpHandler).not.toHaveBeenCalled();
	});

	it('shows the app validation error, not the browser one, for an email without an @, and sends nothing', async () => {
		const signUpHandler = vi.fn();
		const { container } = renderSignUpForm(signUpHandler);

		await fillField('Email', 'not-an-email');
		await fillField('Username', 'johndoe');
		await fillField('Password', 'Password123');
		await fillField('Repeat password', 'Password123');
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Please provide a valid email address')).toHaveClass('field-error');
		expect(container.querySelector('form')).toHaveAttribute('novalidate');
		expect(signUpHandler).not.toHaveBeenCalled();
	});

	it('shows the minimum-length message for a password under 8 characters', async () => {
		const signUpHandler = vi.fn();
		renderSignUpForm(signUpHandler);

		await fillField('Email', 'user@example.com');
		await fillField('Username', 'johndoe');
		await fillField('Password', 'short1');
		await fillField('Repeat password', 'short1');
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
		expect(signUpHandler).not.toHaveBeenCalled();
	});

	it('shows "Passwords do not match" in the form-level error, not under an input, when passwords differ', async () => {
		const signUpHandler = vi.fn();
		const { container } = renderSignUpForm(signUpHandler);

		await fillField('Email', 'user@example.com');
		await fillField('Username', 'johndoe');
		await fillField('Password', 'Password123');
		await fillField('Repeat password', 'Different123');
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('Passwords do not match');
		expect(message).toHaveClass('form-error');
		expect(container.querySelector('.field-error')).not.toBeInTheDocument();
		expect(signUpHandler).not.toHaveBeenCalled();
	});

	it('calls the handler once with all values, including repeatPassword, when input is valid', async () => {
		const signUpHandler = vi.fn().mockResolvedValue(undefined);
		renderSignUpForm(signUpHandler);

		await fillValidSignUp();
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => expect(signUpHandler).toHaveBeenCalledTimes(1));
		expect(signUpHandler).toHaveBeenCalledWith({
			email: 'user@example.com',
			username: 'johndoe',
			password: 'Password123',
			repeatPassword: 'Password123',
		});
	});

	it('renders a duplicate-email rejection under the email input', async () => {
		const signUpHandler = vi.fn().mockRejectedValue({ code: 'EMAIL_TAKEN', fields: { email: 'EMAIL_TAKEN' }, status: 409 });
		const { container } = renderSignUpForm(signUpHandler);

		await fillValidSignUp();
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('This email is already registered');
		expect(message).toHaveClass('field-error');
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('renders a taken username under the username input', async () => {
		const signUpHandler = vi.fn().mockRejectedValue({ code: 'USERNAME_TAKEN', fields: { username: 'USERNAME_TAKEN' }, status: 409 });
		const { container } = renderSignUpForm(signUpHandler);

		await fillValidSignUp();
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('This username is taken');
		expect(message).toHaveClass('field-error');
		expect(message.closest('.auth-input-wrapper').querySelector('#username')).toBeInTheDocument();
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('renders several field codes, each under its own input', async () => {
		const signUpHandler = vi.fn().mockRejectedValue({
			code: 'EMAIL_INVALID',
			fields: { email: 'EMAIL_INVALID', password: 'PASSWORD_TOO_LONG' },
			status: 400,
		});
		renderSignUpForm(signUpHandler);

		await fillValidSignUp();
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Please provide a valid email address')).toHaveClass('field-error');
		expect(screen.getByText('Password must be at most 72 bytes')).toHaveClass('field-error');
	});

	it('shows the sign-up fallback copy as the form message for INTERNAL_ERROR', async () => {
		const signUpHandler = vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
		const { container } = renderSignUpForm(signUpHandler);

		await fillValidSignUp();
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText("Couldn't sign up. Try again.");
		expect(message).toHaveClass('form-error');
		expect(container.querySelector('.field-error')).not.toBeInTheDocument();
	});

	it('shows the sign-up fallback copy when the rejection has no usable code (e.g. a plain Error)', async () => {
		const signUpHandler = vi.fn().mockRejectedValue(new Error('boom'));
		renderSignUpForm(signUpHandler);

		await fillValidSignUp();
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText("Couldn't sign up. Try again.")).toBeInTheDocument();
	});

	it('shows no form error for UNAUTHENTICATED', async () => {
		const signUpHandler = vi.fn().mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
		const { container } = renderSignUpForm(signUpHandler);

		await fillValidSignUp();
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		await screen.findByRole('button', { name: 'Submit' });
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});
});
