import { buildTestUser } from '../../support/testUser';
import { serverUrl, createUserViaApi, loginViaApi, visitAsUser, userIdFromToken, setProfilePictureViaApi, getProfileViaApi } from '../../support/api';

describe('profile picture removal', () => {
	let user;
	let jwtToken;
	let userId;
	let profilePath;
	let picture;

	const openEditProfile = () => {
		cy.contains('.profile-action button', 'Edit Profile').click();
		cy.get('.popup-body').should('be.visible');
	};

	const removeButton = () => cy.get('#edit-user-profile-form .image-remove-button');

	const submitForm = () => cy.get('#edit-user-profile-form').contains('button', 'Submit').click();

	beforeEach(() => {
		user = buildTestUser();

		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			userId = userIdFromToken(token);
			profilePath = `/user/${userId}`;
		});

		cy.then(() => setProfilePictureViaApi(jwtToken)).then((result) => {
			picture = result.user.profilePicture;
		});

		cy.intercept('PATCH', '**/users/update/**').as('updateRequest');
	});

	afterEach(() => {
		cy.task('deleteTestUser', user.email);
	});

	it('shows the current picture with a remove button in the form', () => {
		visitAsUser(profilePath, jwtToken);

		cy.get('.profile-picture-wrapper img').should('have.attr', 'src', picture.imageUrl);

		openEditProfile();

		cy.get('#edit-user-profile-form .preview-wrapper img').should('be.visible').and('have.attr', 'src', picture.imageUrl);
		removeButton().should('be.visible');
	});

	it('opens the file picker when the picture is clicked', () => {
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		cy.get('#edit-user-profile-form input[type="file"]').then(($input) => {
			cy.spy($input[0], 'click').as('pickerClick');
		});

		cy.get('#edit-user-profile-form .preview-wrapper img').click();

		cy.get('@pickerClick').should('have.been.calledOnce');
	});

	it('shows the empty input after clicking the remove button and saves nothing yet', () => {
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		removeButton().click();

		cy.get('#edit-user-profile-form .preview-wrapper').should('not.be.visible');
		cy.get('#edit-user-profile-form .image-input-wrapper').should('be.visible');
		cy.get('@updateRequest.all').should('have.length', 0);
		cy.get('.profile-picture-wrapper img').should('have.attr', 'src', picture.imageUrl);
	});

	it('keeps the picture when Cancel is clicked after removing it', () => {
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		removeButton().click();
		cy.get('#edit-user-profile-form').contains('button', 'Cancel').click();

		cy.get('.popup-body').should('not.exist');
		cy.get('@updateRequest.all').should('have.length', 0);
		cy.get('.profile-picture-wrapper img').should('have.attr', 'src', picture.imageUrl);

		openEditProfile();

		cy.get('#edit-user-profile-form .preview-wrapper img').should('be.visible').and('have.attr', 'src', picture.imageUrl);
	});

	it('removes the picture on Save, shows the placeholder avatar, and keeps it removed after a refresh', () => {
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		removeButton().click();
		submitForm();

		cy.wait('@updateRequest').its('response.statusCode').should('eq', 200);
		cy.get('.popup-body').should('not.exist');

		cy.get('.profile-picture-wrapper img').should('not.exist');
		cy.get('.profile-picture-wrapper svg.profile-picture').should('be.visible');

		cy.reload();

		cy.get('.profile-picture-wrapper img').should('not.exist');
		cy.get('.profile-picture-wrapper svg.profile-picture').should('be.visible');

		cy.then(() => getProfileViaApi(userId)).then((profile) => {
			expect(profile.profilePicture ?? null).to.equal(null);
		});
	});

	it('shows the empty input in the form when it is reopened after removal', () => {
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		removeButton().click();
		submitForm();
		cy.wait('@updateRequest');
		cy.get('.popup-body').should('not.exist');

		openEditProfile();

		cy.get('#edit-user-profile-form .image-input-wrapper').should('be.visible');
		cy.get('#edit-user-profile-form .preview-wrapper').should('not.be.visible');
	});

	it('removes the picture together with other changed fields in one save', () => {
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		cy.get('textarea#bio').type('Bio saved with the removal.');
		removeButton().click();
		submitForm();

		cy.wait('@updateRequest').its('request.body').should('deep.equal', { bio: 'Bio saved with the removal.', profilePicture: null });

		cy.contains('.profile-header .bio', 'Bio saved with the removal.').should('be.visible');
		cy.get('.profile-picture-wrapper img').should('not.exist');
	});

	it('sends profilePicture: null and nothing else when only the picture was removed', () => {
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		removeButton().click();
		submitForm();

		cy.wait('@updateRequest').its('request.body').should('deep.equal', { profilePicture: null });
	});

	it('works as a full-screen view on mobile', () => {
		cy.viewport(390, 844);
		visitAsUser(profilePath, jwtToken);
		openEditProfile();

		removeButton().click();
		submitForm();

		cy.wait('@updateRequest').its('response.statusCode').should('eq', 200);
		cy.get('.profile-picture-wrapper img').should('not.exist');
	});

	describe('after the picture was removed', () => {
		beforeEach(() => {
			visitAsUser(profilePath, jwtToken);
			openEditProfile();

			removeButton().click();
			submitForm();
			cy.wait('@updateRequest');
			cy.get('.popup-body').should('not.exist');
		});

		it('closes without sending anything when the untouched form is saved', () => {
			openEditProfile();
			submitForm();

			cy.get('.popup-body').should('not.exist');
			cy.get('@updateRequest.all').should('have.length', 1);
		});
	});

	describe('server', () => {
		const removePictureViaApi = () =>
			cy.request({
				method: 'PATCH',
				url: `${serverUrl}/users/update/${userId}`,
				headers: { 'X-Authorization': jwtToken },
				body: { profilePicture: null },
			});

		it('removes the picture when profilePicture: null is sent', () => {
			removePictureViaApi().its('status').should('eq', 200);

			cy.then(() => getProfileViaApi(userId)).then((profile) => {
				expect(profile.profilePicture ?? null).to.equal(null);
			});
		});

		it('still succeeds when the picture was already removed', () => {
			removePictureViaApi();

			removePictureViaApi().its('status').should('eq', 200);
		});
	});
});
