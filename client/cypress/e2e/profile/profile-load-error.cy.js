import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, userIdFromToken } from '../../support/api';

describe('profile load error', () => {
	const user = buildTestUser();

	let userId;
	let profilePath;

	before(() => {
		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			userId = userIdFromToken(token);
			profilePath = `/user/${userId}`;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
	});

	const profileLoad = { shouldFail: true };

	const failProfileLoadUntilRetry = () => {
		profileLoad.shouldFail = true;

		cy.intercept('GET', '**/users?userIds=*', (req) => {
			if (profileLoad.shouldFail) {
				req.reply({ statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });

				return;
			}

			req.continue();
		}).as('profileRequest');
	};

	it("shows the full-page load error with Retry when the profile can't be loaded", () => {
		cy.intercept('GET', '**/users?userIds=*', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
			'failingProfile',
		);

		cy.visit(profilePath);
		cy.wait('@failingProfile');

		cy.contains('.page-load-error h1', "Couldn't load this profile").should('be.visible');
		cy.contains('.page-load-error', 'Check your connection and try again.').should('be.visible');
		cy.contains('.page-load-error button', 'Retry').should('be.visible');
		cy.get('.profile-header').should('not.exist');
	});

	it('keeps the page chrome around the load error', () => {
		cy.intercept('GET', '**/users?userIds=*', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
			'failingProfile',
		);

		cy.viewport(1440, 900);
		cy.visit(profilePath);
		cy.wait('@failingProfile');

		cy.get('.header-wrapper').should('be.visible');
		cy.get('.page-load-error').should('be.visible');
	});

	it('shows the load error when the network fails', () => {
		cy.intercept('GET', '**/users?userIds=*', { forceNetworkError: true }).as('failingProfile');

		cy.visit(profilePath);

		cy.contains('.page-load-error h1', "Couldn't load this profile").should('be.visible');
	});

	it('loads the profile when Retry is clicked after a one-off failure', () => {
		failProfileLoadUntilRetry();

		cy.visit(profilePath);
		cy.wait('@profileRequest');

		cy.contains('.page-load-error button', 'Retry')
			.should('be.visible')
			.then(() => {
				profileLoad.shouldFail = false;
			});

		cy.contains('.page-load-error button', 'Retry').click();
		cy.wait('@profileRequest');

		cy.contains('.profile-header .username', user.username).should('be.visible');
		cy.get('.page-load-error').should('not.exist');
	});

	it('keeps the load error and Retry when the retry fails too', () => {
		cy.intercept('GET', '**/users?userIds=*', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
			'failingProfile',
		);

		cy.visit(profilePath);
		cy.wait('@failingProfile');

		cy.contains('.page-load-error button', 'Retry').click();
		cy.wait('@failingProfile');

		cy.contains('.page-load-error button', 'Retry').should('be.enabled');
		cy.contains('.page-load-error h1', "Couldn't load this profile").should('be.visible');
	});

	it('works at 390 wide', () => {
		cy.viewport(390, 844);
		cy.intercept('GET', '**/users?userIds=*', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
			'failingProfile',
		);

		cy.visit(profilePath);
		cy.wait('@failingProfile');

		cy.contains('.page-load-error button', 'Retry').should('be.visible');
		cy.get('.tab-bar').should('be.visible');
	});

	describe('USER_NOT_FOUND', () => {
		it('leaves the page area blank for a user id that does not exist, without a load error', () => {
			cy.visit('/user/64b7f0a1c2d3e4f5a6b7c8d1');

			cy.get('.header-wrapper, .tab-bar').should('exist');
			cy.get('.profile-header').should('not.exist');
			cy.get('.page-load-error').should('not.exist');
			cy.get('.toast').should('not.exist');
		});

		it('leaves the page area blank for a malformed user id, without a load error', () => {
			cy.visit('/user/not-an-object-id');

			cy.get('.profile-header').should('not.exist');
			cy.get('.page-load-error').should('not.exist');
			cy.get('.toast').should('not.exist');
		});
	});
});
