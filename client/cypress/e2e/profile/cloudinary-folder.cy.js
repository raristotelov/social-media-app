import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, uploadPostViaApi, uploadProfilePictureViaApi } from '../../support/api';

describe('cloudinary upload folder', () => {
	let user;
	let session;
	let uploadFolder;

	beforeEach(() => {
		user = buildTestUser();

		createUserViaApi(user);

		loginViaApi(user).then((loggedInSession) => {
			session = loggedInSession;
		});

		cy.task('getCloudinaryFolder').then((folder) => {
			uploadFolder = folder;
		});
	});

	afterEach(() => {
		cy.task('deleteTestUser', user.email);
	});

	it('uploads a post image into the configured folder', () => {
		cy.then(() => uploadPostViaApi(session, 'Folder check')).then((post) => {
			expect(post.imageIdentifier).to.match(new RegExp(`^${Cypress._.escapeRegExp(uploadFolder)}/`));
		});
	});

	it('uploads a profile picture into the configured folder', () => {
		cy.then(() => uploadProfilePictureViaApi(session)).then((picture) => {
			expect(picture.imageIdentifier).to.match(new RegExp(`^${Cypress._.escapeRegExp(uploadFolder)}/`));
		});
	});
});
