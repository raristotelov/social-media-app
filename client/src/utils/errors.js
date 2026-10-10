import { ERROR_CODES, isKnownErrorCode } from '../constants/errorCodes';
import { ERROR_MESSAGES } from '../constants/errorMessages';

export const getErrorCode = (error) => (isKnownErrorCode(error?.code) ? error.code : ERROR_CODES.INTERNAL_ERROR);

export const isUnauthenticatedError = (error) => getErrorCode(error) === ERROR_CODES.UNAUTHENTICATED;

export const getErrorMessage = (error, fallbackMessage) => ERROR_MESSAGES[getErrorCode(error)] ?? fallbackMessage;

export const getFormErrors = (error, formFieldNames, fallbackMessage) => {
	const fieldErrors = {};
	let formError = '';

	Object.entries(error?.fields ?? {}).forEach(([field, code]) => {
		const message = ERROR_MESSAGES[code];

		if (!message) {
			return;
		}

		if (formFieldNames.includes(field)) {
			fieldErrors[field] = [message];
		} else if (!formError) {
			formError = message;
		}
	});

	if (!Object.keys(fieldErrors).length && !formError) {
		formError = getErrorMessage(error, fallbackMessage);
	}

	return { fieldErrors, formError };
};
