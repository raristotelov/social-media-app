import { ERROR_CODES, isKnownErrorCode } from './errorCodes';
import { ACTION_FALLBACK_MESSAGES, CRASH_MESSAGES, ERROR_MESSAGES, LOAD_ERROR_MESSAGES } from './errorMessages';

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
		['CURRENT_PASSWORD_WRONG', 'Current password is incorrect'],
		['PASSWORD_UNCHANGED', 'New password must be different from the current one'],
		['BIO_TOO_LONG', 'Bio must be at most 150 characters'],
		['CAPTION_INVALID', 'Caption must be text'],
		['CAPTION_TOO_LONG', 'Caption must be at most 1000 characters'],
		['IMAGE_TYPE_INVALID', 'Choose a JPEG, PNG or WebP image'],
		['IMAGE_TOO_LARGE', 'This image is over 10 MB'],
		['POST_NOT_FOUND', 'This post no longer exists'],
		['POST_FORBIDDEN', 'You can only change your own posts'],
		['COMMENT_TEXT_REQUIRED', "Comment can't be empty"],
		['COMMENT_NOT_FOUND', 'This comment no longer exists'],
		['PROFILE_FORBIDDEN', 'You can only change your own profile'],
	])('has the documented copy for %s', (code, copy) => {
		expect(ERROR_MESSAGES[code]).toBe(copy);
	});

	it.each([['UNAUTHENTICATED'], ['USER_NOT_FOUND'], ['INTERNAL_ERROR'], ['STORY_NOT_FOUND'], ['STORY_FORBIDDEN']])(
		'has no copy for %s (the fallback or no message applies)',
		(code) => {
			expect(ERROR_MESSAGES[code]).toBeUndefined();
		},
	);

	it('has copy for exactly the codes the spec documents, and no other', () => {
		expect(Object.keys(ERROR_MESSAGES)).toHaveLength(22);
	});
});

describe('ACTION_FALLBACK_MESSAGES', () => {
	it.each([
		['LOG_IN', "Couldn't log in. Try again."],
		['SIGN_UP', "Couldn't sign up. Try again."],
		['SAVE_PROFILE', "Couldn't save your profile. Try again."],
		['CHANGE_PASSWORD', "Couldn't change your password. Try again."],
		['EDIT_CAPTION', "Couldn't save the caption. Try again."],
		['UPLOAD_PICTURE', "Couldn't upload the picture. Try again."],
		['DELETE_POST', "Couldn't delete the post. Try again."],
		['UPDATE_LIKE', "Couldn't update your like. Try again."],
		['ADD_COMMENT', "Couldn't post your comment. Try again."],
		['ADD_REPLY', "Couldn't post your reply. Try again."],
		['LOAD_STORIES', "Couldn't load stories. Try again."],
		['DELETE_STORY', "Couldn't delete your story. Try again."],
		['FOLLOW_USER', "Couldn't follow this user. Try again."],
		['UNFOLLOW_USER', "Couldn't unfollow this user. Try again."],
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

	it('has the documented feed load error copy', () => {
		expect(LOAD_ERROR_MESSAGES.FEED).toEqual({
			HEADING: "Couldn't load your feed",
			DESCRIPTION: 'Check your connection and try again.',
			RETRY_LABEL: 'Retry',
		});
	});

	it('has the documented popular posts load error copy', () => {
		expect(LOAD_ERROR_MESSAGES.POPULAR).toEqual({
			HEADING: "Couldn't load popular posts",
			DESCRIPTION: 'Check your connection and try again.',
			RETRY_LABEL: 'Retry',
		});
	});

	it('has the documented 404 page copy', () => {
		expect(LOAD_ERROR_MESSAGES.NOT_FOUND).toEqual({
			HEADING: 'Page not found',
			DESCRIPTION: 'This link may be broken, or the page may have been removed.',
			RETRY_LABEL: 'Go home',
		});
	});

	it('has the documented inline next batch load error copy', () => {
		expect(LOAD_ERROR_MESSAGES.POPULAR_NEXT_BATCH).toEqual({
			MESSAGE: "Couldn't load more posts",
			RETRY_LABEL: 'Try again',
		});
	});

	it('has the documented inline comments load error copy', () => {
		expect(LOAD_ERROR_MESSAGES.COMMENTS).toEqual({
			MESSAGE: "Couldn't load comments",
			RETRY_LABEL: 'Try again',
		});
	});

	it('has the documented user list load error copy', () => {
		expect(LOAD_ERROR_MESSAGES.USER_LIST).toEqual({
			MESSAGE: "Couldn't load this list",
			RETRY_LABEL: 'Try again',
		});
	});
});

describe('CRASH_MESSAGES', () => {
	it('has the documented "Something went wrong" page copy', () => {
		expect(CRASH_MESSAGES).toEqual({
			HEADING: 'Something went wrong',
			DESCRIPTION: 'Try reloading the page.',
			RELOAD_LABEL: 'Reload',
			GO_HOME_LABEL: 'Go home',
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
