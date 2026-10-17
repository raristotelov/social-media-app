import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, uploadPostViaApi, uploadProfilePictureViaApi } from '../../support/api';

describe('cloudinary teardown', () => {
	let user;
	let jwtToken;

	beforeEach(() => {
		user = buildTestUser();

		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			jwtToken = token;
		});
	});

	afterEach(() => {
		cy.task('deleteTestUser', user.email);
	});

	it('removes the post image and the profile picture of a test user from Cloudinary', () => {
		let postImageIdentifier;
		let pictureImageIdentifier;

		cy.then(() => uploadPostViaApi(jwtToken, 'Teardown check')).then((post) => {
			postImageIdentifier = post.imageIdentifier;
		});

		cy.then(() => uploadProfilePictureViaApi(jwtToken)).then((picture) => {
			pictureImageIdentifier = picture.imageIdentifier;
		});

		cy.then(() => cy.task('cloudinaryAssetExists', postImageIdentifier)).should('eq', true);
		cy.then(() => cy.task('cloudinaryAssetExists', pictureImageIdentifier)).should('eq', true);

		cy.task('deleteTestUser', user.email);

		cy.then(() => cy.task('cloudinaryAssetExists', postImageIdentifier)).should('eq', false);
		cy.then(() => cy.task('cloudinaryAssetExists', pictureImageIdentifier)).should('eq', false);
	});
});
