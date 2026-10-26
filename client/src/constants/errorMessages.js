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
	[ERROR_CODES.CAPTION_TOO_LONG]: 'Caption must be at most 1000 characters',
	[ERROR_CODES.IMAGE_TYPE_INVALID]: 'Choose a JPEG, PNG or WebP image',
	[ERROR_CODES.IMAGE_TOO_LARGE]: 'This image is over 10 MB',
	[ERROR_CODES.POST_NOT_FOUND]: 'This post no longer exists',
	[ERROR_CODES.POST_FORBIDDEN]: 'You can only change your own posts',
	[ERROR_CODES.COMMENT_TEXT_REQUIRED]: "Comment can't be empty",
	[ERROR_CODES.COMMENT_NOT_FOUND]: 'This comment no longer exists',
	[ERROR_CODES.PROFILE_FORBIDDEN]: 'You can only change your own profile',
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
	UPDATE_LIKE: "Couldn't update your like. Try again.",
	ADD_COMMENT: "Couldn't post your comment. Try again.",
	ADD_REPLY: "Couldn't post your reply. Try again.",
	LOAD_STORIES: "Couldn't load stories. Try again.",
	DELETE_STORY: "Couldn't delete your story. Try again.",
	FOLLOW_USER: "Couldn't follow this user. Try again.",
	UNFOLLOW_USER: "Couldn't unfollow this user. Try again.",
});

export const LOAD_ERROR_MESSAGES = Object.freeze({
	PROFILE: Object.freeze({
		HEADING: "Couldn't load this profile",
		DESCRIPTION: 'Check your connection and try again.',
		RETRY_LABEL: 'Retry',
	}),
	FEED: Object.freeze({
		HEADING: "Couldn't load your feed",
		DESCRIPTION: 'Check your connection and try again.',
		RETRY_LABEL: 'Retry',
	}),
	POPULAR: Object.freeze({
		HEADING: "Couldn't load popular posts",
		DESCRIPTION: 'Check your connection and try again.',
		RETRY_LABEL: 'Retry',
	}),
	POPULAR_NEXT_BATCH: Object.freeze({
		MESSAGE: "Couldn't load more posts",
		RETRY_LABEL: 'Try again',
	}),
	COMMENTS: Object.freeze({
		MESSAGE: "Couldn't load comments",
		RETRY_LABEL: 'Try again',
	}),
	FOLLOW_LIST: Object.freeze({
		MESSAGE: "Couldn't load this list",
		RETRY_LABEL: 'Try again',
	}),
});
