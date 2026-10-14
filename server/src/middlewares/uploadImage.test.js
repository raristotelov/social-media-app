const express = require('express');

const uploadImage = require('./uploadImage');
const errorHandler = require('./errorHandler');
const constants = require('../config/constants');
const { ERROR_CODES, BAD_REQUEST_MESSAGE } = require('../config/errorCodes');

const FIELD_NAME = 'image';
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];

const buildImageBlob = (byteLength) => {
	const bytes = new Uint8Array(byteLength);

	bytes.set(JPEG_HEADER);

	return new Blob([bytes], { type: 'image/jpeg' });
};

const startApp = async () => {
	const app = express();

	app.post('/upload', uploadImage(FIELD_NAME), (req, res) => {
		res.json({
			hasFile: Boolean(req.file),
			fieldName: req.file?.fieldname,
			originalName: req.file?.originalname,
			size: req.file?.size,
			isMemoryBuffer: Buffer.isBuffer(req.file?.buffer),
			body: req.body,
		});
	});

	app.use(errorHandler);

	const server = await new Promise((resolve) => {
		const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
	});

	return { server, url: `http://127.0.0.1:${server.address().port}/upload` };
};

describe('uploadImage middleware', () => {
	let server;
	let url;
	let consoleErrorSpy;

	beforeEach(async () => {
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		({ server, url } = await startApp());
	});

	afterEach(async () => {
		consoleErrorSpy.mockRestore();
		await new Promise((resolve) => server.close(resolve));
	});

	describe('a valid upload', () => {
		it('exposes the received file in memory on req.file under the configured field', async () => {
			const formData = new FormData();

			formData.append(FIELD_NAME, buildImageBlob(2048), 'photo.jpg');

			const response = await fetch(url, { method: 'POST', body: formData });

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({
				hasFile: true,
				fieldName: FIELD_NAME,
				originalName: 'photo.jpg',
				size: 2048,
				isMemoryBuffer: true,
			});
		});

		it('keeps the text fields next to the file on req.body', async () => {
			const formData = new FormData();

			formData.append('caption', 'A sunny day');
			formData.append(FIELD_NAME, buildImageBlob(512), 'photo.jpg');

			const response = await fetch(url, { method: 'POST', body: formData });

			await expect(response.json()).resolves.toMatchObject({ hasFile: true, body: { caption: 'A sunny day' } });
		});

		it('accepts a file of exactly the maximum size', async () => {
			const formData = new FormData();

			formData.append(FIELD_NAME, buildImageBlob(constants.MAX_IMAGE_BYTES), 'photo.jpg');

			const response = await fetch(url, { method: 'POST', body: formData });

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ hasFile: true, size: constants.MAX_IMAGE_BYTES });
		});

		it('passes a multipart request without any file through with no req.file', async () => {
			const formData = new FormData();

			formData.append('caption', 'No picture');

			const response = await fetch(url, { method: 'POST', body: formData });

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ hasFile: false, body: { caption: 'No picture' } });
		});
	});

	describe('a file over the size limit', () => {
		it('answers 413 IMAGE_TOO_LARGE with the field the file came from', async () => {
			const formData = new FormData();

			formData.append(FIELD_NAME, buildImageBlob(constants.MAX_IMAGE_BYTES + 1), 'huge.jpg');

			const response = await fetch(url, { method: 'POST', body: formData });

			expect(response.status).toBe(413);
			await expect(response.json()).resolves.toMatchObject({
				code: ERROR_CODES.IMAGE_TOO_LARGE,
				fields: { [FIELD_NAME]: ERROR_CODES.IMAGE_TOO_LARGE },
			});
		});

		it('keys the field error by the field name the middleware was created for', async () => {
			const app = express();

			app.post('/profile', uploadImage(constants.PROFILE_PICTURE_FIELD), (req, res) => res.json({}));
			app.use(errorHandler);

			const profileServer = await new Promise((resolve) => {
				const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
			});

			try {
				const formData = new FormData();

				formData.append(constants.PROFILE_PICTURE_FIELD, buildImageBlob(constants.MAX_IMAGE_BYTES + 1), 'huge.jpg');

				const response = await fetch(`http://127.0.0.1:${profileServer.address().port}/profile`, { method: 'POST', body: formData });

				expect(response.status).toBe(413);
				await expect(response.json()).resolves.toMatchObject({ fields: { [constants.PROFILE_PICTURE_FIELD]: ERROR_CODES.IMAGE_TOO_LARGE } });
			} finally {
				await new Promise((resolve) => profileServer.close(resolve));
			}
		});
	});

	describe('other multipart problems', () => {
		it('answers 400 BAD_REQUEST when the file arrives under an unexpected field name', async () => {
			const formData = new FormData();

			formData.append('somethingElse', buildImageBlob(256), 'photo.jpg');

			const response = await fetch(url, { method: 'POST', body: formData });

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toEqual({ code: ERROR_CODES.BAD_REQUEST, message: BAD_REQUEST_MESSAGE });
		});

		it('answers 400 BAD_REQUEST when more than one file is sent', async () => {
			const formData = new FormData();

			formData.append(FIELD_NAME, buildImageBlob(256), 'first.jpg');
			formData.append(FIELD_NAME, buildImageBlob(256), 'second.jpg');

			const response = await fetch(url, { method: 'POST', body: formData });

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.BAD_REQUEST });
		});

		it('answers 400 BAD_REQUEST for a multipart body that cannot be parsed', async () => {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'multipart/form-data; boundary=----broken' },
				body: '------broken\r\nContent-Disposition: form-data; name="image"; filename="a.jpg"\r\n\r\nno closing boundary',
			});

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.BAD_REQUEST });
		});

		it('does not leak the underlying multer message to the client', async () => {
			const formData = new FormData();

			formData.append('somethingElse', buildImageBlob(256), 'photo.jpg');

			const response = await fetch(url, { method: 'POST', body: formData });
			const body = await response.json();

			expect(body.message).toBe(BAD_REQUEST_MESSAGE);
			expect(body.fields).toBeUndefined();
		});
	});

	describe('a request that is not multipart', () => {
		it('passes a JSON request through to the next handler without a file', async () => {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ caption: 'json only' }),
			});

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ hasFile: false });
		});

		it('passes a request without a body through to the next handler', async () => {
			const response = await fetch(url, { method: 'POST' });

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ hasFile: false });
		});
	});
});
