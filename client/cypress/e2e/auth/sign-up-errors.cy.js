import { serverUrl } from '../../support/api';

describe('sign up errors', () => {
	beforeEach(() => {
		cy.visit('/sign-up');
	});

	const fillAndSubmit = () => {
		cy.get('input#email').type('someone@example.com');
		cy.get('input#username').type('some_username');
		cy.get('input#password').type('SomePassword1');
		cy.get('input#repeatPassword').type('SomePassword1');
		cy.contains('button', 'Submit').click();
	};

	const stubSignUp = (statusCode, body) => cy.intercept('POST', `${serverUrl}/users/sign-up`, { statusCode, body }).as('failingSignUp');

	it('shows USERNAME_TAKEN under the username field', () => {
		stubSignUp(409, { code: 'USERNAME_TAKEN', message: 'username: USERNAME_TAKEN', fields: { username: 'USERNAME_TAKEN' } });

		fillAndSubmit();

		cy.wait('@failingSignUp');

		cy.get('input#username').closest('.auth-input-wrapper').contains('.field-error', 'This username is taken').should('be.visible');
		cy.get('.form-error').should('not.exist');
		cy.location('pathname').should('eq', '/sign-up');
	});

	it('shows EMAIL_TAKEN under the email field', () => {
		stubSignUp(409, { code: 'EMAIL_TAKEN', message: 'email: EMAIL_TAKEN', fields: { email: 'EMAIL_TAKEN' } });

		fillAndSubmit();

		cy.wait('@failingSignUp');

		cy.get('input#email').closest('.auth-input-wrapper').contains('.field-error', 'This email is already registered').should('be.visible');
		cy.get('.form-error').should('not.exist');
	});

	it('shows PASSWORD_TOO_LONG under the password field', () => {
		stubSignUp(400, { code: 'PASSWORD_TOO_LONG', message: 'password: PASSWORD_TOO_LONG', fields: { password: 'PASSWORD_TOO_LONG' } });

		fillAndSubmit();

		cy.wait('@failingSignUp');

		cy.get('input#password').closest('.auth-input-wrapper').contains('.field-error', 'Password must be at most 72 bytes').should('be.visible');
	});

	it('shows several field codes, each under its own field', () => {
		stubSignUp(400, {
			code: 'EMAIL_INVALID',
			message: 'email: EMAIL_INVALID, username: USERNAME_REQUIRED',
			fields: { email: 'EMAIL_INVALID', username: 'USERNAME_REQUIRED' },
		});

		fillAndSubmit();

		cy.wait('@failingSignUp');

		cy.contains('.field-error', 'Please provide a valid email address').should('be.visible');
		cy.contains('.field-error', 'Username is required').should('be.visible');
	});

	it('shows the sign-up fallback copy as the form message when the server answers INTERNAL_ERROR', () => {
		stubSignUp(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });

		fillAndSubmit();

		cy.wait('@failingSignUp');

		cy.contains('.form-error', "Couldn't sign up. Try again.").should('be.visible');
		cy.get('.field-error').should('not.exist');
		cy.location('pathname').should('eq', '/sign-up');
	});

	it('shows the sign-up fallback copy when the network fails', () => {
		cy.intercept('POST', `${serverUrl}/users/sign-up`, { forceNetworkError: true }).as('failingSignUp');

		fillAndSubmit();

		cy.contains('.form-error', "Couldn't sign up. Try again.").should('be.visible');
	});

	it('clears a field error when the user edits that field', () => {
		stubSignUp(409, { code: 'USERNAME_TAKEN', message: 'username: USERNAME_TAKEN', fields: { username: 'USERNAME_TAKEN' } });

		fillAndSubmit();
		cy.contains('.field-error', 'This username is taken').should('be.visible');

		cy.get('input#username').type('2');

		cy.get('.field-error').should('not.exist');
	});
});
