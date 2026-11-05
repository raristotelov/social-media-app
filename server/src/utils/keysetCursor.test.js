const mongoose = require('mongoose');

const { ERROR_CODES } = require('../config/errorCodes');
const { toKeysetCursor, parseKeysetCursor, toKeysetFilter } = require('./keysetCursor');

const DOCUMENT_ID = '64b7f0a1c2d3e4f5a6b7c8ff';
const TIMESTAMP = 1_700_000_000_000;

describe('keysetCursor', () => {
	describe('toKeysetCursor', () => {
		it('joins the creation time in milliseconds and the id with an underscore', () => {
			expect(toKeysetCursor({ createdAt: new Date(TIMESTAMP), _id: DOCUMENT_ID })).toBe(`${TIMESTAMP}_${DOCUMENT_ID}`);
		});
	});

	describe('parseKeysetCursor', () => {
		it('answers null when there is no cursor', () => {
			expect(parseKeysetCursor(undefined)).toBeNull();
		});

		it('turns a cursor back into a date and an object id', () => {
			const parsed = parseKeysetCursor(`${TIMESTAMP}_${DOCUMENT_ID}`);

			expect(parsed.createdAt).toEqual(new Date(TIMESTAMP));
			expect(parsed.documentId).toEqual(new mongoose.Types.ObjectId(DOCUMENT_ID));
		});

		it.each([
			['an empty string', ''],
			['a word', 'nonsense'],
			['a missing id', `${TIMESTAMP}_`],
			['a missing timestamp', `_${DOCUMENT_ID}`],
			['a timestamp that is not a number', `abc_${DOCUMENT_ID}`],
			['an id that is not an object id', `${TIMESTAMP}_not-an-id`],
			['an array', ['a', 'b']],
			['a number', 12],
			['null', null],
		])('rejects %s with a 400 bad request', (_name, cursor) => {
			expect(() => parseKeysetCursor(cursor)).toThrow(expect.objectContaining({ statusCode: 400, code: ERROR_CODES.BAD_REQUEST }));
		});
	});

	describe('toKeysetFilter', () => {
		it('matches older documents, and same-time documents with a smaller id', () => {
			const parsed = parseKeysetCursor(`${TIMESTAMP}_${DOCUMENT_ID}`);

			expect(toKeysetFilter(parsed)).toEqual([
				{ createdAt: { $lt: parsed.createdAt } },
				{ createdAt: parsed.createdAt, _id: { $lt: parsed.documentId } },
			]);
		});
	});
});
