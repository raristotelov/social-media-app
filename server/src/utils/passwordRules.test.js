const { getPasswordRuleErrorCode } = require('./passwordRules');
const { ERROR_CODES } = require('../config/errorCodes');
const constants = require('../config/constants');

describe('getPasswordRuleErrorCode', () => {
	it.each([[undefined], [null], [''], [12345678], [{ value: 'x' }]])(
		'returns PASSWORD_REQUIRED for a missing or non-string password (%p)',
		(password) => {
			expect(getPasswordRuleErrorCode(password)).toBe(ERROR_CODES.PASSWORD_REQUIRED);
		},
	);

	it('returns PASSWORD_TOO_SHORT below MIN_PASSWORD_LENGTH', () => {
		expect(getPasswordRuleErrorCode('a'.repeat(constants.MIN_PASSWORD_LENGTH - 1))).toBe(ERROR_CODES.PASSWORD_TOO_SHORT);
	});

	it('accepts a password of exactly MIN_PASSWORD_LENGTH', () => {
		expect(getPasswordRuleErrorCode('a'.repeat(constants.MIN_PASSWORD_LENGTH))).toBeNull();
	});

	it('accepts a password of exactly MAX_PASSWORD_BYTES', () => {
		expect(getPasswordRuleErrorCode('a'.repeat(constants.MAX_PASSWORD_BYTES))).toBeNull();
	});

	it('returns PASSWORD_TOO_LONG above MAX_PASSWORD_BYTES', () => {
		expect(getPasswordRuleErrorCode('a'.repeat(constants.MAX_PASSWORD_BYTES + 1))).toBe(ERROR_CODES.PASSWORD_TOO_LONG);
	});

	it('measures the maximum in bytes, not characters', () => {
		const multiByteOverLimitPassword = 'é'.repeat(constants.MAX_PASSWORD_BYTES / 2 + 1);

		expect(multiByteOverLimitPassword.length).toBeLessThan(constants.MAX_PASSWORD_BYTES);
		expect(getPasswordRuleErrorCode(multiByteOverLimitPassword)).toBe(ERROR_CODES.PASSWORD_TOO_LONG);
	});
});
