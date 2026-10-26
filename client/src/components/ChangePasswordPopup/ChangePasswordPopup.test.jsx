import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { RequestError } from '../../services/requester';
import { changePassword } from '../../services/userService';

import ToastProvider from '../ToastProvider/ToastProvider';
import ChangePasswordPopup from './ChangePasswordPopup';

jest.mock('../../services/userService');

const renderPopup = ({ onClose = jest.fn(), endSession = jest.fn() } = {}) => {
	render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', endSession }}>
			<ToastProvider>
				<ChangePasswordPopup onClose={onClose} />
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { onClose, endSession };
};

const fillAndSave = ({ current = 'oldPassword1', next = 'newPassword1', confirm = 'newPassword1' } = {}) => {
	userEvent.type(screen.getByPlaceholderText('Current password'), current);
	userEvent.type(screen.getByPlaceholderText('New password'), next);
	userEvent.type(screen.getByPlaceholderText('Confirm new password'), confirm);
	userEvent.click(screen.getByRole('button', { name: 'Save' }));
};

describe('ChangePasswordPopup', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		changePassword.mockResolvedValue({});
	});

	it('is titled "Change Password"', () => {
		renderPopup();

		expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
	});

	it('sends only the current and new password with the token', async () => {
		renderPopup();

		fillAndSave();

		await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1));
		expect(changePassword).toHaveBeenCalledWith({ jwtToken: 'token123', currentPassword: 'oldPassword1', newPassword: 'newPassword1' });
	});

	it('closes and shows the "Password changed" success toast on success', async () => {
		const { onClose } = renderPopup();

		fillAndSave();

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(within(screen.getByRole('alert')).getByText('Password changed')).toBeInTheDocument();
	});

	it('does not end the session on success', async () => {
		const { onClose, endSession } = renderPopup();

		fillAndSave();

		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(endSession).not.toHaveBeenCalled();
	});

	it('stays open, shows the field error and no toast when the current password is wrong', async () => {
		changePassword.mockRejectedValue(
			new RequestError({ code: 'CURRENT_PASSWORD_WRONG', fields: { currentPassword: 'CURRENT_PASSWORD_WRONG' }, status: 400 }),
		);
		const { onClose } = renderPopup();

		fillAndSave({ current: 'wrongPassword1' });

		expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
		expect(within(screen.getByRole('alert')).queryByText('Password changed')).not.toBeInTheDocument();
	});

	it('stays open and shows the fallback form message when the request fails', async () => {
		changePassword.mockRejectedValue(new RequestError({ code: 'INTERNAL_ERROR', status: 500 }));
		const { onClose } = renderPopup();

		fillAndSave();

		expect(await screen.findByText("Couldn't change your password. Try again.")).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('closes and ends the session when the server answers UNAUTHENTICATED', async () => {
		changePassword.mockRejectedValue(new RequestError({ code: 'UNAUTHENTICATED', status: 401 }));
		const { onClose, endSession } = renderPopup();

		fillAndSave();

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(endSession).toHaveBeenCalledTimes(1);
	});

	it('closes without calling the server when Cancel is clicked', () => {
		const { onClose } = renderPopup();

		userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(changePassword).not.toHaveBeenCalled();
	});

	it('closes when the close button is clicked', () => {
		const { onClose } = renderPopup();

		userEvent.click(screen.getByRole('button', { name: 'Close' }));

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes when Escape is pressed', () => {
		const { onClose } = renderPopup();

		userEvent.keyboard('{esc}');

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes when the scrim is clicked', () => {
		const { onClose } = renderPopup();

		userEvent.click(screen.getByRole('heading', { name: 'Change Password' }).closest('.popup-container'));

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('does not close when the popup body is clicked', () => {
		const { onClose } = renderPopup();

		userEvent.click(screen.getByRole('heading', { name: 'Change Password' }));

		expect(onClose).not.toHaveBeenCalled();
	});
});
