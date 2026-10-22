import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken, getProfileViaApi } from '../../support/api';

const FIXTURE_IMAGE = 'cypress/fixtures/test-image.png';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const TYPE_MESSAGE = 'Choose a JPEG, PNG or WebP image';
const SIZE_MESSAGE = 'This image is over 10 MB';
const FALLBACK_MESSAGE = "Couldn't upload the picture. Try again.";

describe('post upload errors', () => {
	let user;
	let jwtToken;
	let userId;
	let profilePath;

	const openUploadPopup = () => {
		cy.get('.add-post-button').click();
		cy.contains('.create-popup [role="tab"][aria-selected="true"]', 'Post').should('be.visible');
	};

	const fileInput = () => cy.get('#add-image-post-form input[type="file"]');

	const submitButton = () => cy.get('#add-image-post-form').contains('button', 'Share');

	const pictureError = () => cy.get('#add-image-post-form .add-image-post-image-wrapper .field-error');

	const stubUpload = (statusCode, body) => cy.intercept('POST', '**/user-posts', { statusCode, body }).as('uploadRequest');

	const expectNoPostSaved = () => {
		cy.then(() => getProfileViaApi(userId))
			.its('posts')
			.should('have.length', 0);
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
			cy.intercept('POST', '**/user-posts').as('uploadRequest');
			visitAsUser(profilePath, jwtToken);
			openUploadPopup();
		});

		it('rejects a file that is not JPEG, PNG or WebP with the type message and sends no request', () => {
			fileInput().selectFile(
				{ contents: Cypress.Buffer.from('just some text'), fileName: 'notes.txt', mimeType: 'text/plain' },
				{ force: true },
			);

			pictureError().should('be.visible').and('have.text', TYPE_MESSAGE);
			cy.get('#add-image-post-form .preview-wrapper').should('not.be.visible');
			cy.get('@uploadRequest.all').should('have.length', 0);
		});

		it('rejects a GIF even though it is an image', () => {
			fileInput().selectFile({ contents: Cypress.Buffer.from('GIF89a'), fileName: 'animation.gif', mimeType: 'image/gif' }, { force: true });

			pictureError().should('have.text', TYPE_MESSAGE);
		});

		it('rejects a file over 10 MB with the size message and sends no request', () => {
			fileInput().selectFile(
				{ contents: Cypress.Buffer.alloc(MAX_IMAGE_BYTES + 1), fileName: 'huge.jpg', mimeType: 'image/jpeg' },
				{ force: true },
			);

			pictureError().should('be.visible').and('have.text', SIZE_MESSAGE);
			cy.get('@uploadRequest.all').should('have.length', 0);
		});

		it('sends nothing when Share is clicked after a rejected file, and asks for a picture', () => {
			fileInput().selectFile(
				{ contents: Cypress.Buffer.from('just some text'), fileName: 'notes.txt', mimeType: 'text/plain' },
				{ force: true },
			);
			submitButton().click();

			pictureError().should('have.text', 'Please choose a picture');
			cy.get('@uploadRequest.all').should('have.length', 0);
		});

		it('clears the message when a valid picture is chosen afterwards', () => {
			fileInput().selectFile(
				{ contents: Cypress.Buffer.from('just some text'), fileName: 'notes.txt', mimeType: 'text/plain' },
				{ force: true },
			);
			pictureError().should('be.visible');

			fileInput().selectFile(FIXTURE_IMAGE, { force: true });

			cy.get('#add-image-post-form .field-error').should('not.exist');
			cy.get('#add-image-post-form .preview-wrapper').should('be.visible');
		});

		it('only offers JPEG, PNG and WebP in the file picker', () => {
			fileInput().should('have.attr', 'accept', 'image/jpeg,image/png,image/webp');
		});
	});

	describe('when the server rejects the upload', () => {
		const chooseAndSubmit = () => {
			openUploadPopup();
			fileInput().selectFile(FIXTURE_IMAGE, { force: true });
			submitButton().click();
		};

		it('shows the size message under the picture for a 413 and keeps the popup open', () => {
			stubUpload(413, { code: 'IMAGE_TOO_LARGE', message: 'image: IMAGE_TOO_LARGE', fields: { image: 'IMAGE_TOO_LARGE' } });
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();
			cy.wait('@uploadRequest');

			pictureError().should('be.visible').and('have.text', SIZE_MESSAGE);
			cy.get('.popup-body').should('be.visible');
			cy.get('#add-image-post-form .form-error').should('not.exist');
			cy.get('.profile-post').should('have.length', 0);
		});

		it('shows the type message under the picture for a 400 IMAGE_TYPE_INVALID', () => {
			stubUpload(400, { code: 'IMAGE_TYPE_INVALID', message: 'image: IMAGE_TYPE_INVALID', fields: { image: 'IMAGE_TYPE_INVALID' } });
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();
			cy.wait('@uploadRequest');

			pictureError().should('have.text', TYPE_MESSAGE);
			cy.get('.popup-body').should('be.visible');
		});

		it('shows the fallback message and keeps the popup open for a 500', () => {
			stubUpload(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();
			cy.wait('@uploadRequest');

			cy.get('#add-image-post-form .form-error').should('be.visible').and('have.text', FALLBACK_MESSAGE);
			cy.get('.popup-body').should('be.visible');
			cy.get('.profile-post').should('have.length', 0);
			cy.get('.profile-stat').first().find('strong').should('have.text', '0');
			expectNoPostSaved();
		});

		it('shows the fallback message when the network fails', () => {
			cy.intercept('POST', '**/user-posts', { forceNetworkError: true }).as('uploadRequest');
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();

			cy.get('#add-image-post-form .form-error').should('have.text', FALLBACK_MESSAGE);
			cy.get('.popup-body').should('be.visible');
		});

		it('never shows the developer message from the server', () => {
			stubUpload(500, { code: 'INTERNAL_ERROR', message: 'Could not upload image cypress_secret_detail' });
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();
			cy.wait('@uploadRequest');

			cy.get('#add-image-post-form .form-error').should('have.text', FALLBACK_MESSAGE);
			cy.contains('cypress_secret_detail').should('not.exist');
		});

		it('lets the user submit again after a failure', () => {
			stubUpload(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();
			cy.wait('@uploadRequest');
			submitButton().should('not.be.disabled').click();

			cy.get('@uploadRequest.all').should('have.length', 2);
		});

		it('ends the session and sends the user to /log-in for UNAUTHENTICATED', () => {
			stubUpload(401, { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' });
			visitAsUser(profilePath, jwtToken);

			chooseAndSubmit();
			cy.wait('@uploadRequest');

			cy.location('pathname').should('eq', '/log-in');
		});
	});

	describe('while the request is in flight', () => {
		const stubSlowUpload = () =>
			cy
				.intercept('POST', '**/user-posts', (req) => {
					req.reply({ delay: 1500, statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
				})
				.as('uploadRequest');

		beforeEach(() => {
			stubSlowUpload();
			visitAsUser(profilePath, jwtToken);
			openUploadPopup();
			fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		});

		it('disables Share until the response arrives, then enables it again', () => {
			submitButton().should('not.be.disabled').click();

			submitButton().should('be.disabled');

			cy.wait('@uploadRequest');

			submitButton().should('not.be.disabled');
		});

		it('keeps Cancel usable while the request is in flight', () => {
			submitButton().click();

			cy.get('#add-image-post-form').contains('button', 'Cancel').should('not.be.disabled');
		});

		it('sends one request when Share is double-clicked', () => {
			submitButton().dblclick();

			cy.wait('@uploadRequest');

			cy.get('@uploadRequest.all').should('have.length', 1);
		});

		it('sends one request when the form is submitted twice in a row without the button', () => {
			cy.get('#add-image-post-form').then(($form) => {
				$form[0].requestSubmit();
				$form[0].requestSubmit();
			});

			cy.wait('@uploadRequest');

			cy.get('@uploadRequest.all').should('have.length', 1);
		});
	});

	describe('at narrow widths', () => {
		it('shows the picture error inside the popup at 300px without horizontal scrolling', () => {
			cy.viewport(300, 700);
			visitAsUser(profilePath, jwtToken);
			openUploadPopup();

			fileInput().selectFile(
				{ contents: Cypress.Buffer.from('just some text'), fileName: 'notes.txt', mimeType: 'text/plain' },
				{ force: true },
			);

			pictureError().should('be.visible');
			cy.document().then((doc) => {
				expect(doc.documentElement.scrollWidth).to.be.at.most(300);
			});
		});
	});
});
