const AppError = require('./AppError');
const { ERROR_CODES } = require('../config/errorCodes');

const createPostNotFoundError = () => new AppError('Post not found', 404, { code: ERROR_CODES.POST_NOT_FOUND });

const createCommentNotFoundError = () => new AppError('Comment not found', 404, { code: ERROR_CODES.COMMENT_NOT_FOUND });

module.exports = {
	createPostNotFoundError,
	createCommentNotFoundError,
};
