import { buildTestUser } from '../support/testUser';
import { createUserViaApi, userIdFromToken, loginViaApi } from '../support/api';

describe('guest profile', () => {
	const user = buildTestUser();

	let profilePath;

	before(() => {
		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			profilePath = `/user/${userIdFromToken(token)}`;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
	});

	beforeEach(() => {
		cy.visit(profilePath);
	});

	it('lets a guest read the profile without an account', () => {
		cy.contains('.profile-header .username', user.username).should('be.visible');
		cy.get('.profile-stat').should('have.length', 3);
		cy.get('.profile-posts-wrapper').should('exist');
	});

	it('shows guest navigation rather than the account menu', () => {
		cy.viewport(1440, 900);
		cy.visit(profilePath);

		cy.get('.header-wrapper').within(() => {
			cy.contains('Log in').should('be.visible');
			cy.contains('Sign up').should('be.visible');
		});

		cy.get('.logged-user-avatar').should('not.exist');
	});

	it('shows guest navigation in the tab bar at 390', () => {
		cy.viewport(390, 844);
		cy.visit(profilePath);

		cy.get('.tab-bar').within(() => {
			cy.contains('Log in').should('be.visible');
			cy.contains('Sign up').should('be.visible');
			cy.contains('Profile').should('not.exist');
		});
	});

	it('sends a guest to log in when Follow is clicked, and back to the profile afterwards', () => {
		cy.contains('.profile-action button', 'Follow').click();

		cy.location('pathname').should('eq', '/log-in');

		cy.get('input#email').type(user.email);
		cy.get('input#password').type(user.password);
		cy.contains('button', 'Submit').click();

		cy.location('pathname').should('eq', profilePath);
		cy.contains('.profile-header .username', user.username).should('be.visible');
	});
});
