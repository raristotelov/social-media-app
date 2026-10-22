export const MAX_BIO_LENGTH = 150;

export const MAX_CAPTION_LENGTH = 1000;

export const ACCEPTED_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const MAX_IMAGE_LONG_EDGE = 2048;

export const RESIZED_IMAGE_TYPE = 'image/jpeg';

export const RESIZED_IMAGE_EXTENSION = 'jpg';

export const RESIZED_IMAGE_QUALITY = 0.9;

export const RESIZED_IMAGE_BACKGROUND = '#ffffff';

export const UPLOAD_FIELDS = Object.freeze({
	POST_IMAGE: 'image',
	POST_CAPTION: 'caption',
	PROFILE_PICTURE: 'profilePicture',
});
