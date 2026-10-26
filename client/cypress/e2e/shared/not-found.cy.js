import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser } from '../../support/api';

describe('404 page', () => {
	const user = buildTestUser();
	const unknownUserId = '64b7f0a1c2d3e4f5a6b7c8d1';

	let userToken;

	before(() => {
		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			userToken = token;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
	});

	describe('an unknown URL', () => {
		it('shows the 404 page to a guest, keeps the URL as typed, and Go home leads to Popular', () => {
			cy.viewport(1440, 900);
			cy.visit('/no/such/page');

			cy.contains('.page-load-error h1', 'Page not found').should('be.visible');
			cy.contains('.page-load-error', 'This link may be broken, or the page may have been removed.').should('be.visible');
			cy.location('pathname').should('eq', '/no/such/page');
			cy.get('.header-wrapper').should('be.visible');

			cy.contains('.page-load-error button', 'Go home').click();

			cy.location('pathname').should('eq', '/popular-posts');
			cy.get('.page-load-error').should('not.exist');
		});

		it('shows the 404 page to a member, and Go home leads to the feed', () => {
			visitAsUser('/no/such/page', userToken);

			cy.contains('.page-load-error h1', 'Page not found').should('be.visible');

			cy.contains('.page-load-error button', 'Go home').click();

			cy.location('pathname').should('eq', '/user-feed');
			cy.get('.page-load-error').should('not.exist');
		});
	});

	describe('a profile with an unknown id', () => {
		it('shows the 404 page inside the desktop header', () => {
			cy.viewport(1440, 900);
			cy.visit(`/user/${unknownUserId}`);

			cy.contains('.page-load-error h1', 'Page not found').should('be.visible');
			cy.location('pathname').should('eq', `/user/${unknownUserId}`);
			cy.get('.header-wrapper').should('be.visible');
		});

		it('keeps the mobile top bar with Search and the tab bar around the 404 page', () => {
			cy.viewport(390, 844);
			visitAsUser(`/user/${unknownUserId}`, userToken);

			cy.contains('.page-load-error h1', 'Page not found').should('be.visible');
			cy.get('.mobile-top-bar-action[aria-label="Search"]').should('be.visible');
			cy.get('.tab-bar').should('be.visible');
		});

		it('keeps the mobile top bar with Search on the /posts path too', () => {
			cy.viewport(390, 844);
			visitAsUser(`/user/${unknownUserId}/posts`, userToken);

			cy.contains('.page-load-error h1', 'Page not found').should('be.visible');
			cy.get('.mobile-top-bar-action[aria-label="Search"]').should('be.visible');
		});

		it('leads to the feed with Go home on mobile', () => {
			cy.viewport(390, 844);
			visitAsUser(`/user/${unknownUserId}`, userToken);

			cy.contains('.page-load-error button', 'Go home').click();

			cy.location('pathname').should('eq', '/user-feed');
		});
	});
});
