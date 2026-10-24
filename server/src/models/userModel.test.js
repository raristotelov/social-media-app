const UserModel = require('./userModel');
const constants = require('../config/constants');

describe('UserModel', () => {
	const validUserData = {
		email: 'user@example.com',
		username: 'johndoe',
		password: 'hashedPassword123',
	};

	it(`rejects a bio longer than ${constants.MAX_BIO_LENGTH} characters`, () => {
		const bio = 'a'.repeat(constants.MAX_BIO_LENGTH + 1);
		const user = new UserModel({ ...validUserData, bio });

		const validationError = user.validateSync();

		expect(validationError.errors.bio.message).toBe(`Bio must be at most ${constants.MAX_BIO_LENGTH} characters`);
	});

	it(`accepts a bio of exactly ${constants.MAX_BIO_LENGTH} characters`, () => {
		const bio = 'a'.repeat(constants.MAX_BIO_LENGTH);
		const user = new UserModel({ ...validUserData, bio });

		const validationError = user.validateSync();

		expect(validationError).toBeUndefined();
	});

	describe('suggestionsCarouselDismissedUntil', () => {
		it('is not set on a new user, so the carousel is not dismissed', () => {
			const user = new UserModel(validUserData);

			expect(user.suggestionsCarouselDismissedUntil).toBeUndefined();
		});

		it('stores a date', () => {
			const dismissedUntil = new Date('2026-11-01T10:00:00.000Z');
			const user = new UserModel({ ...validUserData, suggestionsCarouselDismissedUntil: dismissedUntil });

			expect(user.suggestionsCarouselDismissedUntil).toEqual(dismissedUntil);
			expect(user.validateSync()).toBeUndefined();
		});

		it('is a Date path on the schema', () => {
			expect(UserModel.schema.path('suggestionsCarouselDismissedUntil').instance).toBe('Date');
		});

		it('rejects a value that is not a date', () => {
			const user = new UserModel({ ...validUserData, suggestionsCarouselDismissedUntil: 'not a date' });

			expect(user.validateSync().errors.suggestionsCarouselDismissedUntil).toBeDefined();
		});
	});
});
