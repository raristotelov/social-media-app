const mongoose = require('mongoose');

const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('./AppError');

const CURSOR_SEPARATOR = '_';

const toKeysetCursor = (document) => `${document.createdAt.getTime()}${CURSOR_SEPARATOR}${document._id}`;

const parseKeysetCursor = (cursor) => {
	if (cursor === undefined) {
		return null;
	}

	const [timestamp, documentId] = typeof cursor === 'string' ? cursor.split(CURSOR_SEPARATOR) : [];
	const createdAt = new Date(Number(timestamp));

	if (!timestamp || Number.isNaN(createdAt.getTime()) || !mongoose.isObjectIdOrHexString(documentId)) {
		throw new AppError('cursor must be a page cursor', 400, { code: ERROR_CODES.BAD_REQUEST });
	}

	return { createdAt, documentId: new mongoose.Types.ObjectId(documentId) };
};

const toKeysetFilter = (parsedCursor) => [
	{ createdAt: { $lt: parsedCursor.createdAt } },
	{ createdAt: parsedCursor.createdAt, _id: { $lt: parsedCursor.documentId } },
];

module.exports = {
	toKeysetCursor,
	parseKeysetCursor,
	toKeysetFilter,
};
