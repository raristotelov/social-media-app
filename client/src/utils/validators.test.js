import { validateChangePassword } from './validators';

const validValues = { currentPassword: 'oldPassword1', newPassword: 'newPassword1', confirmPassword: 'newPassword1' };

describe('validateChangePassword', () => {
	it('returns no errors for valid, matching values', () => {
		expect(validateChangePassword(validValues)).toEqual({ fields: {}, formError: '' });
	});

	it('requires the current password', () => {
		const { fields } = validateChangePassword({ ...validValues, currentPassword: '' });

		expect(fields).toEqual({ currentPassword: ['Password is required'] });
	});

	it('requires the new password', () => {
		const { fields } = validateChangePassword({ ...validValues, newPassword: '', confirmPassword: 'newPassword1' });

		expect(fields.newPassword).toEqual(['Password is required']);
	});

	it('rejects a new password shorter than 8 characters', () => {
		const { fields } = validateChangePassword({ ...validValues, newPassword: 'short', confirmPassword: 'short' });

		expect(fields.newPassword).toEqual(['Password must be at least 8 characters']);
	});

	it('accepts a new password of exactly 8 characters', () => {
		const { fields } = validateChangePassword({ ...validValues, newPassword: '12345678', confirmPassword: '12345678' });

		expect(fields.newPassword).toBeUndefined();
	});

	it('asks to repeat the password, as a form message, when the confirmation is empty', () => {
		const { fields, formError } = validateChangePassword({ ...validValues, confirmPassword: '' });

		expect(formError).toBe('Please repeat your password');
		expect(fields.confirmPassword).toBeUndefined();
	});

	it('reports mismatching new and confirm passwords as a form message', () => {
		const { fields, formError } = validateChangePassword({ ...validValues, confirmPassword: 'different1' });

		expect(formError).toBe('Passwords do not match');
		expect(fields).toEqual({});
	});

	it('does not report a mismatch while the new password is empty, only that it is required', () => {
		const { fields, formError } = validateChangePassword({ ...validValues, newPassword: '', confirmPassword: 'something1' });

		expect(fields.newPassword).toEqual(['Password is required']);
		expect(formError).toBe('');
	});

	it('reports field errors and the form message together', () => {
		const { fields, formError } = validateChangePassword({ currentPassword: '', newPassword: 'short', confirmPassword: '' });

		expect(Object.keys(fields)).toEqual(['currentPassword', 'newPassword']);
		expect(formError).toBe('Please repeat your password');
	});
});
