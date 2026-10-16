import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser } from '../../support/api';

describe('landing redirect from /', () => {
	const user = buildTestUser();

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

	it('sends a guest to the popular posts page', () => {
		cy.visit('/');

		cy.location('pathname').should('eq', '/popular-posts');
		cy.get('.popular-posts-wrapper').should('exist');
	});

	it('keeps sending a logged-in user to the feed', () => {
		visitAsUser('/', userToken);

		cy.location('pathname').should('eq', '/user-feed');
	});
});
