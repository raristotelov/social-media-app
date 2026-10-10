import { getErrorCode, getErrorMessage, getFormErrors, isUnauthenticatedError } from './errors';

describe('getErrorCode', () => {
	it('returns a known code unchanged', () => {
		expect(getErrorCode({ code: 'POST_NOT_FOUND' })).toBe('POST_NOT_FOUND');
	});

	it.each([[{ code: 'NOPE' }], [{}], [null], [undefined], [new Error('boom')], ['WRONG_CREDENTIALS']])('returns INTERNAL_ERROR for %p', (error) => {
		expect(getErrorCode(error)).toBe('INTERNAL_ERROR');
	});
});

describe('isUnauthenticatedError', () => {
	it('is true only for UNAUTHENTICATED', () => {
		expect(isUnauthenticatedError({ code: 'UNAUTHENTICATED' })).toBe(true);
	});

	it.each([[{ code: 'WRONG_CREDENTIALS', status: 401 }], [{ status: 401 }], [null]])('is false for %p', (error) => {
		expect(isUnauthenticatedError(error)).toBe(false);
	});
});

describe('getErrorMessage', () => {
	it('returns the copy for a code that has one', () => {
		expect(getErrorMessage({ code: 'WRONG_CREDENTIALS' }, 'fallback')).toBe('Wrong email or password');
	});

	it.each([[{ code: 'INTERNAL_ERROR' }], [{ code: 'USER_NOT_FOUND' }], [{ code: 'UNAUTHENTICATED' }], [{ code: 'NOPE' }], [undefined]])(
		'returns the fallback for %p',
		(error) => {
			expect(getErrorMessage(error, 'fallback')).toBe('fallback');
		},
	);
});

describe('getFormErrors', () => {
	const formFields = ['email', 'username'];

	it('puts a field code under its field as a one-item list', () => {
		expect(getFormErrors({ code: 'EMAIL_TAKEN', fields: { email: 'EMAIL_TAKEN' } }, formFields, 'fallback')).toEqual({
			fieldErrors: { email: ['This email is already registered'] },
			formError: '',
		});
	});

	it('puts every field code under its own field', () => {
		const error = { code: 'EMAIL_INVALID', fields: { email: 'EMAIL_INVALID', username: 'USERNAME_REQUIRED' } };

		expect(getFormErrors(error, formFields, 'fallback')).toEqual({
			fieldErrors: { email: ['Please provide a valid email address'], username: ['Username is required'] },
			formError: '',
		});
	});

	it('shows a field code for a field the form does not have as the form message', () => {
		const error = { code: 'PASSWORD_NOT_EDITABLE', fields: { password: 'PASSWORD_NOT_EDITABLE' } };

		expect(getFormErrors(error, formFields, 'fallback')).toEqual({
			fieldErrors: {},
			formError: 'Password cannot be changed from the profile form',
		});
	});

	it('keeps only the first form message when several fields have no input', () => {
		const error = { code: 'PASSWORD_REQUIRED', fields: { password: 'PASSWORD_REQUIRED', other: 'PASSWORD_TOO_SHORT' } };

		expect(getFormErrors(error, formFields, 'fallback').formError).toBe('Password is required');
	});

	it('shows the code copy as the form message when there are no fields', () => {
		expect(getFormErrors({ code: 'WRONG_CREDENTIALS' }, formFields, 'fallback')).toEqual({
			fieldErrors: {},
			formError: 'Wrong email or password',
		});
	});

	it('shows the fallback for INTERNAL_ERROR', () => {
		expect(getFormErrors({ code: 'INTERNAL_ERROR' }, formFields, 'fallback')).toEqual({ fieldErrors: {}, formError: 'fallback' });
	});

	it('shows the fallback for a field code that has no copy', () => {
		const error = { code: 'INTERNAL_ERROR', fields: { email: 'NOT_A_REAL_CODE' } };

		expect(getFormErrors(error, formFields, 'fallback')).toEqual({ fieldErrors: {}, formError: 'fallback' });
	});

	it('shows the fallback for a value that is not a RequestError', () => {
		expect(getFormErrors(new Error('boom'), formFields, 'fallback')).toEqual({ fieldErrors: {}, formError: 'fallback' });
		expect(getFormErrors(undefined, formFields, 'fallback')).toEqual({ fieldErrors: {}, formError: 'fallback' });
	});
});
