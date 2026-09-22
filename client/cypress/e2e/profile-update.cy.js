import { buildTestUser } from '../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken } from '../support/api';

describe('profile update', () => {
	const user = buildTestUser();
	const otherUser = buildTestUser();
	const editedUser = buildTestUser();

	let jwtToken;
	let profilePath;

	before(() => {
		createUserViaApi(user);
		createUserViaApi(otherUser);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			profilePath = `/user/${userIdFromToken(token)}`;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
		cy.task('deleteTestUser', otherUser.email);
		cy.task('deleteTestUser', editedUser.email);
	});

	beforeEach(() => {
		cy.intercept('PATCH', '**/users/update/**').as('updateRequest');

		visitAsUser(profilePath, jwtToken);

		cy.contains('.profile-action button', 'Edit Profile').click();
		cy.get('.popup-body').should('be.visible');
	});

	const submitForm = () => cy.get('#edit-user-profile-form').contains('button', 'Submit').click();

	it('opens with every field, prefilled from the account', () => {
		cy.contains('.popup-title', 'Edit Profile').should('be.visible');

		cy.get('.profile-form-input-wrapper').should('have.length', 3);

		cy.get('input#email').should('have.value', user.email);
		cy.get('input#username').should('have.value', user.username);
		cy.get('textarea#bio').should('exist');

		cy.get('#edit-user-profile-form').contains('button', 'Submit').should('be.visible');
		cy.get('#edit-user-profile-form').contains('button', 'Cancel').should('be.visible');
	});

	it('requires an email and never reaches the server', () => {
		cy.get('input#email').clear();

		submitForm();

		cy.contains('.field-error', 'Email is required').should('be.visible');
		cy.get('.popup-body').should('be.visible');
		cy.get('@updateRequest.all').should('have.length', 0);
	});

	it('requires a username and never reaches the server', () => {
		cy.get('input#username').clear();

		submitForm();

		cy.contains('.field-error', 'Username is required').should('be.visible');
		cy.get('.popup-body').should('be.visible');
		cy.get('@updateRequest.all').should('have.length', 0);
	});

	it('closes without saving when nothing was changed', () => {
		submitForm();

		cy.get('.popup-body').should('not.exist');
		cy.get('@updateRequest.all').should('have.length', 0);
	});

	it('rejects an email that another account already uses', () => {
		cy.get('input#email').clear().type(otherUser.email);

		submitForm();

		cy.wait('@updateRequest').its('response.statusCode').should('eq', 409);

		cy.contains('.field-error', 'This email is already registered').should('be.visible');
		cy.get('.popup-body').should('be.visible');
	});

	it('rejects a username that another account already uses', () => {
		cy.get('input#username').clear().type(otherUser.username);

		submitForm();

		cy.wait('@updateRequest').its('response.statusCode').should('eq', 409);

		cy.contains('.field-error', 'This username is taken').should('be.visible');
		cy.get('.popup-body').should('be.visible');
	});

	it('keeps the session alive on a refresh straight after saving', () => {
		cy.get('textarea#bio').clear().type('Still signed in.');

		submitForm();

		cy.wait('@updateRequest');
		cy.get('.popup-body').should('not.exist');

		cy.reload();

		cy.location('pathname').should('eq', profilePath);
		cy.contains('.profile-action button', 'Edit Profile').should('exist');

		cy.window().then((win) => {
			expect(win.localStorage.getItem('jwt-token')).to.not.equal(null);
		});
	});

	it('saves a changed bio, username and email, and keeps them after a refresh', () => {
		cy.get('input#username').clear().type(editedUser.username);
		cy.get('input#email').clear().type(editedUser.email);
		cy.get('textarea#bio').clear().type('Chasing good light and better coffee.');

		submitForm();

		cy.wait('@updateRequest').its('response.statusCode').should('eq', 200);
		cy.get('.popup-body').should('not.exist');

		cy.contains('.profile-header .username', editedUser.username).should('be.visible');
		cy.contains('.profile-header .bio', 'Chasing good light and better coffee.').should('be.visible');

		cy.reload();

		cy.contains('.profile-header .username', editedUser.username).should('be.visible');
		cy.contains('.profile-header .bio', 'Chasing good light and better coffee.').should('be.visible');
	});
});
