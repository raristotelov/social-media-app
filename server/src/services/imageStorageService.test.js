jest.mock('../config/cloudinary', () => ({
	cloudinary: { uploader: { upload_stream: jest.fn(), destroy: jest.fn() } },
	isConfigured: jest.fn(),
	getUploadFolder: jest.fn(),
}));

const { cloudinary, isConfigured, getUploadFolder } = require('../config/cloudinary');
const constants = require('../config/constants');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');
const { uploadImage, deleteImage, discardUploadedImage } = require('./imageStorageService');

const FIELD_NAME = 'image';
const UPLOAD_FOLDER = 'social-media-app/staging';
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP_BUFFER = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

const buildFile = (buffer = JPEG_BUFFER) => ({ buffer, originalname: 'photo.jpg', mimetype: 'image/jpeg' });

const givenCloudinaryUploadResolves = (
	result = { public_id: 'abc123', secure_url: 'https://res.cloudinary.com/demo/abc123.jpg', width: 1080, height: 1350 },
) => {
	const end = jest.fn();

	cloudinary.uploader.upload_stream.mockImplementation((options, callback) => {
		end.mockImplementation(() => callback(undefined, result));

		return { end };
	});

	return end;
};

const givenCloudinaryUploadFails = (error) => {
	cloudinary.uploader.upload_stream.mockImplementation((options, callback) => ({ end: () => callback(error, undefined) }));
};

