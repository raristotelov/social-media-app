module.exports = {
	JWT_EXPIRY: 12 * 60 * 60,
	SALT_ROUNDS: 10,
	MIN_PASSWORD_LENGTH: 8,
	// bcrypt only uses the first 72 bytes of a password and truncates the rest silently
	MAX_PASSWORD_BYTES: 72,
	MAX_BIO_LENGTH: 150,
};
