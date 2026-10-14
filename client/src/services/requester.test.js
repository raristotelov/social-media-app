import { requestFactory, RequestError } from './requester';

const URL = 'http://localhost:3030/some/route';

const buildResponse = ({ status = 200, body, rejectJson = false } = {}) => ({
	ok: status >= 200 && status < 300,
	status,
	json: rejectJson ? jest.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')) : jest.fn().mockResolvedValue(body),
});

const catchError = async (promise) => {
	try {
		await promise;
	} catch (error) {
		return error;
	}

	throw new Error('Expected the request to reject');
};

describe('requester', () => {
	beforeEach(() => {
		global.fetch = jest.fn();
	});

	afterEach(() => {
		delete global.fetch;
	});

	describe('successful requests', () => {
		it('resolves with the parsed JSON body', async () => {
			fetch.mockResolvedValue(buildResponse({ body: { hello: 'world' } }));

			await expect(requestFactory().get(URL)).resolves.toEqual({ hello: 'world' });
		});

		it('resolves with an empty object for a 204 without reading a body', async () => {
			const response = buildResponse({ status: 204 });

			fetch.mockResolvedValue(response);

			await expect(requestFactory('token').delete(URL)).resolves.toEqual({});
			expect(response.json).not.toHaveBeenCalled();
		});

		it('sends the token in the X-Authorization header', async () => {
			fetch.mockResolvedValue(buildResponse({ body: {} }));

			await requestFactory('token123').get(URL);

			expect(fetch).toHaveBeenCalledWith(URL, { headers: { 'X-Authorization': 'token123' } });
		});

		it('sends a JSON body with a content-type header for non-GET requests', async () => {
			fetch.mockResolvedValue(buildResponse({ body: {} }));

			await requestFactory().post(URL, { a: 1 });

			expect(fetch).toHaveBeenCalledWith(URL, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ a: 1 }),
			});
		});

		describe('with a FormData body', () => {
			const buildFormData = () => {
				const formData = new FormData();

				formData.append('caption', 'Sunset');

				return formData;
			};

			it('sends the FormData as the body untouched, so it is not JSON-stringified', async () => {
				const formData = buildFormData();

				fetch.mockResolvedValue(buildResponse({ body: {} }));

				await requestFactory().post(URL, formData);

				expect(fetch.mock.calls[0][1].body).toBe(formData);
			});

			it('sets no content-type header, leaving the browser to add the multipart boundary', async () => {
				fetch.mockResolvedValue(buildResponse({ body: {} }));

				await requestFactory().post(URL, buildFormData());

				expect(fetch).toHaveBeenCalledWith(URL, { method: 'POST', body: expect.any(FormData) });
			});

			it('still sends only the token header', async () => {
				fetch.mockResolvedValue(buildResponse({ body: {} }));

				await requestFactory('token123').patch(URL, buildFormData());

				expect(fetch).toHaveBeenCalledWith(URL, { method: 'PATCH', body: expect.any(FormData), headers: { 'X-Authorization': 'token123' } });
			});

			it('still normalises an error response for a FormData request', async () => {
				fetch.mockResolvedValue(
					buildResponse({
						status: 413,
						body: { code: 'IMAGE_TOO_LARGE', message: 'image: IMAGE_TOO_LARGE', fields: { image: 'IMAGE_TOO_LARGE' } },
					}),
				);

				const error = await catchError(requestFactory('token').post(URL, buildFormData()));

				expect(error).toBeInstanceOf(RequestError);
				expect(error.code).toBe('IMAGE_TOO_LARGE');
				expect(error.fields).toEqual({ image: 'IMAGE_TOO_LARGE' });
				expect(error.status).toBe(413);
			});
		});
	});

	describe('error normalisation', () => {
		it('rejects with a RequestError carrying code, fields and status from a JSON error body', async () => {
			fetch.mockResolvedValue(
				buildResponse({
					status: 409,
					body: { code: 'USERNAME_TAKEN', message: 'username: USERNAME_TAKEN', fields: { username: 'USERNAME_TAKEN' } },
				}),
			);

			const error = await catchError(requestFactory().post(URL, { username: 'x' }));

			expect(error).toBeInstanceOf(RequestError);
			expect(error.code).toBe('USERNAME_TAKEN');
			expect(error.fields).toEqual({ username: 'USERNAME_TAKEN' });
			expect(error.status).toBe(409);
		});

		it('keeps the developer message on the error, for logging only', async () => {
			fetch.mockResolvedValue(buildResponse({ status: 401, body: { code: 'WRONG_CREDENTIALS', message: 'Wrong email or password' } }));

			const error = await catchError(requestFactory().post(URL, {}));

			expect(error.message).toBe('Wrong email or password');
		});

		it('leaves fields undefined when the body has none', async () => {
			fetch.mockResolvedValue(buildResponse({ status: 404, body: { code: 'POST_NOT_FOUND', message: 'Post not found' } }));

			const error = await catchError(requestFactory('token').delete(URL));

			expect(error.code).toBe('POST_NOT_FOUND');
			expect(error.fields).toBeUndefined();
		});

		it('drops non-string field values', async () => {
			fetch.mockResolvedValue(
				buildResponse({
					status: 400,
					body: { code: 'EMAIL_INVALID', fields: { email: 'EMAIL_INVALID', username: 42, bio: null } },
				}),
			);

			const error = await catchError(requestFactory().post(URL, {}));

			expect(error.fields).toEqual({ email: 'EMAIL_INVALID' });
		});

		it.each([
			['a string', 'oops'],
			['an array', ['a']],
			['null', null],
		])('ignores fields given as %s', async (_name, fields) => {
			fetch.mockResolvedValue(buildResponse({ status: 400, body: { code: 'EMAIL_INVALID', fields } }));

			const error = await catchError(requestFactory().post(URL, {}));

			expect(error.fields).toBeUndefined();
		});

		it('maps an unknown code to INTERNAL_ERROR', async () => {
			fetch.mockResolvedValue(buildResponse({ status: 418, body: { code: 'TEAPOT', message: 'I am a teapot' } }));

			const error = await catchError(requestFactory().get(URL));

			expect(error.code).toBe('INTERNAL_ERROR');
			expect(error.status).toBe(418);
		});

		it('maps a missing code to INTERNAL_ERROR', async () => {
			fetch.mockResolvedValue(buildResponse({ status: 500, body: { message: 'Something went wrong' } }));

			const error = await catchError(requestFactory().get(URL));

			expect(error.code).toBe('INTERNAL_ERROR');
		});

		it('keeps the BAD_REQUEST status but treats the code as INTERNAL_ERROR, which the client does not know', async () => {
			fetch.mockResolvedValue(buildResponse({ status: 400, body: { code: 'BAD_REQUEST', message: 'Bad request' } }));

			const error = await catchError(requestFactory().post(URL, {}));

			expect(error.code).toBe('INTERNAL_ERROR');
			expect(error.status).toBe(400);
		});

		it('maps a non-JSON error body (e.g. an HTML 502 page) to INTERNAL_ERROR with the response status', async () => {
			fetch.mockResolvedValue(buildResponse({ status: 502, rejectJson: true }));

			const error = await catchError(requestFactory().get(URL));

			expect(error).toBeInstanceOf(RequestError);
			expect(error.code).toBe('INTERNAL_ERROR');
			expect(error.status).toBe(502);
			expect(error.fields).toBeUndefined();
		});

		it('maps a non-JSON body on a 2xx response to INTERNAL_ERROR', async () => {
			fetch.mockResolvedValue(buildResponse({ status: 200, rejectJson: true }));

			const error = await catchError(requestFactory().get(URL));

			expect(error.code).toBe('INTERNAL_ERROR');
			expect(error.status).toBe(200);
		});

		it('maps a JSON body that is not an object to INTERNAL_ERROR', async () => {
			fetch.mockResolvedValue(buildResponse({ status: 500, body: 'plain text' }));

			const error = await catchError(requestFactory().get(URL));

			expect(error.code).toBe('INTERNAL_ERROR');
		});

		it('maps a network failure to INTERNAL_ERROR with status 0 and keeps the cause', async () => {
			const networkError = new TypeError('Failed to fetch');

			fetch.mockRejectedValue(networkError);

			const error = await catchError(requestFactory().get(URL));

			expect(error).toBeInstanceOf(RequestError);
			expect(error.code).toBe('INTERNAL_ERROR');
			expect(error.status).toBe(0);
			expect(error.cause).toBe(networkError);
		});

		it('keeps UNAUTHENTICATED as its own code so the session can be ended', async () => {
			fetch.mockResolvedValue(buildResponse({ status: 401, body: { code: 'UNAUTHENTICATED', message: 'Unauthorized' } }));

			const error = await catchError(requestFactory('expired').get(URL));

			expect(error.code).toBe('UNAUTHENTICATED');
			expect(error.status).toBe(401);
		});
	});
});
