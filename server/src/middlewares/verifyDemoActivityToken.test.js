const verifyDemoActivityToken = require('./verifyDemoActivityToken');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const TOKEN = 'demo-activity-test-token';

describe('verifyDemoActivityToken', () => {
	let originalToken;

	const callWith = (authorization) => {
		const req = { header: jest.fn((name) => (name === 'Authorization' ? authorization : undefined)) };
		const next = jest.fn();

		verifyDemoActivityToken(req, {}, next);

		return next;
	};

	beforeEach(() => {
		originalToken = process.env.DEMO_ACTIVITY_TOKEN;
		process.env.DEMO_ACTIVITY_TOKEN = TOKEN;
	});

	afterEach(() => {
		if (originalToken === undefined) {
			delete process.env.DEMO_ACTIVITY_TOKEN;
		} else {
			process.env.DEMO_ACTIVITY_TOKEN = originalToken;
		}
	});

	describe('when DEMO_ACTIVITY_TOKEN is not configured', () => {
		it.each([
			['unset', undefined],
			['empty', ''],
		])('answers 404 when it is %s, even with a header', (description, value) => {
			if (value === undefined) {
				delete process.env.DEMO_ACTIVITY_TOKEN;
			} else {
				process.env.DEMO_ACTIVITY_TOKEN = value;
			}

			const next = callWith(`Bearer ${TOKEN}`);
			const [error] = next.mock.calls[0];

			expect(next).toHaveBeenCalledTimes(1);
			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(404);
		});

		it('answers 404 rather than 401 when the header is missing', () => {
			delete process.env.DEMO_ACTIVITY_TOKEN;

			const [error] = callWith(undefined).mock.calls[0];

			expect(error.statusCode).toBe(404);
		});
	});

	describe('when the token is configured', () => {
		it.each([
			['no Authorization header', undefined],
			['an empty header', ''],
			['a header with only the Bearer prefix', 'Bearer '],
			['a wrong token', 'Bearer wrong-token'],
			['a token of a different length', 'Bearer x'],
			['a longer token that starts with the right one', `Bearer ${TOKEN}-extra`],
			['the right token without the Bearer prefix', TOKEN],
			['another scheme', `Basic ${TOKEN}`],
			['a lowercase bearer prefix', `bearer ${TOKEN}`],
		])('answers 401 UNAUTHENTICATED for %s', (description, authorization) => {
			const next = callWith(authorization);
			const [error] = next.mock.calls[0];

			expect(next).toHaveBeenCalledTimes(1);
			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(401);
			expect(error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		});

		it('calls next with no error for the right Bearer token', () => {
			const next = callWith(`Bearer ${TOKEN}`);

			expect(next).toHaveBeenCalledTimes(1);
			expect(next).toHaveBeenCalledWith();
		});
	});
});
