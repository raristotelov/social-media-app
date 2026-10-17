const { cloudinary, isConfigured, getUploadFolder } = require('../config/cloudinary');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { detectImageType } = require('../utils/imageType');

const ALLOWED_IMAGE_FORMATS = ['jpg', 'png', 'webp'];

const uploadBuffer = (buffer, folder) =>
	new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{ resource_type: 'image', allowed_formats: ALLOWED_IMAGE_FORMATS, folder },
			(error, result) => {
				if (error || !result) {
					reject(error || new Error('Cloudinary returned no upload result'));

					return;
				}

				resolve(result);
			},
		);

		uploadStream.end(buffer);
	});

const validateImageFile = (file, fieldName) => {
	if (!file || !Buffer.isBuffer(file.buffer)) {
		throw new AppError('Image is required', 400, { code: ERROR_CODES.BAD_REQUEST });
	}

	if (file.buffer.length > constants.MAX_IMAGE_BYTES) {
		throw AppError.fromFields({ [fieldName]: ERROR_CODES.IMAGE_TOO_LARGE }, 413);
	}

	if (!detectImageType(file.buffer)) {
		throw AppError.fromFields({ [fieldName]: ERROR_CODES.IMAGE_TYPE_INVALID }, 400);
	}
};

const uploadImage = async ({ file, fieldName }) => {
	validateImageFile(file, fieldName);

	const folder = getUploadFolder();

	if (!isConfigured() || !folder) {
		throw new AppError('Cloudinary is not configured; cannot upload image', 500);
	}

	try {
		const result = await uploadBuffer(file.buffer, folder);

		return {
			imageIdentifier: result.public_id,
			imageUrl: result.secure_url,
		};
	} catch (error) {
		throw new AppError('Could not upload image', 502, { cause: error });
	}
};

const deleteImage = async (imageIdentifier) => {
	if (!imageIdentifier) {
		return { result: 'skipped' };
	}

	if (!isConfigured()) {
		throw new AppError('Cloudinary is not configured; cannot delete image', 500);
	}

	try {
		const result = await cloudinary.uploader.destroy(imageIdentifier, { invalidate: true });

		if (result.result !== 'ok' && result.result !== 'not found') {
			throw new AppError(`Could not delete image ${imageIdentifier}: ${result.result}`, 502);
		}

		return result;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError(`Could not delete image ${imageIdentifier}`, 502, { cause: error });
	}
};

const discardUploadedImage = async (imageIdentifier) => {
	try {
		await deleteImage(imageIdentifier);
	} catch (error) {
		console.error(`Could not discard uploaded image ${imageIdentifier}`, error);
	}
};

module.exports = {
	uploadImage,
	deleteImage,
	discardUploadedImage,
};
