import { ERROR_CODES, isKnownErrorCode } from '../constants/errorCodes';

const NETWORK_FAILURE_STATUS = 0;

export class RequestError extends Error {
	constructor({ code, fields, status, message, cause }) {
		super(message, { cause });
		this.name = 'RequestError';
		this.code = code;
		this.fields = fields;
		this.status = status;
	}
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const readFields = (fields) => {
	if (!isPlainObject(fields)) {
		return undefined;
	}

	const fieldCodes = {};

	Object.entries(fields).forEach(([field, code]) => {
		if (typeof code === 'string') {
			fieldCodes[field] = code;
		}
	});

	return Object.keys(fieldCodes).length ? fieldCodes : undefined;
};

const createRequestError = ({ status, body, cause }) => {
	const errorBody = isPlainObject(body) ? body : {};

	return new RequestError({
		code: isKnownErrorCode(errorBody.code) ? errorBody.code : ERROR_CODES.INTERNAL_ERROR,
		fields: readFields(errorBody.fields),
		status,
		message: typeof errorBody.message === 'string' ? errorBody.message : `Request failed with status ${status}`,
		cause,
	});
};

const readJsonBody = async (response) => {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
};

const request = async (method, token, url, data) => {
	const options = {};

	if (method !== 'GET') {
		options.method = method;

		if (data instanceof FormData) {
			options.body = data;
		} else if (data) {
			options.headers = {
				'content-type': 'application/json',
			};

			options.body = JSON.stringify(data);
		}
	}

	if (token) {
		options.headers = {
			...options.headers,
			'X-Authorization': token,
		};
	}

	let response;

	try {
		response = await fetch(url, options);
	} catch (networkError) {
		throw createRequestError({ status: NETWORK_FAILURE_STATUS, cause: networkError });
	}

	if (response.status === 204) {
		return {};
	}

	const result = await readJsonBody(response);

	if (!response.ok || result === undefined) {
		throw createRequestError({ status: response.status, body: result });
	}

	return result;
};

export const requestFactory = (token) => {
	return {
		get: request.bind(null, 'GET', token),
		post: request.bind(null, 'POST', token),
		put: request.bind(null, 'PUT', token),
		patch: request.bind(null, 'PATCH', token),
		delete: request.bind(null, 'DELETE', token),
	};
};
