jest.mock('../services', () => ({
	userService: {},
	userPostService: {},
	commentService: {},
	storyService: {},
	suggestionService: {
		getSuggestions: jest.fn(),
		dismissCarousel: jest.fn(),
	},
}));

const express = require('express');
const JWT = require('jsonwebtoken');

const { suggestionService } = require('../services');
const suggestionController = require('./suggestionController');
const errorHandler = require('../middlewares/errorHandler');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const JWT_SECRET = 'suggestion-routes-test-secret';

const SUGGESTIONS_RESULT = {
	suggestions: [{ _id: '64b7f0a1c2d3e4f5a6b7c8d2', username: 'alice', group: 'popular' }],
	reserve: [],
	isCarouselDismissed: false,
};

describe('suggestion routes', () => {
	let server;
	let baseUrl;
	let originalJwtSecret;
	let consoleErrorSpy;

	const authHeaders = () => ({ 'X-Authorization': JWT.sign({ userId: USER_ID, username: 'realuser' }, JWT_SECRET) });

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		const app = express();

		app.use(express.json());
		app.use('/suggestions', suggestionController);
		app.use(errorHandler);

		server = await new Promise((resolve) => {
			const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
		});
		baseUrl = `http://127.0.0.1:${server.address().port}`;
	});

	afterAll(async () => {
		process.env.JWT_SECRET = originalJwtSecret;
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		jest.resetAllMocks();
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		suggestionService.getSuggestions.mockResolvedValue(SUGGESTIONS_RESULT);
		suggestionService.dismissCarousel.mockResolvedValue(undefined);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('authentication', () => {
		it.each([
			['GET', '/suggestions?placement=sidebar'],
			['GET', '/suggestions?placement=carousel'],
			['GET', '/suggestions?placement=empty-feed'],
			['GET', '/suggestions'],
			['POST', '/suggestions/carousel/dismiss'],
		])('answers 401 UNAUTHENTICATED to %s %s without a token, without calling the service', async (method, path) => {
			const response = await fetch(`${baseUrl}${path}`, { method });
			const body = await response.json();

			expect(response.status).toBe(401);
			expect(body.code).toBe(ERROR_CODES.UNAUTHENTICATED);
			Object.values(suggestionService).forEach((serviceMethod) => expect(serviceMethod).not.toHaveBeenCalled());
		});

		it.each([
			['GET', '/suggestions?placement=sidebar'],
			['POST', '/suggestions/carousel/dismiss'],
		])('answers 401 to %s %s with a token signed with the wrong secret', async (method, path) => {
			const response = await fetch(`${baseUrl}${path}`, {
				method,
				headers: { 'X-Authorization': JWT.sign({ userId: USER_ID }, 'another-secret') },
			});

			expect(response.status).toBe(401);
			Object.values(suggestionService).forEach((serviceMethod) => expect(serviceMethod).not.toHaveBeenCalled());
		});
	});

	describe('GET /suggestions', () => {
		it.each([['sidebar'], ['carousel'], ['empty-feed']])(
			'asks for the %s placement on behalf of the signed-in user and answers 200 with the result',
			async (placement) => {
				const response = await fetch(`${baseUrl}/suggestions?placement=${placement}`, { headers: authHeaders() });

				expect(response.status).toBe(200);
				expect(await response.json()).toEqual(SUGGESTIONS_RESULT);
				expect(suggestionService.getSuggestions).toHaveBeenCalledWith({ userId: USER_ID, placement });
			},
		);

		it('passes a missing placement on as undefined, leaving the 400 to the service', async () => {
			await fetch(`${baseUrl}/suggestions`, { headers: authHeaders() });

			expect(suggestionService.getSuggestions).toHaveBeenCalledWith({ userId: USER_ID, placement: undefined });
		});

		it('answers 400 BAD_REQUEST when the service rejects an unknown placement', async () => {
			suggestionService.getSuggestions.mockRejectedValue(new AppError('Unknown suggestions placement', 400, { code: ERROR_CODES.BAD_REQUEST }));

			const response = await fetch(`${baseUrl}/suggestions?placement=nowhere`, { headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.code).toBe(ERROR_CODES.BAD_REQUEST);
		});

		it('answers 401 UNAUTHENTICATED when the account was deleted', async () => {
			suggestionService.getSuggestions.mockRejectedValue(new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED }));

			const response = await fetch(`${baseUrl}/suggestions?placement=sidebar`, { headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(401);
			expect(body.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		});

		it('answers 500 INTERNAL_ERROR without leaking the cause when the service fails', async () => {
			suggestionService.getSuggestions.mockRejectedValue(new AppError('Could not load suggestions', 500, { cause: new Error('db password') }));

			const response = await fetch(`${baseUrl}/suggestions?placement=sidebar`, { headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(500);
			expect(body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
			expect(JSON.stringify(body)).not.toContain('db password');
		});
	});

	describe('POST /suggestions/carousel/dismiss', () => {
		it('dismisses the carousel for the signed-in user and answers 204 with no body', async () => {
			const response = await fetch(`${baseUrl}/suggestions/carousel/dismiss`, { method: 'POST', headers: authHeaders() });

			expect(response.status).toBe(204);
			expect(await response.text()).toBe('');
			expect(suggestionService.dismissCarousel).toHaveBeenCalledWith(USER_ID);
		});

		it('does not ask for any suggestions', async () => {
			await fetch(`${baseUrl}/suggestions/carousel/dismiss`, { method: 'POST', headers: authHeaders() });

			expect(suggestionService.getSuggestions).not.toHaveBeenCalled();
		});

		it('answers 401 UNAUTHENTICATED when the account was deleted', async () => {
			suggestionService.dismissCarousel.mockRejectedValue(new AppError('Unauthorized', 401, { code: ERROR_CODES.UNAUTHENTICATED }));

			const response = await fetch(`${baseUrl}/suggestions/carousel/dismiss`, { method: 'POST', headers: authHeaders() });
			const body = await response.json();

			expect(response.status).toBe(401);
			expect(body.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		});

		it('answers 500 when the service fails', async () => {
			suggestionService.dismissCarousel.mockRejectedValue(new AppError('Could not dismiss', 500));

			const response = await fetch(`${baseUrl}/suggestions/carousel/dismiss`, { method: 'POST', headers: authHeaders() });

			expect(response.status).toBe(500);
		});

		it('does not answer GET', async () => {
			const response = await fetch(`${baseUrl}/suggestions/carousel/dismiss`, { headers: authHeaders() });

			expect(response.status).toBe(404);
			expect(suggestionService.dismissCarousel).not.toHaveBeenCalled();
		});
	});
});
