const verifyProfileOwner = require('./verifyProfileOwner');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const OTHER_USER_ID = '64b7f0a1c2d3e4f5a6b7c8d2';

describe('verifyProfileOwner', () => {
	it('continues without an error when the token user is the user in the path', () => {
		const next = jest.fn();

		verifyProfileOwner({ params: { userId: USER_ID } }, { userId: USER_ID }, next);

		expect(next).toHaveBeenCalledWith();
	});

	it('continues when the token user id is an ObjectId-like value that stringifies to the path id', () => {
		const next = jest.fn();

		verifyProfileOwner({ params: { userId: USER_ID } }, { userId: { toString: () => USER_ID } }, next);

		expect(next).toHaveBeenCalledWith();
	});

	it("rejects another user's id with a 403 PROFILE_FORBIDDEN", () => {
		const next = jest.fn();

		verifyProfileOwner({ params: { userId: OTHER_USER_ID } }, { userId: USER_ID }, next);

		const error = next.mock.calls[0][0];

		expect(error).toBeInstanceOf(AppError);
		expect(error.statusCode).toBe(403);
		expect(error.code).toBe(ERROR_CODES.PROFILE_FORBIDDEN);
	});

	it('rejects a request with no token user', () => {
		const next = jest.fn();

		verifyProfileOwner({ params: { userId: USER_ID } }, {}, next);

		expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: ERROR_CODES.PROFILE_FORBIDDEN });
	});
});
