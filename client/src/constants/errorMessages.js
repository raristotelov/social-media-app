import { ERROR_CODES } from './errorCodes';

export const ERROR_MESSAGES = Object.freeze({
	[ERROR_CODES.WRONG_CREDENTIALS]: 'Wrong email or password',
	[ERROR_CODES.EMAIL_REQUIRED]: 'Email is required',
	[ERROR_CODES.EMAIL_INVALID]: 'Please provide a valid email address',
	[ERROR_CODES.EMAIL_TAKEN]: 'This email is already registered',
	[ERROR_CODES.USERNAME_REQUIRED]: 'Username is required',
	[ERROR_CODES.USERNAME_TAKEN]: 'This username is taken',
	[ERROR_CODES.PASSWORD_REQUIRED]: 'Password is required',
	[ERROR_CODES.PASSWORD_TOO_SHORT]: 'Password must be at least 8 characters',
	[ERROR_CODES.PASSWORD_TOO_LONG]: 'Password must be at most 72 bytes',
	[ERROR_CODES.PASSWORD_NOT_EDITABLE]: 'Password cannot be changed from the profile form',
	[ERROR_CODES.BIO_TOO_LONG]: 'Bio must be at most 150 characters',
	[ERROR_CODES.CAPTION_INVALID]: 'Caption must be text',
	[ERROR_CODES.POST_NOT_FOUND]: 'This post no longer exists',
	[ERROR_CODES.POST_FORBIDDEN]: 'You can only change your own posts',
});

export const VALIDATION_MESSAGES = Object.freeze({
	REPEAT_PASSWORD_REQUIRED: 'Please repeat your password',
	PASSWORDS_DO_NOT_MATCH: 'Passwords do not match',
	PICTURE_REQUIRED: 'Please choose a picture',
});

export const ACTION_FALLBACK_MESSAGES = Object.freeze({
	LOG_IN: "Couldn't log in. Try again.",
	SIGN_UP: "Couldn't sign up. Try again.",
	SAVE_PROFILE: "Couldn't save your profile. Try again.",
	EDIT_CAPTION: "Couldn't save the caption. Try again.",
	UPLOAD_PICTURE: "Couldn't upload the picture. Try again.",
	DELETE_POST: "Couldn't delete the post. Try again.",
});

export const LOAD_ERROR_MESSAGES = Object.freeze({
	PROFILE: Object.freeze({
		HEADING: "Couldn't load this profile",
		DESCRIPTION: 'Check your connection and try again.',
		RETRY_LABEL: 'Retry',
	}),
});
