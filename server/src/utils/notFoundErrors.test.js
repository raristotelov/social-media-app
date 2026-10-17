const AppError = require('./AppError');
const { createPostNotFoundError, createCommentNotFoundError } = require('./notFoundErrors');
const { ERROR_CODES } = require('../config/errorCodes');

describe('notFoundErrors', () => {
	describe('createPostNotFoundError', () => {
		it('is an operational AppError with status 404', () => {
			const error = createPostNotFoundError();

			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(404);
			expect(error.isOperational).toBe(true);
		});

		it('carries the POST_NOT_FOUND code', () => {
			expect(createPostNotFoundError().code).toBe(ERROR_CODES.POST_NOT_FOUND);
		});

		it('returns a new error on every call', () => {
			expect(createPostNotFoundError()).not.toBe(createPostNotFoundError());
		});
	});

	describe('createCommentNotFoundError', () => {
		it('is an operational AppError with status 404', () => {
			const error = createCommentNotFoundError();

			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(404);
			expect(error.isOperational).toBe(true);
		});

		it('carries the COMMENT_NOT_FOUND code', () => {
			expect(createCommentNotFoundError().code).toBe(ERROR_CODES.COMMENT_NOT_FOUND);
		});

		it('returns a new error on every call', () => {
			expect(createCommentNotFoundError()).not.toBe(createCommentNotFoundError());
		});
	});
});
