import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, uploadPostViaApi, followUserViaApi, userIdFromToken } from '../../support/api';

describe('feed', () => {
	const viewer = buildTestUser();
	const firstAuthor = buildTestUser();
	const secondAuthor = buildTestUser();

	let viewerToken;
	let firstAuthorToken;
	let secondAuthorToken;

	before(() => {
		createUserViaApi(viewer);
		createUserViaApi(firstAuthor);
		createUserViaApi(secondAuthor);

		loginViaApi(viewer).then((token) => {
			viewerToken = token;
		});

		loginViaApi(firstAuthor).then((token) => {
			firstAuthorToken = token;
		});

		loginViaApi(secondAuthor).then((token) => {
			secondAuthorToken = token;
		});
	});

	after(() => {
		cy.task('deleteTestUser', viewer.email);
		cy.task('deleteTestUser', firstAuthor.email);
		cy.task('deleteTestUser', secondAuthor.email);
	});

	describe('for a user who follows nobody', () => {
		it('shows only the empty state', () => {
			visitAsUser('/user-feed', viewerToken);

			cy.contains('.feed-empty h1', 'Your feed is empty').should('be.visible');
			cy.contains('.feed-empty', 'Follow people to see their posts here').should('be.visible');
			cy.get('.user-post').should('not.exist');
		});
	});

	describe('for a user who follows people', () => {
		before(() => {
			cy.then(() => uploadPostViaApi(firstAuthorToken, 'oldest from first author'));
			cy.then(() => uploadPostViaApi(secondAuthorToken, 'middle from second author'));
			cy.then(() => uploadPostViaApi(firstAuthorToken, 'newest from first author'));

			cy.then(() => followUserViaApi(viewerToken, userIdFromToken(firstAuthorToken)));
			cy.then(() => followUserViaApi(viewerToken, userIdFromToken(secondAuthorToken)));
		});

		it('lists the followed users posts newest first, across authors', () => {
			visitAsUser('/user-feed', viewerToken);

			cy.get('.user-post').should('have.length', 3);
			cy.get('.user-post').eq(0).should('contain.text', 'newest from first author');
			cy.get('.user-post').eq(1).should('contain.text', 'middle from second author');
			cy.get('.user-post').eq(2).should('contain.text', 'oldest from first author');
		});

		it("shows each post's author in the card header", () => {
			visitAsUser('/user-feed', viewerToken);

			cy.get('.user-post').eq(1).find('.user-post-username').should('have.text', secondAuthor.username);
			cy.get('.user-post').eq(0).find('.user-post-username').should('have.text', firstAuthor.username);
		});

		it('shows no post actions on the feed', () => {
			visitAsUser('/user-feed', viewerToken);

			cy.get('.user-post').should('have.length', 3);
			cy.get('.user-post-actions-button').should('not.exist');
		});
	});

	describe('for a guest', () => {
		it('redirects /user-feed to /log-in and returns to /user-feed after logging in', () => {
			cy.visit('/user-feed');

			cy.location('pathname').should('eq', '/log-in');

			cy.get('input#email').type(viewer.email);
			cy.get('input#password').type(viewer.password);
			cy.contains('button', 'Submit').click();

			cy.location('pathname').should('eq', '/user-feed');
			cy.get('.user-post').should('exist');
		});
	});
});
