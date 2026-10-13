import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken, getProfileViaApi } from '../../support/api';

const FIXTURE_IMAGE = 'cypress/fixtures/test-image.png';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const TYPE_MESSAGE = 'Choose a JPEG, PNG or WebP image';
const SIZE_MESSAGE = 'This image is over 10 MB';
const FALLBACK_MESSAGE = "Couldn't save your profile. Try again.";

describe('profile picture upload errors', () => {
	let user;
	let jwtToken;
	let userId;
	let profilePath;

	const openEditProfile = () => {
		cy.contains('.profile-action button', 'Edit Profile').click();
		cy.contains('.popup-title', 'Edit Profile').should('be.visible');
	};

	const fileInput = () => cy.get('#edit-user-profile-form input[type="file"]');

	const submitButton = () => cy.get('#edit-user-profile-form').contains('button', 'Submit');

	const pictureError = () => cy.get('#edit-user-profile-form .profile-form-profile-picture-wrapper .field-error');

	const stubUpdate = (statusCode, body) => cy.intercept('PATCH', '**/users/update/**', { statusCode, body }).as('updateRequest');

	const chooseAndSubmit = () => {
		openEditProfile();
		fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		submitButton().click();
	};

	beforeEach(() => {
		user = buildTestUser();

		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			userId = userIdFromToken(token);
			profilePath = `/user/${userId}`;
		});
	});

	afterEach(() => {
		cy.task('deleteTestUser', user.email);
	});

	describe('choosing a file in the browser', () => {
		beforeEach(() => {
			cy.intercept('PATCH', '**/users/update/**').as('updateRequest');
			visitAsUser(profilePath, jwtToken);
			openEditProfile();
		});

		it('rejects a file that is not JPEG, PNG or WebP with the type message under the picture and sends no request', () => {
			fileInput().selectFile({ contents: 'just some text', fileName: 'notes.txt', mimeType: 'text/plain' }, { force: true });

			pictureError().should('be.visible').and('have.text', TYPE_MESSAGE);
			cy.get('#edit-user-profile-form .preview-wrapper').should('not.be.visible');
			cy.get('@updateRequest.all').should('have.length', 0);
		});

		it('rejects a file over 10 MB with the size message under the picture and sends no request', () => {
			fileInput().selectFile(
				{ contents: Cypress.Buffer.alloc(MAX_IMAGE_BYTES + 1), fileName: 'huge.jpg', mimeType: 'image/jpeg' },
				{ force: true },
			);

			pictureError().should('be.visible').and('have.text', SIZE_MESSAGE);
			cy.get('@updateRequest.all').should('have.length', 0);
		});

		it('clears the message when a valid picture is chosen afterwards', () => {
			fileInput().selectFile({ contents: 'just some text', fileName: 'notes.txt', mimeType: 'text/plain' }, { force: true });
			pictureError().should('be.visible');

			fileInput().selectFile(FIXTURE_IMAGE, { force: true });

			cy.get('#edit-user-profile-form .field-error').should('not.exist');
		});

		it('only offers JPEG, PNG and WebP in the file picker', () => {
			fileInput().should('have.attr', 'accept', 'image/jpeg,image/png,image/webp');
		});
	});

	describe('when the server rejects the upload', () => {
		it('shows the size message under the picture for a 413 and keeps the popup open', () => {
			stubUpdate(413, { code: 'IMAGE_TOO_LARGE', message: 'profilePicture: IMAGE_TOO_LARGE', fields: { profilePicture: 'IMAGE_TOO_LARGE' } });
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();
			cy.wait('@updateRequest');

			pictureError().should('be.visible').and('have.text', SIZE_MESSAGE);
			cy.get('.popup-body').should('be.visible');
			cy.get('#edit-user-profile-form .form-error').should('not.exist');
		});

		it('shows the fallback message and keeps the popup open for a 500', () => {
			stubUpdate(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();
			cy.wait('@updateRequest');

			cy.get('#edit-user-profile-form .form-error').should('be.visible').and('have.text', FALLBACK_MESSAGE);
			cy.get('.popup-body').should('be.visible');
			cy.then(() => getProfileViaApi(userId))
				.its('profilePicture')
				.should('not.exist');
		});

		it('clears the picture message when the picture is removed', () => {
			stubUpdate(413, { code: 'IMAGE_TOO_LARGE', message: 'profilePicture: IMAGE_TOO_LARGE', fields: { profilePicture: 'IMAGE_TOO_LARGE' } });
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();
			cy.wait('@updateRequest');
			pictureError().should('be.visible');

			cy.get('#edit-user-profile-form .image-remove-button').click();

			cy.get('#edit-user-profile-form .field-error').should('not.exist');
		});
	});

	describe('while the request is in flight', () => {
		beforeEach(() => {
			cy.intercept('PATCH', '**/users/update/**', (req) => {
				req.reply({ delay: 1500, statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
			}).as('updateRequest');
			visitAsUser(profilePath, jwtToken);
			openEditProfile();
			fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		});

		it('disables Submit until the response arrives, then enables it again', () => {
			submitButton().should('not.be.disabled').click();

			submitButton().should('be.disabled');

			cy.wait('@updateRequest');

			submitButton().should('not.be.disabled');
		});

		it('sends one request when Submit is double-clicked', () => {
			submitButton().dblclick();

			cy.wait('@updateRequest');

			cy.get('@updateRequest.all').should('have.length', 1);
		});
	});

	describe('at narrow widths', () => {
		[300, 390].forEach((width) => {
			it(`shows the picture error under the picture at ${width}px without horizontal scrolling`, () => {
				cy.viewport(width, 700);
				visitAsUser(profilePath, jwtToken);
				openEditProfile();

				fileInput().selectFile({ contents: 'just some text', fileName: 'notes.txt', mimeType: 'text/plain' }, { force: true });

				pictureError().should('be.visible');
				cy.document().then((doc) => {
					expect(doc.documentElement.scrollWidth).to.be.at.most(width);
				});
			});
		});
	});
});
