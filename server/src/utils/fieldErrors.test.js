const AppError = require('./AppError');
const { asFieldError } = require('./fieldErrors');
const { ERROR_CODES } = require('../config/errorCodes');

const buildValidationError = (errors) => ({ name: 'ValidationError', errors });

describe('asFieldError', () => {
	describe('a validation error', () => {
		it('maps a caption that is too long to a 400 CAPTION_TOO_LONG on the caption field', () => {
			const result = asFieldError(buildValidationError({ caption: { kind: 'maxlength' } }));

			expect(result).toBeInstanceOf(AppError);
			expect(result).toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.CAPTION_TOO_LONG,
				fields: { caption: ERROR_CODES.CAPTION_TOO_LONG },
			});
		});

		it('maps a bio that is too long to a 400 BIO_TOO_LONG on the bio field', () => {
			const result = asFieldError(buildValidationError({ bio: { kind: 'maxlength' } }));

			expect(result).toMatchObject({ statusCode: 400, code: ERROR_CODES.BIO_TOO_LONG, fields: { bio: ERROR_CODES.BIO_TOO_LONG } });
		});

		it('keeps the original error as the cause', () => {
			const original = buildValidationError({ caption: { kind: 'maxlength' } });

			expect(asFieldError(original).cause).toBe(original);
		});

		it('maps several failing fields at once', () => {
			const result = asFieldError(buildValidationError({ caption: { kind: 'maxlength' }, bio: { kind: 'maxlength' } }));

			expect(result.fields).toEqual({ caption: ERROR_CODES.CAPTION_TOO_LONG, bio: ERROR_CODES.BIO_TOO_LONG });
		});

		it('returns null for a field without a mapped code', () => {
			expect(asFieldError(buildValidationError({ imageUrl: { kind: 'required' } }))).toBeNull();
		});

		it('returns null for a mapped field with an unmapped kind', () => {
			expect(asFieldError(buildValidationError({ caption: { kind: 'minlength' } }))).toBeNull();
		});

		it('returns null when any one of several failing fields is unmapped', () => {
			expect(asFieldError(buildValidationError({ caption: { kind: 'maxlength' }, imageUrl: { kind: 'required' } }))).toBeNull();
		});
	});

	describe('a duplicate key error', () => {
		it('maps a taken email to a 409 EMAIL_TAKEN', () => {
			const result = asFieldError({ code: 11000, keyPattern: { email: 1 } });

			expect(result).toMatchObject({ statusCode: 409, code: ERROR_CODES.EMAIL_TAKEN, fields: { email: ERROR_CODES.EMAIL_TAKEN } });
		});

		it('returns null for a duplicate on an unmapped key', () => {
			expect(asFieldError({ code: 11000, keyPattern: { imageUrl: 1 } })).toBeNull();
		});

		it('returns null for a duplicate error without a key pattern', () => {
			expect(asFieldError({ code: 11000 })).toBeNull();
		});
	});

	it('returns null for any other error', () => {
		expect(asFieldError(new Error('connection lost'))).toBeNull();
	});
});
