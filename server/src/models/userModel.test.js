const UserModel = require('./userModel');
const constants = require('../config/constants');

describe('UserModel', () => {
	const validUserData = {
		email: 'user@example.com',
		username: 'johndoe',
		password: 'hashedPassword123',
	};

	it(`rejects a bio longer than ${constants.MAX_BIO_LENGTH} characters`, async () => {
		const bio = 'a'.repeat(constants.MAX_BIO_LENGTH + 1);
		const user = new UserModel({ ...validUserData, bio });

		await expect(user.validate()).rejects.toMatchObject({
			errors: { bio: { message: `Bio must be at most ${constants.MAX_BIO_LENGTH} characters` } },
		});
	});

	it(`accepts a bio of exactly ${constants.MAX_BIO_LENGTH} characters`, async () => {
		const bio = 'a'.repeat(constants.MAX_BIO_LENGTH);
		const user = new UserModel({ ...validUserData, bio });

		await expect(user.validate()).resolves.toBeUndefined();
	});

	describe('suggestionsCarouselDismissedUntil', () => {
		it('is not set on a new user, so the carousel is not dismissed', () => {
			const user = new UserModel(validUserData);

			expect(user.suggestionsCarouselDismissedUntil).toBeUndefined();
		});

		it('stores a date', async () => {
			const dismissedUntil = new Date('2026-11-01T10:00:00.000Z');
			const user = new UserModel({ ...validUserData, suggestionsCarouselDismissedUntil: dismissedUntil });

			expect(user.suggestionsCarouselDismissedUntil).toEqual(dismissedUntil);
			await expect(user.validate()).resolves.toBeUndefined();
		});

		it('is a Date path on the schema', () => {
			expect(UserModel.schema.path('suggestionsCarouselDismissedUntil').instance).toBe('Date');
		});

		it('rejects a value that is not a date', async () => {
			const user = new UserModel({ ...validUserData, suggestionsCarouselDismissedUntil: 'not a date' });

			await expect(user.validate()).rejects.toMatchObject({ errors: { suggestionsCarouselDismissedUntil: expect.anything() } });
		});
	});

	describe('accountType', () => {
		it('is a regular user by default', () => {
			const user = new UserModel(validUserData);

			expect(user.accountType).toBe('user');
		});

		it.each(['user', 'persona', 'demo'])('accepts %s', async (accountType) => {
			const user = new UserModel({ ...validUserData, accountType });

			await expect(user.validate()).resolves.toBeUndefined();
		});

		it('rejects any other value', async () => {
			const user = new UserModel({ ...validUserData, accountType: 'admin' });

			await expect(user.validate()).rejects.toMatchObject({ errors: { accountType: expect.anything() } });
		});

		it('is indexed, because every visibility rule looks accounts up by it', () => {
			expect(UserModel.schema.path('accountType').options.index).toBe(true);
		});

		it('does not depend on the email: a visitor-looking email still defaults to a regular user', () => {
			const user = new UserModel({ ...validUserData, email: 'someone@visitor.demo.invalid' });

			expect(user.accountType).toBe('user');
		});
	});
});
