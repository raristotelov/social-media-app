import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { RequestError } from '../../services/requester';
import { changePassword } from '../../services/userService';

import ToastProvider from '../ToastProvider/ToastProvider';
import ChangePasswordPopup from './ChangePasswordPopup';

vi.mock('../../services/userService');

const renderPopup = ({ onClose = vi.fn(), endSession = vi.fn() } = {}) => {
	render(
		<LoggedInUserContext.Provider value={{ endSession }}>
			<ToastProvider>
				<ChangePasswordPopup onClose={onClose} />
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { onClose, endSession };
};

let user;

const fillAndSave = async ({ current = 'oldPassword1', next = 'newPassword1', confirm = 'newPassword1' } = {}) => {
	await user.type(screen.getByPlaceholderText('Current password'), current);
	await user.type(screen.getByPlaceholderText('New password'), next);
	await user.type(screen.getByPlaceholderText('Confirm new password'), confirm);
	await user.click(screen.getByRole('button', { name: 'Save' }));
};

describe('ChangePasswordPopup', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		user = userEvent.setup();
		changePassword.mockResolvedValue({});
	});

	it('is titled "Change Password"', () => {
		renderPopup();

		expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
	});

	it('sends only the current and new password with the token', async () => {
		renderPopup();

		await fillAndSave();

		await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1));
		expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'oldPassword1', newPassword: 'newPassword1' });
	});

	it('closes and shows the "Password changed" success toast on success', async () => {
		const { onClose } = renderPopup();

		await fillAndSave();

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(within(screen.getByRole('alert')).getByText('Password changed')).toBeInTheDocument();
	});

	it('does not end the session on success', async () => {
		const { onClose, endSession } = renderPopup();

		await fillAndSave();

		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(endSession).not.toHaveBeenCalled();
	});

	it('stays open, shows the field error and no toast when the current password is wrong', async () => {
		changePassword.mockRejectedValue(
			new RequestError({ code: 'CURRENT_PASSWORD_WRONG', fields: { currentPassword: 'CURRENT_PASSWORD_WRONG' }, status: 400 }),
		);
		const { onClose } = renderPopup();

		await fillAndSave({ current: 'wrongPassword1' });

		expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
		expect(within(screen.getByRole('alert')).queryByText('Password changed')).not.toBeInTheDocument();
	});

	it('stays open and shows the fallback form message when the request fails', async () => {
		changePassword.mockRejectedValue(new RequestError({ code: 'INTERNAL_ERROR', status: 500 }));
		const { onClose } = renderPopup();

		await fillAndSave();

		expect(await screen.findByText("Couldn't change your password. Try again.")).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('closes and ends the session when the server answers UNAUTHENTICATED', async () => {
		changePassword.mockRejectedValue(new RequestError({ code: 'UNAUTHENTICATED', status: 401 }));
		const { onClose, endSession } = renderPopup();

		await fillAndSave();

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(endSession).toHaveBeenCalledTimes(1);
	});

	it('closes without calling the server when Cancel is clicked', async () => {
		const { onClose } = renderPopup();

		await user.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(changePassword).not.toHaveBeenCalled();
	});

	it('closes when the close button is clicked', async () => {
		const { onClose } = renderPopup();

		await user.click(screen.getByRole('button', { name: 'Close' }));

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes when Escape is pressed', async () => {
		const { onClose } = renderPopup();

		await user.keyboard('{Escape}');

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes when the scrim is clicked', async () => {
		const { onClose } = renderPopup();

		await user.click(screen.getByRole('heading', { name: 'Change Password' }).closest('.popup-container'));

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('does not close when the popup body is clicked', async () => {
		const { onClose } = renderPopup();

		await user.click(screen.getByRole('heading', { name: 'Change Password' }));

		expect(onClose).not.toHaveBeenCalled();
	});
});
