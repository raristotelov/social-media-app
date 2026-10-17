import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken, getProfileViaApi } from '../../support/api';

const FIXTURE_IMAGE = 'cypress/fixtures/test-image.png';

describe('profile picture upload', () => {
	let user;
	let jwtToken;
	let userId;
	let profilePath;

	const openEditProfile = () => {
		cy.contains('.profile-action button', 'Edit Profile').click();
		cy.contains('.popup-title', 'Edit Profile').should('be.visible');
	};

	const fileInput = () => cy.get('#edit-user-profile-form input[type="file"]');

	const submitForm = () => cy.get('#edit-user-profile-form').contains('button', 'Save').click();

	beforeEach(() => {
		user = buildTestUser();

		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			userId = userIdFromToken(token);
			profilePath = `/user/${userId}`;
		});

		cy.intercept('PATCH', '**/users/update/**').as('updateRequest');
	});

	afterEach(() => {
		cy.task('deleteTestUser', user.email);
	});

	it('uploads a picture through the server and shows it on the profile', () => {
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		submitForm();

		cy.wait('@updateRequest').then(({ request, response }) => {
			expect(request.headers['content-type']).to.include('multipart/form-data');
			expect(response.statusCode).to.equal(200);
		});

		cy.get('.popup-body').should('not.exist');
		cy.get('.profile-picture-wrapper img')
			.should('be.visible')
			.and('have.attr', 'src')
			.and('match', /^https:\/\/res\.cloudinary\.com\//);

		cy.then(() => getProfileViaApi(userId)).then((profile) => {
			expect(profile.profilePicture.imageUrl).to.match(/^https:\/\/res\.cloudinary\.com\//);
		});
	});

	it('keeps the picture after a refresh', () => {
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		submitForm();
		cy.wait('@updateRequest').its('response.statusCode').should('eq', 200);
		cy.get('.profile-picture-wrapper img').should('be.visible');

		cy.reload();

		cy.get('.profile-picture-wrapper img')
			.should('be.visible')
			.and('have.attr', 'src')
			.and('match', /^https:\/\/res\.cloudinary\.com\//);
	});
});
