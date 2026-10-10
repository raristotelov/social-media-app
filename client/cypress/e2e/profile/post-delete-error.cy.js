import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken, createPostViaApi, getProfileViaApi } from '../../support/api';

describe('post delete error toast', () => {
	let user;
	let jwtToken;
	let userId;
	let profilePath;

	const openDeleteConfirmation = (index) => {
		cy.get('.profile-post').eq(index).find('.post-actions-button').click();
		cy.contains('.post-actions-menu button', 'Delete').click();
		cy.get('.delete-post-popup').should('be.visible');
	};

	const confirmDelete = () => cy.get('.delete-post-actions').contains('button', 'Delete').click();

	const stubDelete = (statusCode, body) => cy.intercept('DELETE', '**/user-posts/**', { statusCode, body }).as('failingDelete');

	beforeEach(() => {
		user = buildTestUser();

		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			userId = userIdFromToken(token);
			profilePath = `/user/${userId}`;
		});

		cy.then(() => createPostViaApi(jwtToken, 'first caption'));
		cy.then(() => createPostViaApi(jwtToken, 'second caption'));
	});

	afterEach(() => {
		cy.task('deleteTestUser', user.email);
	});

	it('closes the confirmation and shows the fallback toast when the server answers INTERNAL_ERROR', () => {
		stubDelete(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.wait('@failingDelete');

		cy.get('.delete-post-popup').should('not.exist');
		cy.contains('.toast-region .toast-message', "Couldn't delete the post. Try again.").should('be.visible');
		cy.get('.profile-post').should('have.length', 2);
		cy.get('.profile-stat').first().find('strong').should('have.text', '2');
	});

	it('shows the POST_NOT_FOUND copy as a toast', () => {
		stubDelete(404, { code: 'POST_NOT_FOUND', message: 'Post not found' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.wait('@failingDelete');

		cy.contains('.toast-region .toast-message', 'This post no longer exists').should('be.visible');
		cy.get('.profile-post').should('have.length', 2);
	});

	it('shows the POST_FORBIDDEN copy as a toast', () => {
		stubDelete(403, { code: 'POST_FORBIDDEN', message: 'You can only change your own posts' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.wait('@failingDelete');

		cy.contains('.toast-region .toast-message', 'You can only change your own posts').should('be.visible');
	});

	it('shows the fallback toast when the network fails', () => {
		cy.intercept('DELETE', '**/user-posts/**', { forceNetworkError: true }).as('failingDelete');
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.contains('.toast-region .toast-message', "Couldn't delete the post. Try again.").should('be.visible');
	});

	it('never shows the developer message from the server', () => {
		stubDelete(500, { code: 'INTERNAL_ERROR', message: 'Could not delete image cypress_image_123' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.wait('@failingDelete');

		cy.contains('.toast-region .toast-message', "Couldn't delete the post. Try again.").should('be.visible');
		cy.contains('cypress_image_123').should('not.exist');
	});

	it('dismisses the toast with the close button', () => {
		stubDelete(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.get('.toast-region .toast').should('be.visible');
		cy.get('.toast-region .toast-close').click();

		cy.get('.toast-region .toast').should('not.exist');
	});

	it('dismisses the toast by itself after 5 seconds', () => {
		stubDelete(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.get('.toast-region .toast').should('be.visible');
		cy.get('.toast-region .toast', { timeout: 8000 }).should('not.exist');
	});

	it('keeps the toast while the pointer is over it', () => {
		stubDelete(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.get('.toast-region .toast').trigger('mouseover');
		cy.wait(6000);

		cy.get('.toast-region .toast').should('be.visible');
	});

	it('shows the toast above the tab bar at 390', () => {
		cy.viewport(390, 844);
		stubDelete(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.get('.toast-region .toast').should('be.visible');
		cy.get('.tab-bar').should('be.visible');
	});

	it('ends the session and sends the user to /log-in when the delete answers UNAUTHENTICATED', () => {
		stubDelete(401, { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.wait('@failingDelete');

		cy.location('pathname').should('eq', '/log-in');
		cy.get('.toast-region .toast').should('not.exist');

		cy.window().then((win) => {
			expect(win.localStorage.getItem('jwt-token')).to.equal(null);
		});
	});

	it('leaves the stored posts untouched after a failed delete', () => {
		stubDelete(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.wait('@failingDelete');

		cy.then(() => getProfileViaApi(userId))
			.its('posts')
			.should('have.length', 2);
	});
});
