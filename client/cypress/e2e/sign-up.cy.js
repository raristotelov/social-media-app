import { buildTestUser } from '../support/testUser';
import { createUserViaApi, serverUrl } from '../support/api';

describe('sign up', () => {
	beforeEach(() => {
		cy.visit('/sign-up');
	});

	const fillSignUpForm = ({ email, username, password, repeatPassword }) => {
		if (email) {
			cy.get('input#email').type(email);
		}

		if (username) {
			cy.get('input#username').type(username);
		}

		if (password) {
			cy.get('input#password').type(password);
		}

		if (repeatPassword) {
			cy.get('input#repeatPassword').type(repeatPassword);
		}
	};

	it('creates the account, logs the user straight in and lands on the feed', () => {
		const user = buildTestUser();

		fillSignUpForm({ ...user, repeatPassword: user.password });
		cy.contains('button', 'Submit').click();

		cy.location('pathname').should('eq', '/user-feed');

		// Being on the feed is not enough — the member navigation proves a session exists.
		cy.get('.tab-bar').within(() => {
			cy.contains('Feed').should('exist');
			cy.contains('Profile').should('exist');
			cy.contains('Log in').should('not.exist');
		});
	});

	it('shows a message on every empty field and never reaches the server', () => {
		cy.intercept('POST', '**/users/sign-up', cy.spy().as('signUpRequest'));

		cy.contains('button', 'Submit').click();

		cy.contains('.field-error', 'Email is required').should('be.visible');
		cy.contains('.field-error', 'Username is required').should('be.visible');
		cy.contains('.field-error', 'Password is required').should('be.visible');
		cy.contains('.field-error', 'Please repeat your password').should('be.visible');

		cy.get('@signUpRequest').should('not.have.been.called');
		cy.location('pathname').should('eq', '/sign-up');
	});

	it('rejects a password shorter than 8 characters', () => {
		const user = buildTestUser({ password: 'short1' });

		fillSignUpForm({ ...user, repeatPassword: user.password });
		cy.contains('button', 'Submit').click();

		cy.contains('.field-error', 'Password must be at least 8 characters').should('be.visible');
		cy.location('pathname').should('eq', '/sign-up');
	});

	it('reports mismatched passwords above the button, not against a single input', () => {
		const user = buildTestUser();

		fillSignUpForm({ ...user, repeatPassword: `${user.password}-different` });
		cy.contains('button', 'Submit').click();

		cy.contains('.form-error', 'Passwords do not match').should('be.visible');
		cy.get('.field-error').should('not.exist');
	});

	it('reports an email that is already registered against the email input', () => {
		const existingUser = buildTestUser();

		createUserViaApi(existingUser);

		cy.visit('/sign-up');
		fillSignUpForm({
			email: existingUser.email,
			username: buildTestUser().username,
			password: 'CypressPassword1',
			repeatPassword: 'CypressPassword1',
		});
		cy.contains('button', 'Submit').click();

		cy.contains('.field-error', 'This email is already registered').should('be.visible');
		cy.location('pathname').should('eq', '/sign-up');
	});

	it('reports a username that is already taken against the username input', () => {
		const existingUser = buildTestUser();

		createUserViaApi(existingUser);

		cy.visit('/sign-up');
		fillSignUpForm({
			email: buildTestUser().email,
			username: existingUser.username,
			password: 'CypressPassword1',
			repeatPassword: 'CypressPassword1',
		});
		cy.contains('button', 'Submit').click();

		cy.contains('.field-error', 'This username is taken').should('be.visible');
	});

	it('disables the button and shows "Submitting..." while the request is in flight', () => {
		const user = buildTestUser();

		cy.intercept('POST', `${serverUrl}/users/sign-up`, (req) => {
			req.on('response', (res) => {
				res.setDelay(1500);
			});
		}).as('slowSignUp');

		fillSignUpForm({ ...user, repeatPassword: user.password });
		cy.contains('button', 'Submit').click();

		cy.contains('button', 'Submitting...').should('be.disabled');

		cy.wait('@slowSignUp');
		cy.location('pathname').should('eq', '/user-feed');
	});
});