describe('imageStorageService', () => {
	let consoleErrorSpy;

	beforeEach(() => {
		jest.resetAllMocks();
		isConfigured.mockReturnValue(true);
		getUploadFolder.mockReturnValue(UPLOAD_FOLDER);
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('uploadImage', () => {
		it('resolves with the Cloudinary public id, secure url, width and height', async () => {
			givenCloudinaryUploadResolves();

			const result = await uploadImage({ file: buildFile(), fieldName: FIELD_NAME });

			expect(result).toEqual({
				imageIdentifier: 'abc123',
				imageUrl: 'https://res.cloudinary.com/demo/abc123.jpg',
				imageWidth: 1080,
				imageHeight: 1350,
			});
		});

		it('returns the width and height Cloudinary reports for a landscape image', async () => {
			givenCloudinaryUploadResolves({ public_id: 'wide1', secure_url: 'https://res.cloudinary.com/demo/wide1.jpg', width: 1920, height: 1080 });

			const result = await uploadImage({ file: buildFile(), fieldName: FIELD_NAME });

			expect(result).toMatchObject({ imageWidth: 1920, imageHeight: 1080 });
		});

		it('streams the file buffer to Cloudinary', async () => {
			const end = givenCloudinaryUploadResolves();

			await uploadImage({ file: buildFile(), fieldName: FIELD_NAME });

			expect(end).toHaveBeenCalledWith(JPEG_BUFFER);
		});

		it('uploads as an image restricted to JPEG, PNG and WebP', async () => {
			givenCloudinaryUploadResolves();

			await uploadImage({ file: buildFile(), fieldName: FIELD_NAME });

			expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
				expect.objectContaining({ resource_type: 'image', allowed_formats: ['jpg', 'png', 'webp'] }),
				expect.any(Function),
			);
		});

		it('uploads into the configured folder', async () => {
			givenCloudinaryUploadResolves();

			await uploadImage({ file: buildFile(), fieldName: FIELD_NAME });

			expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(expect.objectContaining({ folder: UPLOAD_FOLDER }), expect.any(Function));
		});

		it('uses whichever folder is currently configured', async () => {
			getUploadFolder.mockReturnValue('social-media-app/production');
			givenCloudinaryUploadResolves();

			await uploadImage({ file: buildFile(), fieldName: FIELD_NAME });

			expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
				expect.objectContaining({ folder: 'social-media-app/production' }),
				expect.any(Function),
			);
		});

		it.each([
			['JPEG', JPEG_BUFFER],
			['PNG', PNG_BUFFER],
			['WebP', WEBP_BUFFER],
		])('accepts a %s file', async (_name, buffer) => {
			givenCloudinaryUploadResolves();

			await expect(uploadImage({ file: buildFile(buffer), fieldName: FIELD_NAME })).resolves.toMatchObject({ imageIdentifier: 'abc123' });
		});

		describe('size limit', () => {
			it('accepts a file of exactly the maximum size', async () => {
				const buffer = Buffer.alloc(constants.MAX_IMAGE_BYTES);

				JPEG_BUFFER.copy(buffer);
				givenCloudinaryUploadResolves();

				await expect(uploadImage({ file: buildFile(buffer), fieldName: FIELD_NAME })).resolves.toMatchObject({ imageIdentifier: 'abc123' });
			});

			it('rejects a file over the maximum size with a 413 IMAGE_TOO_LARGE keyed by the field, without uploading', async () => {
				const buffer = Buffer.alloc(constants.MAX_IMAGE_BYTES + 1);

				JPEG_BUFFER.copy(buffer);

				await expect(uploadImage({ file: buildFile(buffer), fieldName: FIELD_NAME })).rejects.toMatchObject({
					statusCode: 413,
					code: ERROR_CODES.IMAGE_TOO_LARGE,
					fields: { [FIELD_NAME]: ERROR_CODES.IMAGE_TOO_LARGE },
				});

				expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
			});

			it('keys the error by the field name it was given', async () => {
				const buffer = Buffer.alloc(constants.MAX_IMAGE_BYTES + 1);

				await expect(uploadImage({ file: buildFile(buffer), fieldName: 'profilePicture' })).rejects.toMatchObject({
					fields: { profilePicture: ERROR_CODES.IMAGE_TOO_LARGE },
				});
			});

			it('reports the size before the type, so an oversized non-image gets the size error', async () => {
				const buffer = Buffer.alloc(constants.MAX_IMAGE_BYTES + 1, 0x41);

				await expect(uploadImage({ file: buildFile(buffer), fieldName: FIELD_NAME })).rejects.toMatchObject({ statusCode: 413 });
			});
		});

		describe('type check', () => {
			it('rejects a text file renamed to .jpg with a 400 IMAGE_TYPE_INVALID keyed by the field, without uploading', async () => {
				const file = { buffer: Buffer.from('plain text pretending to be a photo'), originalname: 'photo.jpg', mimetype: 'image/jpeg' };

				await expect(uploadImage({ file, fieldName: FIELD_NAME })).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.IMAGE_TYPE_INVALID,
					fields: { [FIELD_NAME]: ERROR_CODES.IMAGE_TYPE_INVALID },
				});

				expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
			});

			it('rejects a GIF even when its declared MIME type claims to be a JPEG', async () => {
				const file = { buffer: Buffer.from('GIF89a\x01\x00\x01\x00', 'binary'), mimetype: 'image/jpeg' };

				await expect(uploadImage({ file, fieldName: FIELD_NAME })).rejects.toMatchObject({ code: ERROR_CODES.IMAGE_TYPE_INVALID });
			});

			it('rejects an empty file', async () => {
				await expect(uploadImage({ file: buildFile(Buffer.alloc(0)), fieldName: FIELD_NAME })).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.IMAGE_TYPE_INVALID,
				});
			});
		});

		describe('missing file', () => {
			it.each([[undefined], [null], [{}], [{ buffer: 'not a buffer' }]])(
				'rejects %p with a 400 BAD_REQUEST without uploading',
				async (file) => {
					await expect(uploadImage({ file, fieldName: FIELD_NAME })).rejects.toMatchObject({
						statusCode: 400,
						code: ERROR_CODES.BAD_REQUEST,
					});

					expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
				},
			);
		});

		describe('Cloudinary problems', () => {
			it('rejects with a 500 when Cloudinary is not configured, without uploading', async () => {
				isConfigured.mockReturnValue(false);

				await expect(uploadImage({ file: buildFile(), fieldName: FIELD_NAME })).rejects.toMatchObject({ statusCode: 500 });

				expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
			});

			it.each([[undefined], [null], ['']])('rejects with a 500 when the upload folder is %p, without uploading', async (folder) => {
				getUploadFolder.mockReturnValue(folder);

				await expect(uploadImage({ file: buildFile(), fieldName: FIELD_NAME })).rejects.toMatchObject({ statusCode: 500 });

				expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
			});

			it('wraps a Cloudinary upload error in a 502 and keeps it as the cause', async () => {
				const cloudinaryError = new Error('Invalid API key');

				givenCloudinaryUploadFails(cloudinaryError);

				const error = await uploadImage({ file: buildFile(), fieldName: FIELD_NAME }).catch((caught) => caught);

				expect(error).toBeInstanceOf(AppError);
				expect(error.statusCode).toBe(502);
				expect(error.cause).toBe(cloudinaryError);
			});

			it('rejects with a 502 when Cloudinary returns neither an error nor a result', async () => {
				givenCloudinaryUploadFails(undefined);

				await expect(uploadImage({ file: buildFile(), fieldName: FIELD_NAME })).rejects.toMatchObject({ statusCode: 502 });
			});

			it('marks a Cloudinary failure as unexpected so the client only sees the generic message', async () => {
				givenCloudinaryUploadFails(new Error('boom'));

				await expect(uploadImage({ file: buildFile(), fieldName: FIELD_NAME })).rejects.toMatchObject({ isOperational: false });
			});
		});
	});

	describe('deleteImage', () => {
		it('skips Cloudinary when there is no identifier', async () => {
			await expect(deleteImage(undefined)).resolves.toEqual({ result: 'skipped' });

			expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
		});

		it('destroys the image and invalidates the CDN cache', async () => {
			cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

			await expect(deleteImage('abc123')).resolves.toEqual({ result: 'ok' });

			expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('abc123', { invalidate: true });
		});

		it('treats an image Cloudinary no longer has as already deleted', async () => {
			cloudinary.uploader.destroy.mockResolvedValue({ result: 'not found' });

			await expect(deleteImage('abc123')).resolves.toEqual({ result: 'not found' });
		});

		it('rejects with a 502 for any other Cloudinary result', async () => {
			cloudinary.uploader.destroy.mockResolvedValue({ result: 'error' });

			await expect(deleteImage('abc123')).rejects.toMatchObject({ statusCode: 502 });
		});

		it('wraps a thrown Cloudinary error in a 502', async () => {
			const cloudinaryError = new Error('network down');

			cloudinary.uploader.destroy.mockRejectedValue(cloudinaryError);

			await expect(deleteImage('abc123')).rejects.toMatchObject({ statusCode: 502, cause: cloudinaryError });
		});

		it('still deletes when the upload folder is not set, since deletes use the public id', async () => {
			getUploadFolder.mockReturnValue(undefined);
			cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

			await expect(deleteImage('abc123')).resolves.toEqual({ result: 'ok' });

			expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('abc123', { invalidate: true });
		});

		it('rejects with a 500 when Cloudinary is not configured', async () => {
			isConfigured.mockReturnValue(false);

			await expect(deleteImage('abc123')).rejects.toMatchObject({ statusCode: 500 });

			expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
		});
	});

	describe('discardUploadedImage', () => {
		it('destroys the uploaded image', async () => {
			cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

			await discardUploadedImage('abc123');

			expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('abc123', { invalidate: true });
		});

		it('does not log anything when the destroy succeeds', async () => {
			cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

			await discardUploadedImage('abc123');

			expect(consoleErrorSpy).not.toHaveBeenCalled();
		});

		it('logs the failure with the image identifier and does not throw when the destroy fails', async () => {
			const cloudinaryError = new Error('network down');

			cloudinary.uploader.destroy.mockRejectedValue(cloudinaryError);

			await expect(discardUploadedImage('abc123')).resolves.toBeUndefined();

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('abc123'),
				expect.objectContaining({ statusCode: 502, cause: cloudinaryError }),
			);
		});

		it('logs instead of throwing when Cloudinary is not configured', async () => {
			isConfigured.mockReturnValue(false);

			await expect(discardUploadedImage('abc123')).resolves.toBeUndefined();

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});
	});
});
