import { ERROR_CODES, isKnownErrorCode } from './errorCodes';
import { ACTION_FALLBACK_MESSAGES, ERROR_MESSAGES, LOAD_ERROR_MESSAGES } from './errorMessages';

describe('ERROR_MESSAGES', () => {
	it.each([
		['WRONG_CREDENTIALS', 'Wrong email or password'],
		['EMAIL_REQUIRED', 'Email is required'],
		['EMAIL_INVALID', 'Please provide a valid email address'],
		['EMAIL_TAKEN', 'This email is already registered'],
		['USERNAME_REQUIRED', 'Username is required'],
		['USERNAME_TAKEN', 'This username is taken'],
		['PASSWORD_REQUIRED', 'Password is required'],
		['PASSWORD_TOO_SHORT', 'Password must be at least 8 characters'],
		['PASSWORD_TOO_LONG', 'Password must be at most 72 bytes'],
		['PASSWORD_NOT_EDITABLE', 'Password cannot be changed from the profile form'],
		['BIO_TOO_LONG', 'Bio must be at most 150 characters'],
		['CAPTION_INVALID', 'Caption must be text'],
		['POST_NOT_FOUND', 'This post no longer exists'],
		['POST_FORBIDDEN', 'You can only change your own posts'],
	])('has the documented copy for %s', (code, copy) => {
		expect(ERROR_MESSAGES[code]).toBe(copy);
	});

	it.each([['UNAUTHENTICATED'], ['USER_NOT_FOUND'], ['INTERNAL_ERROR']])('has no copy for %s (the fallback or no message applies)', (code) => {
		expect(ERROR_MESSAGES[code]).toBeUndefined();
	});

	it('has copy for exactly the codes the spec documents, and no other', () => {
		expect(Object.keys(ERROR_MESSAGES)).toHaveLength(14);
	});
});

describe('ACTION_FALLBACK_MESSAGES', () => {
	it.each([
		['LOG_IN', "Couldn't log in. Try again."],
		['SIGN_UP', "Couldn't sign up. Try again."],
		['SAVE_PROFILE', "Couldn't save your profile. Try again."],
		['EDIT_CAPTION', "Couldn't save the caption. Try again."],
		['UPLOAD_PICTURE', "Couldn't upload the picture. Try again."],
		['DELETE_POST', "Couldn't delete the post. Try again."],
	])('has the documented copy for %s', (action, copy) => {
		expect(ACTION_FALLBACK_MESSAGES[action]).toBe(copy);
	});
});

describe('LOAD_ERROR_MESSAGES', () => {
	it('has the documented profile load error copy', () => {
		expect(LOAD_ERROR_MESSAGES.PROFILE).toEqual({
			HEADING: "Couldn't load this profile",
			DESCRIPTION: 'Check your connection and try again.',
			RETRY_LABEL: 'Retry',
		});
	});
});

describe('isKnownErrorCode', () => {
	it.each(Object.values(ERROR_CODES))('knows %s', (code) => {
		expect(isKnownErrorCode(code)).toBe(true);
	});

	it.each([['BAD_REQUEST'], ['SOMETHING_NEW'], [''], [undefined], [null], [42]])('does not know %p', (code) => {
		expect(isKnownErrorCode(code)).toBe(false);
	});
});
