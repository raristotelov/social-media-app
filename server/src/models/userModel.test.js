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
});
