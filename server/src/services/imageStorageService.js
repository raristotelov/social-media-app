const { cloudinary, isConfigured } = require('../config/cloudinary');
const AppError = require('../utils/AppError');

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

module.exports = {
	deleteImage,
};
