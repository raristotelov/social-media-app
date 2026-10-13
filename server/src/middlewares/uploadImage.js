const multer = require('multer');

const constants = require('../config/constants');
const { ERROR_CODES, BAD_REQUEST_MESSAGE } = require('../config/errorCodes');
const AppError = require('../utils/AppError');

const LIMIT_FILE_SIZE_CODE = 'LIMIT_FILE_SIZE';

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: constants.MAX_IMAGE_BYTES, files: 1 },
});

const toUploadError = (error, fieldName) => {
	if (error instanceof multer.MulterError && error.code === LIMIT_FILE_SIZE_CODE) {
		return AppError.fromFields({ [fieldName]: ERROR_CODES.IMAGE_TOO_LARGE }, 413, { cause: error });
	}

	return new AppError(BAD_REQUEST_MESSAGE, 400, { code: ERROR_CODES.BAD_REQUEST, cause: error });
};

module.exports = (fieldName) => {
	const receiveFile = upload.single(fieldName);

	return (req, res, next) => {
		receiveFile(req, res, (error) => {
			if (error) {
				next(toUploadError(error, fieldName));

				return;
			}

			next();
		});
	};
};
