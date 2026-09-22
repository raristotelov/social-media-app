import { buildTestUser } from '../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken } from '../support/api';

describe('user search', () => {
	const user = buildTestUser();
	const searchedUser = buildTestUser();

	let jwtToken;
	let ownProfilePath;
	let searchedProfilePath;

	before(() => {
		createUserViaApi(user);

		createUserViaApi(searchedUser).then((response) => {
			searchedProfilePath = `/user/${userIdFromToken(response.body)}`;
		});

		loginViaApi(user).then((token) => {
			jwtToken = token;
			ownProfilePath = `/user/${userIdFromToken(token)}`;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
		cy.task('deleteTestUser', searchedUser.email);
	});

	it('shows matching users in the header dropdown and opens the one you pick', () => {
		cy.viewport(1440, 900);
		visitAsUser(ownProfilePath, jwtToken);

		cy.get('.search-input').type(searchedUser.username);

		cy.contains('.search-option', searchedUser.username).should('be.visible').click();

		cy.location('pathname').should('eq', searchedProfilePath);
		cy.contains('.profile-header .username', searchedUser.username).should('be.visible');
	});

	it('lets a guest search', () => {
		cy.viewport(1440, 900);
		cy.visit('/popular-posts');

		cy.get('.search-input').type(searchedUser.username);

		cy.contains('.search-option', searchedUser.username).should('be.visible');
	});

	it('expands the field from the magnifier on mobile and opens a result', () => {
		cy.viewport(390, 844);
		visitAsUser(ownProfilePath, jwtToken);

		cy.get('.mobile-search-field').should('not.exist');

		cy.get('.mobile-top-bar-action[aria-label="Search"]').click();
		cy.get('.mobile-search-field').should('be.visible').type(searchedUser.username);

		cy.contains('.search-result-username', searchedUser.username).should('be.visible');
		cy.contains('.search-result', searchedUser.username).click();

		cy.location('pathname').should('eq', searchedProfilePath);
	});

	it('closes the mobile search when Cancel is clicked', () => {
		cy.viewport(390, 844);
		visitAsUser(ownProfilePath, jwtToken);

		cy.get('.mobile-top-bar-action[aria-label="Search"]').click();
		cy.get('.mobile-search-field').should('be.visible');

		cy.get('.mobile-search-cancel').click();

		cy.get('.mobile-search-field').should('not.exist');
	});
});
