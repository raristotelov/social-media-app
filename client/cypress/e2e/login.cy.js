import { buildTestUser } from '../support/testUser';
import { createUserViaApi } from '../support/api';

describe('login', () => {
	const user = buildTestUser();

	before(() => {
		createUserViaApi(user);
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
	});

	beforeEach(() => {
		cy.visit('/log-in');
	});

	const signIn = (email, password) => {
		cy.get('input#email').type(email);
		cy.get('input#password').type(password);
		cy.contains('button', 'Submit').click();
	};

	it('signs the user in and lands on the feed', () => {
		signIn(user.email, user.password);

		cy.location('pathname').should('eq', '/user-feed');

		cy.get('.tab-bar').within(() => {
			cy.contains('Feed').should('exist');
			cy.contains('Log in').should('not.exist');
		});
	});

	// The unit test proves this with a mocked bcrypt.compare returning false. Only
	// here does the real hash comparison run, which is what the original bug skipped.
	it('rejects a wrong password against the real stored hash', () => {
		signIn(user.email, 'DefinitelyNotThePassword1');

		cy.contains('.form-error', 'Wrong email or password').should('be.visible');
		cy.location('pathname').should('eq', '/log-in');

		cy.get('.tab-bar').within(() => {
			cy.contains('Log in').should('exist');
			cy.contains('Feed').should('not.exist');
		});
	});

	it('gives the same message for an unknown email, so neither field is revealed', () => {
		signIn(`cypress+does-not-exist${Date.now()}@test.local`, 'CypressPassword1');

		cy.contains('.form-error', 'Wrong email or password').should('be.visible');
	});

	it('shows a message on every empty field and never reaches the server', () => {
		cy.intercept('POST', '**/users/login', cy.spy().as('loginRequest'));

		cy.contains('button', 'Submit').click();

		cy.contains('.field-error', 'Email is required').should('be.visible');
		cy.contains('.field-error', 'Password is required').should('be.visible');
		cy.get('@loginRequest').should('not.have.been.called');
	});

	it('keeps the session across a page refresh', () => {
		signIn(user.email, user.password);
		cy.location('pathname').should('eq', '/user-feed');

		cy.reload();

		cy.location('pathname').should('eq', '/user-feed');
		cy.get('.tab-bar').within(() => {
			cy.contains('Profile').should('exist');
		});
	});

	it('discards a malformed stored token and falls back to a clean guest state', () => {
		cy.visit('/', {
			onBeforeLoad: (win) => {
				win.localStorage.setItem('jwt-token', JSON.stringify('not-a-real-jwt'));
			},
		});

		cy.location('pathname').should('eq', '/log-in');

		// cy.its()/cy.invoke() retry until the subject is non-null, so they cannot be
		// used to assert that a value IS null.
		cy.window().then((win) => {
			expect(win.localStorage.getItem('jwt-token')).to.equal(null);
		});
	});
});
