import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoginForm from './LoginForm';

const renderLoginForm = (loginHandler) =>
	render(
		<MemoryRouter>
			<LoginForm loginHandler={loginHandler} />
		</MemoryRouter>,
	);

const fillValidCredentials = () => {
	userEvent.type(screen.getByPlaceholderText('Email'), 'user@example.com');
	userEvent.type(screen.getByPlaceholderText('Password'), 'Password123');
};

describe('LoginForm', () => {
	it('shows required-field errors and does not call the handler on empty submit', async () => {
		const loginHandler = jest.fn();
		const { container } = renderLoginForm(loginHandler);

		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Email is required')).toBeInTheDocument();
		expect(screen.getByText('Password is required')).toBeInTheDocument();
		expect(loginHandler).not.toHaveBeenCalled();

		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('shows a validation error for a malformed email address', async () => {
		const loginHandler = jest.fn();
		renderLoginForm(loginHandler);

		userEvent.type(screen.getByPlaceholderText('Email'), 'not-an-email');
		userEvent.type(screen.getByPlaceholderText('Password'), 'Password123');
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Please provide a valid email address')).toBeInTheDocument();
		expect(loginHandler).not.toHaveBeenCalled();
	});

	it('calls the handler once with the entered email and password when valid', async () => {
		const loginHandler = jest.fn().mockResolvedValue(undefined);
		renderLoginForm(loginHandler);

		fillValidCredentials();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => expect(loginHandler).toHaveBeenCalledTimes(1));
		expect(loginHandler).toHaveBeenCalledWith({
			email: 'user@example.com',
			password: 'Password123',
		});
	});

	it('clears a field error when the user types in that field', async () => {
		const loginHandler = jest.fn();
		renderLoginForm(loginHandler);

		userEvent.click(screen.getByRole('button', { name: 'Submit' }));
		expect(await screen.findByText('Email is required')).toBeInTheDocument();

		userEvent.type(screen.getByPlaceholderText('Email'), 'u');

		expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
		expect(screen.getByText('Password is required')).toBeInTheDocument();
	});

	it('disables the submit button and shows "Submitting..." while the handler is pending, then reverts', async () => {
		let resolveSubmit;
		const loginHandler = jest.fn(
			() =>
				new Promise((resolve) => {
					resolveSubmit = resolve;
				}),
		);
		renderLoginForm(loginHandler);

		fillValidCredentials();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const button = await screen.findByRole('button', { name: 'Submitting...' });
		expect(button).toBeDisabled();

		await act(async () => {
			resolveSubmit();
		});

		const submitButton = await screen.findByRole('button', { name: 'Submit' });
		expect(submitButton).not.toBeDisabled();
	});

	it('renders a field-level error under the password input when the rejection carries a fields object', async () => {
		const loginHandler = jest.fn().mockRejectedValue({ fields: { password: 'Wrong password' } });
		const { container } = renderLoginForm(loginHandler);

		fillValidCredentials();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('Wrong password');
		expect(message).toHaveClass('field-error');
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('renders a form-level error when the rejection carries only an error message', async () => {
		const loginHandler = jest.fn().mockRejectedValue({ error: 'Invalid credentials' });
		const { container } = renderLoginForm(loginHandler);

		fillValidCredentials();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('Invalid credentials');
		expect(message).toHaveClass('form-error');
		expect(container.querySelector('.field-error')).not.toBeInTheDocument();
	});

	it('shows a generic fallback message when the rejection carries neither fields nor an error message', async () => {
		const loginHandler = jest.fn().mockRejectedValue({});
		renderLoginForm(loginHandler);

		fillValidCredentials();
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		const message = await screen.findByText('Something went wrong. Please try again.');
		expect(message).toHaveClass('form-error');
	});
});
