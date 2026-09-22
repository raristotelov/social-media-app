import { buildTestUser } from '../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken } from '../support/api';

describe('dark mode', () => {
	const user = buildTestUser();

	let jwtToken;
	let profilePath;

	before(() => {
		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			profilePath = `/user/${userIdFromToken(token)}`;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
	});

	const openDesktopAccountMenu = () => {
		cy.viewport(1440, 900);
		visitAsUser(profilePath, jwtToken);
		cy.get('.logged-user-avatar').click();
	};

	it('switches the whole app to dark from the account menu', () => {
		openDesktopAccountMenu();

		cy.get('html').should('have.attr', 'data-theme', 'light');

		cy.contains('.account-menu-row', 'Dark mode').click();

		cy.get('html').should('have.attr', 'data-theme', 'dark');
		cy.get('body').should('have.css', 'background-color', 'rgb(0, 0, 0)');
	});

	it('keeps the choice across a reload', () => {
		openDesktopAccountMenu();
		cy.contains('.account-menu-row', 'Dark mode').click();
		cy.get('html').should('have.attr', 'data-theme', 'dark');

		cy.reload();

		cy.get('html').should('have.attr', 'data-theme', 'dark');
	});

	it('keeps the login page dark after logging out', () => {
		openDesktopAccountMenu();
		cy.contains('.account-menu-row', 'Dark mode').click();
		cy.get('html').should('have.attr', 'data-theme', 'dark');

		cy.get('.logged-user-avatar').click();
		cy.contains('.account-menu-row', 'Log out').click();

		cy.location('pathname').should('eq', '/log-in');
		cy.get('html').should('have.attr', 'data-theme', 'dark');
	});

	it('switches from the bottom sheet on mobile', () => {
		cy.viewport(390, 844);
		visitAsUser(profilePath, jwtToken);

		cy.get('.mobile-top-bar-action[aria-label="Account menu"]').click();
		cy.get('.account-menu-sheet').should('be.visible');

		cy.contains('.account-menu-row', 'Dark mode').click();

		cy.get('html').should('have.attr', 'data-theme', 'dark');
	});
});
