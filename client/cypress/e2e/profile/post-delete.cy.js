import { buildTestUser } from '../../support/testUser';
import {
	serverUrl,
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromToken,
	createPostViaApi,
	getProfileViaApi,
	deletePostViaApi,
} from '../../support/api';

describe('post delete', () => {
	let user;
	let otherUser;
	let jwtToken;
	let otherJwtToken;
	let userId;
	let profilePath;
	let posts;

	const tileActionsButton = (index) => cy.get('.profile-post').eq(index).find('.post-actions-button');

	const openDeleteConfirmation = (index) => {
		tileActionsButton(index).click();
		cy.contains('.post-actions-menu button', 'Delete').click();
		cy.get('.delete-post-popup').should('be.visible');
	};

	const confirmDelete = () => cy.get('.delete-post-actions').contains('button', 'Delete').click();

	beforeEach(() => {
		user = buildTestUser();
		otherUser = buildTestUser();
		posts = [];

		createUserViaApi(user);
		createUserViaApi(otherUser);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			userId = userIdFromToken(token);
			profilePath = `/user/${userId}`;
		});

		loginViaApi(otherUser).then((token) => {
			otherJwtToken = token;
		});

		cy.then(() => createPostViaApi(jwtToken, 'first caption')).then((post) => posts.push(post));
		cy.then(() => createPostViaApi(jwtToken, 'second caption')).then((post) => posts.push(post));

		cy.intercept('DELETE', '**/user-posts/**').as('deleteRequest');
	});

	afterEach(() => {
		cy.task('deleteTestUser', user.email);
		cy.task('deleteTestUser', otherUser.email);
	});

	it('opens a menu with Edit and Delete from a tile', () => {
		visitAsUser(profilePath, jwtToken);

		tileActionsButton(0).click();

		cy.contains('.post-actions-menu button', 'Edit').should('be.visible');
		cy.contains('.post-actions-menu button', 'Delete').should('be.visible');
	});

	it('asks for confirmation before deleting and sends nothing yet', () => {
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);

		cy.contains('.delete-post-popup', 'permanently deleted').should('be.visible');
		cy.get('.delete-post-actions').contains('button', 'Cancel').should('be.visible');
		cy.get('@deleteRequest.all').should('have.length', 0);
	});

	it('leaves the post untouched when Cancel is clicked', () => {
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		cy.get('.delete-post-actions').contains('button', 'Cancel').click();

		cy.get('.delete-post-popup').should('not.exist');
		cy.get('.profile-post').should('have.length', 2);
		cy.get('.profile-stat').first().find('strong').should('have.text', '2');
		cy.get('@deleteRequest.all').should('have.length', 0);

		cy.then(() => getProfileViaApi(userId))
			.its('posts')
			.should('have.length', 2);
	});

	it('deletes the post, updates the grid and the post count, and keeps it gone after a refresh', () => {
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.wait('@deleteRequest').its('response.statusCode').should('eq', 204);

		cy.get('.delete-post-popup').should('not.exist');
		cy.get('.profile-post').should('have.length', 1);
		cy.get('.profile-stat').first().find('strong').should('have.text', '1');

		cy.reload();

		cy.get('.profile-post').should('have.length', 1);

		cy.then(() => getProfileViaApi(userId)).then((profile) => {
			expect(profile.posts).to.have.length(1);
			expect(profile.posts[0]._id).to.equal(posts[1]._id);
		});
	});

	it('shows an error toast and keeps the post when the request fails', () => {
		cy.intercept('DELETE', '**/user-posts/**', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
			'failingDelete',
		);

		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(0);
		confirmDelete();

		cy.wait('@failingDelete');

		cy.get('.delete-post-popup').should('not.exist');
		cy.contains('.toast-region .toast-message', "Couldn't delete the post. Try again.").should('be.visible');
		cy.get('.profile-post').should('have.length', 2);
		cy.get('.profile-stat').first().find('strong').should('have.text', '2');

		cy.then(() => getProfileViaApi(userId))
			.its('posts')
			.should('have.length', 2);
	});

	it('works from the bottom sheets on mobile', () => {
		cy.viewport(390, 844);
		visitAsUser(profilePath, jwtToken);

		openDeleteConfirmation(1);
		confirmDelete();

		cy.wait('@deleteRequest').its('response.statusCode').should('eq', 204);
		cy.get('.profile-post').should('have.length', 1);
	});

	it('does not show post actions on another user profile', () => {
		visitAsUser(profilePath, otherJwtToken);

		cy.get('.profile-post').should('have.length', 2);
		cy.get('.post-actions-button').should('not.exist');
	});

	describe('server authorization', () => {
		it('rejects a delete without a token', () => {
			cy.request({ method: 'DELETE', url: `${serverUrl}/user-posts/${posts[0]._id}`, failOnStatusCode: false })
				.its('status')
				.should('eq', 401);

			cy.then(() => getProfileViaApi(userId))
				.its('posts')
				.should('have.length', 2);
		});

		it("rejects deleting someone else's post and leaves it in place", () => {
			cy.then(() => deletePostViaApi(otherJwtToken, posts[0]._id, false))
				.its('status')
				.should('eq', 403);

			cy.then(() => getProfileViaApi(userId))
				.its('posts')
				.should('have.length', 2);
		});

		it('answers 404 for a post id that does not exist', () => {
			cy.then(() => deletePostViaApi(jwtToken, '64b7f0a1c2d3e4f5a6b7c8e1', false))
				.its('status')
				.should('eq', 404);
		});

		it('answers 404 for a malformed post id', () => {
			cy.then(() => deletePostViaApi(jwtToken, 'not-an-id', false))
				.its('status')
				.should('eq', 404);
		});
	});
});
