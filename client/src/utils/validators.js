import { ERROR_CODES } from '../constants/errorCodes';
import { ERROR_MESSAGES, VALIDATION_MESSAGES } from '../constants/errorMessages';

export const MIN_PASSWORD_LENGTH = 8;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getEmailErrors = (email) => {
	if (!email?.trim()) {
		return [ERROR_MESSAGES[ERROR_CODES.EMAIL_REQUIRED]];
	}

	if (!emailPattern.test(email)) {
		return [ERROR_MESSAGES[ERROR_CODES.EMAIL_INVALID]];
	}

	return [];
};

const getPasswordErrors = (password) => {
	if (!password) {
		return [ERROR_MESSAGES[ERROR_CODES.PASSWORD_REQUIRED]];
	}

	const messages = [];

	if (password.length < MIN_PASSWORD_LENGTH) {
		messages.push(ERROR_MESSAGES[ERROR_CODES.PASSWORD_TOO_SHORT]);
	}

	return messages;
};

export const validateLogin = ({ email, password }) => {
	const fields = {};

	const emailErrors = getEmailErrors(email);

	if (emailErrors.length) {
		fields.email = emailErrors;
	}

	if (!password) {
		fields.password = [ERROR_MESSAGES[ERROR_CODES.PASSWORD_REQUIRED]];
	}

	return { fields };
};

export const validateSignUp = ({ email, username, password, repeatPassword }) => {
	const fields = {};
	let formError = '';

	const emailErrors = getEmailErrors(email);

	if (emailErrors.length) {
		fields.email = emailErrors;
	}

	if (!username?.trim()) {
		fields.username = [ERROR_MESSAGES[ERROR_CODES.USERNAME_REQUIRED]];
	}

	const passwordErrors = getPasswordErrors(password);

	if (passwordErrors.length) {
		fields.password = passwordErrors;
	}

	if (!repeatPassword) {
		fields.repeatPassword = [VALIDATION_MESSAGES.REPEAT_PASSWORD_REQUIRED];
	} else if (password && password !== repeatPassword) {
		formError = VALIDATION_MESSAGES.PASSWORDS_DO_NOT_MATCH;
	}

	return { fields, formError };
};

export const validateChangePassword = ({ currentPassword, newPassword, confirmPassword }) => {
	const fields = {};
	let formError = '';

	if (!currentPassword) {
		fields.currentPassword = [ERROR_MESSAGES[ERROR_CODES.PASSWORD_REQUIRED]];
	}

	const newPasswordErrors = getPasswordErrors(newPassword);

	if (newPasswordErrors.length) {
		fields.newPassword = newPasswordErrors;
	}

	if (!confirmPassword) {
		formError = VALIDATION_MESSAGES.REPEAT_PASSWORD_REQUIRED;
	} else if (newPassword && newPassword !== confirmPassword) {
		formError = VALIDATION_MESSAGES.PASSWORDS_DO_NOT_MATCH;
	}

	return { fields, formError };
};
