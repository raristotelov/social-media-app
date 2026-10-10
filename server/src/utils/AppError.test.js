const AppError = require('./AppError');
const { ERROR_CODES } = require('../config/errorCodes');

describe('AppError', () => {
	describe('isOperational', () => {
		it.each([[400], [401], [403], [404], [409], [499]])('is true for a %i status', (statusCode) => {
			expect(new AppError('expected', statusCode).isOperational).toBe(true);
		});

		it.each([[500], [502], [503]])('is false for a %i status', (statusCode) => {
			expect(new AppError('unexpected', statusCode).isOperational).toBe(false);
		});

		it('defaults to a non-operational 500', () => {
			const error = new AppError('unexpected');

			expect(error.statusCode).toBe(500);
			expect(error.isOperational).toBe(false);
		});
	});

	it('carries the code, fields and cause given in the options', () => {
		const cause = new Error('root cause');
		const fields = { email: ERROR_CODES.EMAIL_TAKEN };
		const error = new AppError('taken', 409, { code: ERROR_CODES.EMAIL_TAKEN, fields, cause });

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('AppError');
		expect(error.code).toBe(ERROR_CODES.EMAIL_TAKEN);
		expect(error.fields).toBe(fields);
		expect(error.cause).toBe(cause);
	});

	describe('fromFields', () => {
		it('uses the first field code as the error code and keeps all fields', () => {
			const error = AppError.fromFields({ email: ERROR_CODES.EMAIL_INVALID, username: ERROR_CODES.USERNAME_REQUIRED }, 400);

			expect(error.statusCode).toBe(400);
			expect(error.code).toBe(ERROR_CODES.EMAIL_INVALID);
			expect(error.fields).toEqual({ email: ERROR_CODES.EMAIL_INVALID, username: ERROR_CODES.USERNAME_REQUIRED });
			expect(error.isOperational).toBe(true);
		});

		it('builds a developer message listing every field and code', () => {
			const error = AppError.fromFields({ email: ERROR_CODES.EMAIL_INVALID, username: ERROR_CODES.USERNAME_REQUIRED }, 400);

			expect(error.message).toBe('email: EMAIL_INVALID, username: USERNAME_REQUIRED');
		});

		it('passes the cause option through', () => {
			const cause = new Error('mongoose');
			const error = AppError.fromFields({ username: ERROR_CODES.USERNAME_TAKEN }, 409, { cause });

			expect(error.cause).toBe(cause);
		});
	});
});
