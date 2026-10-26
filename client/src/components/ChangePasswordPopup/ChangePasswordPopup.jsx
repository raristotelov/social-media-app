import { useContext } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import useSessionGuard from '../../hooks/useSessionGuard';
import { changePassword } from '../../services/userService';
import { TOAST_MESSAGES, TOAST_TYPES } from '../../constants/toast';
import { isUnauthenticatedError } from '../../utils/errors';

import Popup from '../Popup/Popup';
import ChangePasswordForm from '../ChangePasswordForm/ChangePasswordForm';

const ChangePasswordPopup = ({ onClose }) => {
	const { jwtToken } = useContext(LoggedInUserContext);
	const { showToast } = useContext(ToastContext);
	const { runWithSessionGuard } = useSessionGuard();

	const changePasswordHandler = async ({ currentPassword, newPassword }) => {
		try {
			await runWithSessionGuard(() => changePassword({ jwtToken, currentPassword, newPassword }));
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				onClose();
			}

			throw error;
		}

		onClose();
		showToast(TOAST_MESSAGES.PASSWORD_CHANGED, TOAST_TYPES.SUCCESS);
	};

	return (
		<Popup title='Change Password' onClosePopupClick={onClose}>
			<ChangePasswordForm onSubmit={changePasswordHandler} onCancelClick={onClose} />
		</Popup>
	);
};

export default ChangePasswordPopup;
