import { serverUrl } from '../../support/api';

describe('login errors', () => {
	beforeEach(() => {
		cy.visit('/log-in');
	});

	const signIn = () => {
		cy.get('input#email').type('someone@example.com');
		cy.get('input#password').type('SomePassword1');
		cy.contains('button', 'Submit').click();
	};

	it('shows WRONG_CREDENTIALS as the form message and stays on the page', () => {
		cy.intercept('POST', `${serverUrl}/users/login`, {
			statusCode: 401,
			body: { code: 'WRONG_CREDENTIALS', message: 'Wrong email or password' },
		}).as('failingLogin');

		signIn();

		cy.wait('@failingLogin');

		cy.contains('.form-error', 'Wrong email or password').should('be.visible');
		cy.get('.field-error').should('not.exist');
		cy.location('pathname').should('eq', '/log-in');
	});

	it('shows the log-in fallback copy when the server answers INTERNAL_ERROR', () => {
		cy.intercept('POST', `${serverUrl}/users/login`, {
			statusCode: 500,
			body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
		}).as('failingLogin');

		signIn();

		cy.wait('@failingLogin');

		cy.contains('.form-error', "Couldn't log in. Try again.").should('be.visible');
		cy.location('pathname').should('eq', '/log-in');
	});

	it('shows the log-in fallback copy for a code the client does not know', () => {
		cy.intercept('POST', `${serverUrl}/users/login`, {
			statusCode: 418,
			body: { code: 'SOMETHING_NEW', message: 'Teapot' },
		}).as('failingLogin');

		signIn();

		cy.wait('@failingLogin');

		cy.contains('.form-error', "Couldn't log in. Try again.").should('be.visible');
	});

	it('shows the log-in fallback copy when the server answers with a non-JSON body', () => {
		cy.intercept('POST', `${serverUrl}/users/login`, {
			statusCode: 502,
			headers: { 'content-type': 'text/html' },
			body: '<html><body>Bad Gateway</body></html>',
		}).as('failingLogin');

		signIn();

		cy.wait('@failingLogin');

		cy.contains('.form-error', "Couldn't log in. Try again.").should('be.visible');
		cy.contains('Bad Gateway').should('not.exist');
	});

	it('shows the log-in fallback copy when the network fails', () => {
		cy.intercept('POST', `${serverUrl}/users/login`, { forceNetworkError: true }).as('failingLogin');

		signIn();

		cy.contains('.form-error', "Couldn't log in. Try again.").should('be.visible');
		cy.location('pathname').should('eq', '/log-in');
	});

	it('never shows the developer message from the server', () => {
		cy.intercept('POST', `${serverUrl}/users/login`, {
			statusCode: 500,
			body: { code: 'INTERNAL_ERROR', message: 'E11000 duplicate key error collection: users' },
		}).as('failingLogin');

		signIn();

		cy.wait('@failingLogin');

		cy.contains('.form-error', "Couldn't log in. Try again.").should('be.visible');
		cy.contains('E11000').should('not.exist');
	});

	it('clears the form message when the user types again', () => {
		cy.intercept('POST', `${serverUrl}/users/login`, {
			statusCode: 401,
			body: { code: 'WRONG_CREDENTIALS', message: 'Wrong email or password' },
		}).as('failingLogin');

		signIn();
		cy.contains('.form-error', 'Wrong email or password').should('be.visible');

		cy.get('input#password').type('x');

		cy.get('.form-error').should('not.exist');
	});

	it('lets the user submit again after a failure', () => {
		cy.intercept('POST', `${serverUrl}/users/login`, {
			statusCode: 500,
			body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
		}).as('failingLogin');

		signIn();
		cy.wait('@failingLogin');

		cy.contains('button', 'Submit').should('be.enabled');
	});
});
