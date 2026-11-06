import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RequestError } from '../../services/requester';

import ChangePasswordForm from './ChangePasswordForm';

const renderForm = (onSubmit = vi.fn().mockResolvedValue(undefined), onCancelClick = vi.fn()) => {
	render(<ChangePasswordForm onSubmit={onSubmit} onCancelClick={onCancelClick} />);

	return { onSubmit, onCancelClick };
};

const fill = async (user, { current = '', next = '', confirm = '' }) => {
	if (current) {
		await user.type(screen.getByPlaceholderText('Current password'), current);
	}

	if (next) {
		await user.type(screen.getByPlaceholderText('New password'), next);
	}

	if (confirm) {
		await user.type(screen.getByPlaceholderText('Confirm new password'), confirm);
	}
};

const save = (user) => user.click(screen.getByRole('button', { name: 'Save' }));

describe('ChangePasswordForm', () => {
	it('renders the three password inputs with Save and Cancel', () => {
		renderForm();

		expect(screen.getByPlaceholderText('Current password')).toHaveAttribute('type', 'password');
		expect(screen.getByPlaceholderText('New password')).toHaveAttribute('type', 'password');
		expect(screen.getByPlaceholderText('Confirm new password')).toHaveAttribute('type', 'password');
		expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
		expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button');
	});

	it('calls onCancelClick, without submitting, when Cancel is clicked', async () => {
		const user = userEvent.setup();
		const { onSubmit, onCancelClick } = renderForm();

		await user.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onCancelClick).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	describe('validation', () => {
		it('shows "Password is required" beside the current password input when it is empty, and does not submit', async () => {
			const user = userEvent.setup();
			const { onSubmit } = renderForm();

			await fill(user, { next: 'newPassword1', confirm: 'newPassword1' });
			await save(user);

			const message = await screen.findByText('Password is required');

			expect(message.parentElement).toContainElement(screen.getByPlaceholderText('Current password'));
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('shows "Password is required" beside the new password input when it is empty', async () => {
			const user = userEvent.setup();

			renderForm();

			await fill(user, { current: 'oldPassword1', confirm: 'newPassword1' });
			await save(user);

			const message = await screen.findByText('Password is required');

			expect(message.parentElement).toContainElement(screen.getByPlaceholderText('New password'));
		});

		it('shows the too short message beside the new password input and does not submit', async () => {
			const user = userEvent.setup();
			const { onSubmit } = renderForm();

			await fill(user, { current: 'oldPassword1', next: 'short', confirm: 'short' });
			await save(user);

			const message = await screen.findByText('Password must be at least 8 characters');

			expect(message.parentElement).toContainElement(screen.getByPlaceholderText('New password'));
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('shows the form message "Please repeat your password" when the confirmation is empty', async () => {
			const user = userEvent.setup();
			const { onSubmit } = renderForm();

			await fill(user, { current: 'oldPassword1', next: 'newPassword1' });
			await save(user);

			expect(await screen.findByRole('alert')).toHaveTextContent('Please repeat your password');
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('shows the form message "Passwords do not match" when new and confirm differ', async () => {
			const user = userEvent.setup();
			const { onSubmit } = renderForm();

			await fill(user, { current: 'oldPassword1', next: 'newPassword1', confirm: 'newPassword2' });
			await save(user);

			expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match');
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it('clears a field error when that field is edited', async () => {
			const user = userEvent.setup();

			renderForm();

			await fill(user, { next: 'newPassword1', confirm: 'newPassword1' });
			await save(user);
			await screen.findByText('Password is required');

			await user.type(screen.getByPlaceholderText('Current password'), 'o');

			expect(screen.queryByText('Password is required')).not.toBeInTheDocument();
		});
	});

	describe('submitting', () => {
		it('sends the current, new and confirm passwords', async () => {
			const user = userEvent.setup();
			const { onSubmit } = renderForm();

			await fill(user, { current: 'oldPassword1', next: 'newPassword1', confirm: 'newPassword1' });
			await save(user);

			await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
			expect(onSubmit).toHaveBeenCalledWith({
				currentPassword: 'oldPassword1',
				newPassword: 'newPassword1',
				confirmPassword: 'newPassword1',
			});
		});

		it('shows the server error "Current password is incorrect" beside the current password input', async () => {
			const user = userEvent.setup();
			const onSubmit = vi
				.fn()
				.mockRejectedValue(
					new RequestError({ code: 'CURRENT_PASSWORD_WRONG', fields: { currentPassword: 'CURRENT_PASSWORD_WRONG' }, status: 400 }),
				);
			renderForm(onSubmit);

			await fill(user, { current: 'wrongPassword1', next: 'newPassword1', confirm: 'newPassword1' });
			await save(user);

			const message = await screen.findByText('Current password is incorrect');

			expect(message.parentElement).toContainElement(screen.getByPlaceholderText('Current password'));
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it.each([
			['PASSWORD_UNCHANGED', 'New password must be different from the current one'],
			['PASSWORD_TOO_LONG', 'Password must be at most 72 bytes'],
		])('shows the server error %s beside the new password input', async (code, copy) => {
			const user = userEvent.setup();
			const onSubmit = vi.fn().mockRejectedValue(new RequestError({ code, fields: { newPassword: code }, status: 400 }));
			renderForm(onSubmit);

			await fill(user, { current: 'oldPassword1', next: 'newPassword1', confirm: 'newPassword1' });
			await save(user);

			const message = await screen.findByText(copy);

			expect(message.parentElement).toContainElement(screen.getByPlaceholderText('New password'));
		});

		it('shows the fallback form message when the request fails without a known error', async () => {
			const user = userEvent.setup();
			const onSubmit = vi.fn().mockRejectedValue(new RequestError({ code: 'INTERNAL_ERROR', status: 500 }));
			renderForm(onSubmit);

			await fill(user, { current: 'oldPassword1', next: 'newPassword1', confirm: 'newPassword1' });
			await save(user);

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't change your password. Try again.");
		});

		it('shows the fallback form message on a network failure', async () => {
			const user = userEvent.setup();
			const onSubmit = vi.fn().mockRejectedValue(new RequestError({ status: 0 }));
			renderForm(onSubmit);

			await fill(user, { current: 'oldPassword1', next: 'newPassword1', confirm: 'newPassword1' });
			await save(user);

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't change your password. Try again.");
		});

		it('disables Save while the request is in flight', async () => {
			const user = userEvent.setup();
			let resolveRequest;
			const onSubmit = vi.fn().mockReturnValue(
				new Promise((resolve) => {
					resolveRequest = resolve;
				}),
			);
			renderForm(onSubmit);

			await fill(user, { current: 'oldPassword1', next: 'newPassword1', confirm: 'newPassword1' });
			await save(user);

			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());

			resolveRequest();

			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
		});
	});
});
