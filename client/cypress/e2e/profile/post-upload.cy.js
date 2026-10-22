import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken, getProfileViaApi, deletePostViaApi } from '../../support/api';

const FIXTURE_IMAGE = 'cypress/fixtures/test-image.png';
const MAX_LONG_EDGE = 2048;

describe('post upload', () => {
	let user;
	let jwtToken;
	let userId;
	let profilePath;

	const openUploadPopup = () => {
		cy.get('.add-post-button').click();
		cy.contains('.create-popup [role="tab"][aria-selected="true"]', 'Post').should('be.visible');
	};

	const fileInput = () => cy.get('#add-image-post-form input[type="file"]');

	const submitForm = () => cy.get('#add-image-post-form').contains('button', 'Share').click();

	const buildSolidPng = (width, height) =>
		cy.window().then(
			(win) =>
				new Cypress.Promise((resolve) => {
					const canvas = win.document.createElement('canvas');

					canvas.width = width;
					canvas.height = height;

					const context = canvas.getContext('2d');

					context.fillStyle = '#3366cc';
					context.fillRect(0, 0, width, height);

					canvas.toBlob((blob) => {
						blob.arrayBuffer().then((buffer) => resolve(Cypress.Buffer.from(buffer)));
					}, 'image/png');
				}),
		);

	beforeEach(() => {
		user = buildTestUser();

		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			userId = userIdFromToken(token);
			profilePath = `/user/${userId}`;
		});

		cy.intercept('POST', '**/user-posts').as('uploadRequest');
	});

	afterEach(() => {
		cy.then(() => getProfileViaApi(userId)).then((profile) => {
			profile.posts.forEach((post) => deletePostViaApi(jwtToken, post._id));
		});

		cy.task('deleteTestUser', user.email);
	});

	it('uploads a photo through the server and shows it as a new post', () => {
		visitAsUser(profilePath, jwtToken);
		openUploadPopup();

		fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		cy.get('#add-image-post-form textarea.caption-input').type('Uploaded by Cypress');
		submitForm();

		cy.wait('@uploadRequest').then(({ request, response }) => {
			expect(request.headers['content-type']).to.include('multipart/form-data');
			expect(response.statusCode).to.equal(200);
		});

		cy.get('.popup-body').should('not.exist');
		cy.get('.profile-post').should('have.length', 1);
		cy.get('.profile-stat').first().find('strong').should('have.text', '1');

		cy.then(() => getProfileViaApi(userId)).then((profile) => {
			expect(profile.posts).to.have.length(1);
			expect(profile.posts[0].caption).to.equal('Uploaded by Cypress');
			expect(profile.posts[0].imageUrl).to.match(/^https:\/\/res\.cloudinary\.com\//);
		});
	});

	it('keeps the post after a refresh', () => {
		visitAsUser(profilePath, jwtToken);
		openUploadPopup();

		fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		submitForm();
		cy.wait('@uploadRequest').its('response.statusCode').should('eq', 200);
		cy.get('.profile-post').should('have.length', 1);

		cy.reload();

		cy.get('.profile-post').should('have.length', 1);
	});

	it('uploads an image wider than 2048px at 2048px on its long edge', () => {
		visitAsUser(profilePath, jwtToken);
		openUploadPopup();

		buildSolidPng(3000, 1000).then((contents) => {
			fileInput().selectFile({ contents, fileName: 'wide.png', mimeType: 'image/png' }, { force: true });
		});
		submitForm();

		cy.wait('@uploadRequest').its('response.statusCode').should('eq', 200);
		cy.get('.profile-post').should('have.length', 1);

		cy.get('.profile-post img').should(($image) => {
			expect($image[0].naturalWidth).to.equal(MAX_LONG_EDGE);
			expect($image[0].naturalHeight).to.equal(Math.round(1000 * (MAX_LONG_EDGE / 3000)));
		});
	});
});
