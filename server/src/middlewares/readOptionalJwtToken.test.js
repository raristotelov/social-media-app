jest.mock('jsonwebtoken');

const JWT = require('jsonwebtoken');

const readOptionalJwtToken = require('./readOptionalJwtToken');

const buildRequest = (token) => ({ header: jest.fn().mockReturnValue(token) });

describe('readOptionalJwtToken', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	it('reads the token from the X-Authorization header', () => {
		const req = buildRequest('valid.jwt.token');

		JWT.verify.mockReturnValue({ userId: 'user1' });

		readOptionalJwtToken(req, {}, jest.fn());

		expect(req.header).toHaveBeenCalledWith('X-Authorization');
		expect(JWT.verify).toHaveBeenCalledWith('valid.jwt.token', process.env.JWT_SECRET);
	});

	it('stores the user id on the response and continues without an error for a valid token', () => {
		const res = {};
		const next = jest.fn();

		JWT.verify.mockReturnValue({ userId: 'user1' });

		readOptionalJwtToken(buildRequest('valid.jwt.token'), res, next);

		expect(res.userId).toBe('user1');
		expect(next).toHaveBeenCalledWith();
	});

	it('treats a request without a token as a guest and continues without an error', () => {
		const res = {};
		const next = jest.fn();

		readOptionalJwtToken(buildRequest(undefined), res, next);

		expect(res.userId).toBeUndefined();
		expect(JWT.verify).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledWith();
	});

	it('treats an invalid or expired token as a guest and continues without an error', () => {
		const res = {};
		const next = jest.fn();

		JWT.verify.mockImplementation(() => {
			throw new Error('jwt expired');
		});

		readOptionalJwtToken(buildRequest('expired.jwt.token'), res, next);

		expect(res.userId).toBeUndefined();
		expect(next).toHaveBeenCalledWith();
	});
});
