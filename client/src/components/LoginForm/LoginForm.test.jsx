import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoginForm from './LoginForm';

const renderLoginForm = (loginHandler) =>
	render(
		<MemoryRouter>
			<LoginForm loginHandler={loginHandler} />
		</MemoryRouter>,
	);

const fillValidCredentials = async (user) => {
	await user.type(screen.getByPlaceholderText('Email'), 'user@example.com');
	await user.type(screen.getByPlaceholderText('Password'), 'Password123');
};

describe('LoginForm', () => {
	let user;

	beforeEach(() => {
		user = userEvent.setup();
	});

	it('shows required-field errors and does not call the handler on empty submit', async () => {
		const loginHandler = vi.fn();
		const { container } = renderLoginForm(loginHandler);

		await user.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Email is required')).toBeInTheDocument();
		expect(screen.getByText('Password is required')).toBeInTheDocument();
		expect(loginHandler).not.toHaveBeenCalled();

		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('shows a validation error for a malformed email address', async () => {
		const loginHandler = vi.fn();
		renderLoginForm(loginHandler);

		await user.type(screen.getByPlaceholderText('Email'), 'user@example');
		await user.type(screen.getByPlaceholderText('Password'), 'Password123');
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Please provide a valid email address')).toBeInTheDocument();
		expect(loginHandler).not.toHaveBeenCalled();
	});

	it('calls the handler once with the entered email and password when valid', async () => {
		const loginHandler = vi.fn().mockResolvedValue(undefined);
		renderLoginForm(loginHandler);

		await fillValidCredentials(user);
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => expect(loginHandler).toHaveBeenCalledTimes(1));
		expect(loginHandler).toHaveBeenCalledWith({
			email: 'user@example.com',
			password: 'Password123',
		});
	});

	it('clears a field error when the user types in that field', async () => {
		const loginHandler = vi.fn();
		renderLoginForm(loginHandler);

		await user.click(screen.getByRole('button', { name: 'Submit' }));
		expect(await screen.findByText('Email is required')).toBeInTheDocument();

		await user.type(screen.getByPlaceholderText('Email'), 'u');

		expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
		expect(screen.getByText('Password is required')).toBeInTheDocument();
	});

	it('disables the submit button and shows "Submitting..." while the handler is pending, then reverts', async () => {
		let resolveSubmit;
		const loginHandler = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveSubmit = resolve;
				}),
		);
		renderLoginForm(loginHandler);

		await fillValidCredentials(user);
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		const button = await screen.findByRole('button', { name: 'Submitting...' });
		expect(button).toBeDisabled();

		await act(async () => {
			resolveSubmit();
		});

		const submitButton = await screen.findByRole('button', { name: 'Submit' });
		expect(submitButton).not.toBeDisabled();
	});

	it('renders a field code under its input when the rejection carries a fields object', async () => {
		const loginHandler = vi.fn().mockRejectedValue({ code: 'PASSWORD_REQUIRED', fields: { password: 'PASSWORD_REQUIRED' }, status: 400 });
		const { container } = renderLoginForm(loginHandler);

		await fillValidCredentials(user);
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('Password is required');
		expect(message).toHaveClass('field-error');
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('renders WRONG_CREDENTIALS as the form message, not under a field', async () => {
		const loginHandler = vi.fn().mockRejectedValue({ code: 'WRONG_CREDENTIALS', status: 401 });
		const { container } = renderLoginForm(loginHandler);

		await fillValidCredentials(user);
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('Wrong email or password');
		expect(message).toHaveClass('form-error');
		expect(container.querySelector('.field-error')).not.toBeInTheDocument();
	});

	it('shows the log-in fallback copy for INTERNAL_ERROR', async () => {
		const loginHandler = vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
		renderLoginForm(loginHandler);

		await fillValidCredentials(user);
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText("Couldn't log in. Try again.");
		expect(message).toHaveClass('form-error');
	});

	it('shows the log-in fallback copy for a code the client does not know', async () => {
		const loginHandler = vi.fn().mockRejectedValue({ code: 'SOMETHING_NEW', status: 418 });
		renderLoginForm(loginHandler);

		await fillValidCredentials(user);
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText("Couldn't log in. Try again.")).toBeInTheDocument();
	});

	it('shows no form error for UNAUTHENTICATED', async () => {
		const loginHandler = vi.fn().mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
		const { container } = renderLoginForm(loginHandler);

		await fillValidCredentials(user);
		await user.click(screen.getByRole('button', { name: 'Submit' }));

		await screen.findByRole('button', { name: 'Submit' });
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
		expect(container.querySelector('.field-error')).not.toBeInTheDocument();
	});

	it('clears the form error when the user types again', async () => {
		const loginHandler = vi.fn().mockRejectedValue({ code: 'WRONG_CREDENTIALS', status: 401 });
		renderLoginForm(loginHandler);

		await fillValidCredentials(user);
		await user.click(screen.getByRole('button', { name: 'Submit' }));
		await screen.findByText('Wrong email or password');

		await user.type(screen.getByPlaceholderText('Password'), '4');

		expect(screen.queryByText('Wrong email or password')).not.toBeInTheDocument();
	});
});
