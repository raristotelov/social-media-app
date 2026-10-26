import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken } from '../../support/api';

const NEW_PASSWORD = 'CypressNewPassword2';

describe('change password', () => {
	const user = buildTestUser();

	let jwtToken;
	let profilePath;

	before(() => {
		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			profilePath = `/user/${userIdFromToken(token)}`;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
	});

	const openChangePasswordOnDesktop = () => {
		cy.viewport(1440, 900);
		visitAsUser(profilePath, jwtToken);

		cy.get('.logged-user-avatar').click();
		cy.contains('.account-menu-row', 'Change password').click();

		cy.contains('.popup-title', 'Change Password').should('be.visible');
	};

	const fillForm = ({ current, next, confirm }) => {
		cy.get('input#currentPassword').type(current);
		cy.get('input#newPassword').type(next);
		cy.get('input#confirmPassword').type(confirm);
	};

	const save = () => cy.contains('.change-password-form button', 'Save').click();

	it('lists Change password between Dark mode and Log out in the account menu', () => {
		cy.viewport(1440, 900);
		visitAsUser(profilePath, jwtToken);

		cy.get('.logged-user-avatar').click();

		cy.get('.account-menu .account-menu-row').then((rows) => {
			expect([...rows].map((row) => row.textContent)).to.deep.equal(['Profile', 'Dark mode', 'Change password', 'Log out']);
		});
	});

	it('shows a wrong current password beside its input and keeps the form open', () => {
		openChangePasswordOnDesktop();

		fillForm({ current: 'DefinitelyNotThePassword1', next: NEW_PASSWORD, confirm: NEW_PASSWORD });
		save();

		cy.get('input#currentPassword').parent().contains('.field-error', 'Current password is incorrect').should('be.visible');
		cy.contains('.popup-title', 'Change Password').should('be.visible');
		cy.get('.toast').should('not.exist');
	});

	it('shows a mismatching confirmation as a form message without reaching the server', () => {
		cy.intercept('PATCH', '**/users/password', cy.spy().as('passwordRequest'));
		openChangePasswordOnDesktop();

		fillForm({ current: user.password, next: NEW_PASSWORD, confirm: `${NEW_PASSWORD}x` });
		save();

		cy.contains('.form-error', 'Passwords do not match').should('be.visible');
		cy.get('@passwordRequest').should('not.have.been.called');
	});

	it('closes without changing anything on Cancel', () => {
		openChangePasswordOnDesktop();

		cy.contains('.change-password-form button', 'Cancel').click();

		cy.get('.popup-container').should('not.exist');
	});

	it('changes the password: toast, still logged in, old password rejected, new password accepted', () => {
		openChangePasswordOnDesktop();

		fillForm({ current: user.password, next: NEW_PASSWORD, confirm: NEW_PASSWORD });
		save();

		cy.get('.popup-container').should('not.exist');
		cy.get('.toast').should('contain.text', 'Password changed');
		cy.get('.toast .toast-icon-success').should('be.visible');
		cy.get('.logged-user-avatar').should('be.visible');

		cy.get('.logged-user-avatar').click();
		cy.contains('.account-menu-row', 'Log out').click();
		cy.location('pathname').should('eq', '/log-in');

		cy.get('input#email').type(user.email);
		cy.get('input#password').type(user.password);
		cy.contains('button', 'Submit').click();

		cy.contains('.form-error', 'Wrong email or password').should('be.visible');
		cy.location('pathname').should('eq', '/log-in');

		cy.get('input#password').clear().type(NEW_PASSWORD);
		cy.contains('button', 'Submit').click();

		cy.location('pathname').should('eq', '/user-feed');
	});

	it('opens the same form from the bottom sheet on mobile', () => {
		cy.viewport(390, 844);
		visitAsUser(profilePath, jwtToken);

		cy.get('.mobile-top-bar-action[aria-label="Account menu"]').click();
		cy.contains('.account-menu-sheet .account-menu-row', 'Change password').click();

		cy.contains('.popup-title', 'Change Password').should('be.visible');
		cy.get('input#currentPassword').should('be.visible');
		cy.contains('.change-password-form button', 'Save').should('be.visible');

		cy.contains('.change-password-form button', 'Cancel').click();

		cy.get('.popup-container').should('not.exist');
	});
});
