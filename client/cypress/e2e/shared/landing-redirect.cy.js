import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser } from '../../support/api';

describe('landing redirect from /', () => {
	const user = buildTestUser();

	let session;

	before(() => {
		createUserViaApi(user);

		loginViaApi(user).then((loggedInSession) => {
			session = loggedInSession;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
	});

	it('sends a guest to the popular posts page', () => {
		cy.visit('/');

		cy.location('pathname').should('eq', '/popular-posts');
		cy.get('.popular-posts-wrapper').should('exist');
	});

	it('keeps sending a logged-in user to the feed', () => {
		visitAsUser('/', session);

		cy.location('pathname').should('eq', '/user-feed');
	});
});
