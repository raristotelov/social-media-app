import { buildTestUser } from '../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken } from '../support/api';

describe('profile view', () => {
	const user = buildTestUser();
	const otherUser = buildTestUser();

	let jwtToken;
	let ownProfilePath;
	let otherProfilePath;

	before(() => {
		createUserViaApi(user);

		createUserViaApi(otherUser).then((response) => {
			otherProfilePath = `/user/${userIdFromToken(response.body)}`;
		});

		loginViaApi(user).then((token) => {
			jwtToken = token;
			ownProfilePath = `/user/${userIdFromToken(token)}`;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
		cy.task('deleteTestUser', otherUser.email);
	});

	it('shows Edit Profile and the add-post tile on your own profile', () => {
		visitAsUser(ownProfilePath, jwtToken);

		cy.contains('.profile-header .username', user.username).should('be.visible');
		cy.contains('.profile-action button', 'Edit Profile').should('be.visible');
		cy.get('.add-post-button').should('exist');
	});

	it('shows Follow and no add-post tile on another user profile', () => {
		visitAsUser(otherProfilePath, jwtToken);

		cy.contains('.profile-header .username', otherUser.username).should('be.visible');
		cy.contains('.profile-action button', 'Follow').should('be.visible');
		cy.get('.add-post-button').should('not.exist');
	});

	it('shows the desktop header and hides the tab bar above the mobile breakpoint', () => {
		cy.viewport(1440, 900);
		visitAsUser(ownProfilePath, jwtToken);

		cy.get('.header-wrapper').should('be.visible');
		cy.get('.mobile-top-bar').should('not.be.visible');
		cy.get('.tab-bar').should('not.be.visible');
	});

	it('shows the mobile top bar and tab bar at 390', () => {
		cy.viewport(390, 844);
		visitAsUser(ownProfilePath, jwtToken);

		cy.get('.mobile-top-bar').should('be.visible');
		cy.get('.tab-bar').should('be.visible');
		cy.get('.header-wrapper').should('not.be.visible');
	});
});
