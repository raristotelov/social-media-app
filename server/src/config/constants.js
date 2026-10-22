module.exports = {
	JWT_EXPIRY: 12 * 60 * 60,
	SALT_ROUNDS: 10,
	MIN_PASSWORD_LENGTH: 8,
	// bcrypt only uses the first 72 bytes of a password and truncates the rest silently
	MAX_PASSWORD_BYTES: 72,
	MAX_BIO_LENGTH: 150,
	MAX_CAPTION_LENGTH: 1000,
	COMMENT_PREVIEW_LIMIT: 2,
	MAX_IMAGE_BYTES: 10 * 1024 * 1024,
	POST_IMAGE_FIELD: 'image',
	STORY_IMAGE_FIELD: 'image',
	STORY_LIFETIME_MS: 24 * 60 * 60 * 1000,
	EXPIRED_STORIES_JOB_INTERVAL_MS: 60 * 60 * 1000,
	PROFILE_PICTURE_FIELD: 'profilePicture',
	ALLOWED_PROFILE_UPDATE_FIELDS: ['email', 'username', 'bio', 'theme', 'profilePicture'],
};
