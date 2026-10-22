const AppError = require('./AppError');
const { createPostNotFoundError, createCommentNotFoundError, createStoryNotFoundError, createUserNotFoundError } = require('./notFoundErrors');
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

	describe('createStoryNotFoundError', () => {
		it('is an operational AppError with status 404', () => {
			const error = createStoryNotFoundError();

			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(404);
			expect(error.isOperational).toBe(true);
		});

		it('carries the STORY_NOT_FOUND code', () => {
			expect(createStoryNotFoundError().code).toBe(ERROR_CODES.STORY_NOT_FOUND);
		});

		it('returns a new error on every call', () => {
			expect(createStoryNotFoundError()).not.toBe(createStoryNotFoundError());
		});
	});

	describe('createUserNotFoundError', () => {
		it('is an operational AppError with status 404', () => {
			const error = createUserNotFoundError();

			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(404);
			expect(error.isOperational).toBe(true);
		});

		it('carries the USER_NOT_FOUND code', () => {
			expect(createUserNotFoundError().code).toBe(ERROR_CODES.USER_NOT_FOUND);
		});
	});
});
