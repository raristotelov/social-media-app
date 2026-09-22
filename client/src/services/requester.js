const request = async (method, token, url, data) => {
	const options = {};

	if (method !== 'GET') {
		options.method = method;

		if (data) {
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

	const response = await fetch(url, options);

	if (response.status === 204) {
		return {};
	}

	const result = await response.json();

	if (!response.ok) {
		const error = result !== null && typeof result === 'object' ? result : { message: result };

		error.status = response.status;

		throw error;
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
