import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromToken,
	uploadPostViaApi,
	getProfileViaApi,
	editCaptionViaApi,
} from '../../support/api';

describe('post edit', () => {
	let user;
	let otherUser;
	let jwtToken;
	let otherJwtToken;
	let userId;
	let profilePath;
	let post;

	const openEditPopup = (index = 0) => {
		cy.get('.profile-post').eq(index).find('.post-actions-button').click();
		cy.contains('.post-actions-menu button', 'Edit').click();
		cy.contains('.popup-title', 'Edit Picture').should('be.visible');
	};

	const captionField = () => cy.get('.popup-body textarea.caption-input');

	const saveButton = () => cy.get('#edit-post-form').contains('button', 'Save');

	beforeEach(() => {
		user = buildTestUser();
		otherUser = buildTestUser();

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

		cy.then(() => uploadPostViaApi(jwtToken, 'original caption')).then((created) => {
			post = created;
		});

		cy.intercept('PATCH', '**/user-posts/**').as('editRequest');
	});

	afterEach(() => {
		cy.task('deleteTestUser', user.email);
		cy.task('deleteTestUser', otherUser.email);
	});

	it('opens a caption-only popup prefilled with the current caption and the post image', () => {
		visitAsUser(profilePath, jwtToken);

		openEditPopup();

		captionField().should('have.value', 'original caption');
		cy.get('.popup-body img.edit-post-image').should('have.attr', 'src', post.imageUrl);
		cy.get('.popup-body input[type="file"]').should('not.exist');
		saveButton().should('be.visible');
		cy.get('#edit-post-form').contains('button', 'Cancel').should('be.visible');
	});

	it('closes without saving when nothing was changed', () => {
		visitAsUser(profilePath, jwtToken);

		openEditPopup();
		saveButton().click();

		cy.get('.popup-body').should('not.exist');
		cy.get('@editRequest.all').should('have.length', 0);
	});

	it('discards the change when Cancel is clicked', () => {
		visitAsUser(profilePath, jwtToken);

		openEditPopup();
		captionField().type(' with more words');
		cy.get('#edit-post-form').contains('button', 'Cancel').click();

		cy.get('.popup-body').should('not.exist');
		cy.get('@editRequest.all').should('have.length', 0);

		openEditPopup();

		captionField().should('have.value', 'original caption');
	});

	it('saves the new caption, keeps the image, and shows it again after a refresh', () => {
		visitAsUser(profilePath, jwtToken);

		openEditPopup();
		captionField().clear().type('a brand new caption');
		saveButton().click();

		cy.wait('@editRequest').its('response.statusCode').should('eq', 200);
		cy.get('.popup-body').should('not.exist');

		openEditPopup();
		captionField().should('have.value', 'a brand new caption');
		cy.get('.popup-body img.edit-post-image').should('have.attr', 'src', post.imageUrl);

		cy.reload();

		openEditPopup();
		captionField().should('have.value', 'a brand new caption');

		cy.then(() => getProfileViaApi(userId)).then((profile) => {
			expect(profile.posts).to.have.length(1);
			expect(profile.posts[0].caption).to.equal('a brand new caption');
			expect(profile.posts[0].imageUrl).to.equal(post.imageUrl);
			expect(profile.posts[0].imageIdentifier).to.equal(post.imageIdentifier);
		});
	});

	it('allows saving an emptied caption', () => {
		visitAsUser(profilePath, jwtToken);

		openEditPopup();
		captionField().clear();
		saveButton().click();

		cy.wait('@editRequest').its('response.statusCode').should('eq', 200);

		cy.then(() => getProfileViaApi(userId))
			.its('posts.0.caption')
			.should('eq', '');
	});

	it('shows an error in the popup and keeps it open when the request fails', () => {
		cy.intercept('PATCH', '**/user-posts/**', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
			'failingEdit',
		);

		visitAsUser(profilePath, jwtToken);

		openEditPopup();
		captionField().type(' more');
		saveButton().click();

		cy.wait('@failingEdit');

		cy.contains('.popup-body .form-error', "Couldn't save the caption. Try again.").should('be.visible');
		cy.contains('.popup-title', 'Edit Picture').should('be.visible');
	});

	it('works as a full-screen view on mobile', () => {
		cy.viewport(390, 844);
		visitAsUser(profilePath, jwtToken);

		openEditPopup();
		captionField().clear().type('mobile caption');
		saveButton().click();

		cy.wait('@editRequest').its('response.statusCode').should('eq', 200);
		cy.get('.popup-body').should('not.exist');
	});

	describe('server authorization and validation', () => {
		it("rejects editing someone else's post and leaves the caption unchanged", () => {
			cy.then(() => editCaptionViaApi(otherJwtToken, post._id, 'hijacked', false))
				.its('status')
				.should('eq', 403);

			cy.then(() => getProfileViaApi(userId))
				.its('posts.0.caption')
				.should('eq', 'original caption');
		});

		it('rejects a non-text caption with a 400', () => {
			cy.then(() => editCaptionViaApi(jwtToken, post._id, 42, false))
				.its('status')
				.should('eq', 400);

			cy.then(() => getProfileViaApi(userId))
				.its('posts.0.caption')
				.should('eq', 'original caption');
		});

		it('answers 404 for a post id that does not exist', () => {
			cy.then(() => editCaptionViaApi(jwtToken, '64b7f0a1c2d3e4f5a6b7c8e1', 'x', false))
				.its('status')
				.should('eq', 404);
		});

		it('answers 404 for a malformed post id', () => {
			cy.then(() => editCaptionViaApi(jwtToken, 'not-an-id', 'x', false))
				.its('status')
				.should('eq', 404);
		});
	});
});
