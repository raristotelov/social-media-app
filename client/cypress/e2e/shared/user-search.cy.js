import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromToken,
	followUserViaApi,
	searchUsersViaApi,
	uploadProfilePictureViaApi,
} from '../../support/api';

describe('user search', () => {
	const user = buildTestUser();
	const searchedUser = buildTestUser();

	let jwtToken;
	let ownProfilePath;
	let searchedUserId;
	let searchedProfilePath;
	let searchedPictureUrl;

	before(() => {
		createUserViaApi(user);

		createUserViaApi(searchedUser).then((response) => {
			searchedUserId = userIdFromToken(response.body);
			searchedProfilePath = `/user/${searchedUserId}`;
		});

		loginViaApi(searchedUser)
			.then((token) => uploadProfilePictureViaApi(token))
			.then((picture) => {
				searchedPictureUrl = picture.imageUrl;
			});

		loginViaApi(user).then((token) => {
			jwtToken = token;
			ownProfilePath = `/user/${userIdFromToken(token)}`;

			followUserViaApi(token, searchedUserId);
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
		cy.task('deleteTestUser', searchedUser.email);
	});

	it('shows matching users in the header dropdown and opens the one you pick', () => {
		cy.viewport(1440, 900);
		visitAsUser(ownProfilePath, jwtToken);

		cy.get('.search-input').type(searchedUser.username);

		cy.contains('.search-results-dropdown .search-result', searchedUser.username).should('be.visible').click();

		cy.location('pathname').should('eq', searchedProfilePath);
		cy.contains('.profile-header .username', searchedUser.username).should('be.visible');
	});

	it('shows the designed result row with the real follower count on desktop', () => {
		cy.viewport(1440, 900);
		visitAsUser(ownProfilePath, jwtToken);

		cy.get('.search-input').type(searchedUser.username);

		cy.contains('.search-results-dropdown .search-result', searchedUser.username).within(() => {
			cy.get('.search-result-username').should('have.text', searchedUser.username);
			cy.get('.search-result-followers').should('have.text', '1 follower');
		});
	});

	it('shows the designed result row with the real follower count on tablet', () => {
		cy.viewport(768, 1024);
		visitAsUser(ownProfilePath, jwtToken);

		cy.get('.search-input').type(searchedUser.username);

		cy.contains('.search-results-dropdown .search-result', searchedUser.username).within(() => {
			cy.get('.search-result-followers').should('have.text', '1 follower');
		});
	});

	it('shows the real follower count in the mobile result row', () => {
		cy.viewport(390, 844);
		visitAsUser('/user-feed', jwtToken);

		cy.get('.mobile-top-bar-action[aria-label="Search"]').click();
		cy.get('.mobile-search-field').type(searchedUser.username);

		cy.contains('.search-result', searchedUser.username).find('.search-result-followers').should('have.text', '1 follower');
	});

	it("shows the user's profile picture as the avatar in the desktop dropdown row", () => {
		cy.viewport(1440, 900);
		visitAsUser(ownProfilePath, jwtToken);

		cy.get('.search-input').type(searchedUser.username);

		cy.contains('.search-results-dropdown .search-result', searchedUser.username)
			.find('img.search-result-avatar')
			.should('be.visible')
			.and('have.attr', 'src', searchedPictureUrl);
	});

	it('shows the placeholder avatar for a user without a profile picture', () => {
		cy.viewport(1440, 900);
		visitAsUser(searchedProfilePath, jwtToken);

		cy.get('.search-input').type(user.username);

		cy.contains('.search-results-dropdown .search-result', user.username).within(() => {
			cy.get('svg.search-result-avatar').should('be.visible');
			cy.get('img.search-result-avatar').should('not.exist');
		});
	});

	it("shows the user's profile picture as the avatar in the mobile result row", () => {
		cy.viewport(390, 844);
		visitAsUser('/user-feed', jwtToken);

		cy.get('.mobile-top-bar-action[aria-label="Search"]').click();
		cy.get('.mobile-search-field').type(searchedUser.username);

		cy.contains('.search-result', searchedUser.username).find('img.search-result-avatar').should('have.attr', 'src', searchedPictureUrl);
	});

	it('returns slim rows with a follower count and no email from the search endpoint', () => {
		searchUsersViaApi(searchedUser.username).then((users) => {
			expect(users).to.have.length(1);
			expect(users[0]).to.have.property('username', searchedUser.username);
			expect(users[0]).to.have.property('followersCount', 1);
			expect(users[0].profilePicture).to.have.property('imageUrl', searchedPictureUrl);
			['email', 'followers', 'posts', 'bio'].forEach((field) => expect(users[0]).not.to.have.property(field));
		});
	});

	it('lets a guest search', () => {
		cy.viewport(1440, 900);
		cy.visit('/popular-posts');

		cy.get('.search-input').type(searchedUser.username);

		cy.contains('.search-results-dropdown .search-result', searchedUser.username).should('be.visible');
	});

	it('expands the field from the magnifier on mobile and opens a result', () => {
		cy.viewport(390, 844);
		visitAsUser('/user-feed', jwtToken);

		cy.get('.mobile-search-field').should('not.exist');

		cy.get('.mobile-top-bar-action[aria-label="Search"]').click();
		cy.get('.mobile-search-field').should('be.visible').type(searchedUser.username);

		cy.contains('.search-result-username', searchedUser.username).should('be.visible');
		cy.contains('.search-result', searchedUser.username).click();

		cy.location('pathname').should('eq', searchedProfilePath);
	});

	it('closes the mobile search when Cancel is clicked', () => {
		cy.viewport(390, 844);
		visitAsUser('/user-feed', jwtToken);

		cy.get('.mobile-top-bar-action[aria-label="Search"]').click();
		cy.get('.mobile-search-field').should('be.visible');

		cy.get('.mobile-search-cancel').click();

		cy.get('.mobile-search-field').should('not.exist');
	});
});
