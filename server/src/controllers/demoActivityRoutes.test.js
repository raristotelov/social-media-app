jest.mock('../services', () => ({
	userService: {},
	userPostService: {},
	commentService: {},
	storyService: {},
	suggestionService: {},
}));

jest.mock('../jobs/demoActivityJob', () => ({
	triggerDemoActivity: jest.fn(),
}));

const express = require('express');

const { triggerDemoActivity } = require('../jobs/demoActivityJob');
const router = require('../router');
const errorHandler = require('../middlewares/errorHandler');
const { ERROR_CODES } = require('../config/errorCodes');

const TOKEN = 'demo-activity-routes-test-token';
const URL_PATH = '/internal/demo-activity';

describe('POST /internal/demo-activity', () => {
	let server;
	let baseUrl;
	let originalToken;
	let consoleErrorSpy;

	const post = (headers = {}) => fetch(`${baseUrl}${URL_PATH}`, { method: 'POST', headers });

	beforeAll(async () => {
		const app = express();

		app.use(express.json());
		app.use(router);
		app.use(errorHandler);

		server = await new Promise((resolve) => {
			const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
		});
		baseUrl = `http://127.0.0.1:${server.address().port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		jest.resetAllMocks();
		originalToken = process.env.DEMO_ACTIVITY_TOKEN;
		process.env.DEMO_ACTIVITY_TOKEN = TOKEN;
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		triggerDemoActivity.mockResolvedValue(undefined);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();

		if (originalToken === undefined) {
			delete process.env.DEMO_ACTIVITY_TOKEN;
		} else {
			process.env.DEMO_ACTIVITY_TOKEN = originalToken;
		}
	});

	it('answers 202 with an empty body and triggers the job for the right Bearer token', async () => {
		const response = await post({ Authorization: `Bearer ${TOKEN}` });

		expect(response.status).toBe(202);
		expect(await response.text()).toBe('');
		expect(triggerDemoActivity).toHaveBeenCalledTimes(1);
	});

	it('answers 202 straight away while the job is still running in the background', async () => {
		triggerDemoActivity.mockReturnValue(new Promise(() => {}));

		const response = await post({ Authorization: `Bearer ${TOKEN}` });

		expect(response.status).toBe(202);
	});

	it('answers 404 and does not trigger the job when DEMO_ACTIVITY_TOKEN is not configured', async () => {
		delete process.env.DEMO_ACTIVITY_TOKEN;

		const response = await post({ Authorization: `Bearer ${TOKEN}` });

		expect(response.status).toBe(404);
		expect(triggerDemoActivity).not.toHaveBeenCalled();
	});

	it('answers 404 when DEMO_ACTIVITY_TOKEN is empty', async () => {
		process.env.DEMO_ACTIVITY_TOKEN = '';

		const response = await post({ Authorization: 'Bearer ' });

		expect(response.status).toBe(404);
		expect(triggerDemoActivity).not.toHaveBeenCalled();
	});

	it.each([
		['no Authorization header', {}],
		['a wrong token', { Authorization: 'Bearer wrong-token' }],
		['the token without the Bearer prefix', { Authorization: TOKEN }],
		['another scheme', { Authorization: `Basic ${TOKEN}` }],
		['a user JWT header instead', { 'X-Authorization': TOKEN }],
	])('answers 401 UNAUTHENTICATED for %s, without triggering the job', async (description, headers) => {
		const response = await post(headers);
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		expect(triggerDemoActivity).not.toHaveBeenCalled();
	});

	it('does not answer GET, so the job cannot be triggered by a link', async () => {
		const response = await fetch(`${baseUrl}${URL_PATH}`, { headers: { Authorization: `Bearer ${TOKEN}` } });

		expect(response.status).toBe(404);
		expect(triggerDemoActivity).not.toHaveBeenCalled();
	});
});
