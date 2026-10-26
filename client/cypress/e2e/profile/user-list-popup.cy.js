import { buildTestUser, TEST_USERNAME_PREFIX } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken, followUserViaApi } from '../../support/api';

describe('followers and following popup', () => {
	const owner = buildTestUser();
	const firstFollower = buildTestUser();
	const secondFollower = buildTestUser();

	let ownerToken;
	let firstFollowerToken;
	let secondFollowerToken;
	let ownerId;
	let firstFollowerId;
	let ownerPath;
	let firstFollowerPath;
	let secondFollowerPath;

	const statButton = (label) => cy.contains('.profile-stat-button', label);

	const popup = () => cy.get('.user-list-popup');

	const rows = () => cy.get('.user-list-popup .user-list-results .search-result');

	const dividerOf = ($row) => $row[0].ownerDocument.defaultView.getComputedStyle($row[0], '::before');

	before(() => {
		createUserViaApi(owner);
		createUserViaApi(firstFollower);
		createUserViaApi(secondFollower);

		loginViaApi(owner).then((token) => {
			ownerToken = token;
			ownerId = userIdFromToken(token);
			ownerPath = `/user/${ownerId}`;
		});

		loginViaApi(firstFollower).then((token) => {
			firstFollowerToken = token;
			firstFollowerId = userIdFromToken(token);
			firstFollowerPath = `/user/${firstFollowerId}`;
		});

		loginViaApi(secondFollower).then((token) => {
			secondFollowerToken = token;
			secondFollowerPath = `/user/${userIdFromToken(token)}`;
		});

		cy.then(() => followUserViaApi(firstFollowerToken, ownerId));
		cy.then(() => followUserViaApi(secondFollowerToken, ownerId));
		cy.then(() => followUserViaApi(ownerToken, firstFollowerId));
	});

	after(() => {
		cy.task('deleteTestUser', owner.email);
		cy.task('deleteTestUser', firstFollower.email);
		cy.task('deleteTestUser', secondFollower.email);
	});

	it('opens from the followers count and lists each follower by photo and username, without a follower count', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('followers').click();

		cy.contains('.user-list-popup .popup-title', 'Followers').should('be.visible');
		rows().should('have.length', 2);
		cy.contains('.user-list-results .search-result', firstFollower.username).should('be.visible');
		cy.contains('.user-list-results .search-result', secondFollower.username).should('be.visible');
		cy.get('.user-list-results .search-result-followers').should('not.exist');
	});

	it('lists the people they follow by photo and username, without a follower count', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('following').click();

		cy.contains('.user-list-popup .popup-title', 'Following').should('be.visible');
		cy.contains('.user-list-results .search-result', firstFollower.username).find('.search-result-avatar').should('be.visible');
		cy.get('.user-list-results .search-result-followers').should('not.exist');
	});

	it('shows an avatar on every row', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('followers').click();

		rows().each(($row) => {
			cy.wrap($row).find('.search-result-avatar').should('be.visible');
		});
	});

	it('opens from the following count and lists the users the profile follows', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('following').click();

		cy.contains('.user-list-popup .popup-title', 'Following').should('be.visible');
		rows().should('have.length', 1);
		rows().first().should('contain.text', firstFollower.username);
	});

	it('opens for a guest', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('followers').click();

		popup().should('be.visible');
		rows().should('have.length', 2);
	});

	it('opens that profile and closes the popup when a row is clicked', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('followers').click();
		cy.contains('.user-list-results .search-result', firstFollower.username).click();

		cy.location('pathname').should('eq', firstFollowerPath);
		cy.contains('.profile-header .username', firstFollower.username).should('be.visible');
		popup().should('not.exist');
	});

	it('closes with the close button and leaves the profile in place', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('followers').click();
		cy.get('.user-list-popup .popup-close').click();

		popup().should('not.exist');
		cy.location('pathname').should('eq', ownerPath);
	});

	it('lists the logged-in user first', () => {
		cy.viewport(1440, 900);
		visitAsUser(ownerPath, secondFollowerToken);

		statButton('followers').click();

		rows().should('have.length', 2);
		rows().first().should('contain.text', secondFollower.username);
	});

	it('does not make a zero count clickable', () => {
		cy.visit(secondFollowerPath);

		cy.contains('.profile-header .username', secondFollower.username).should('be.visible');
		cy.contains('.profile-stat', 'followers').should('not.have.class', 'profile-stat-button');
		cy.get('.profile-stat-button').should('have.length', 1).and('contain.text', 'following');
	});

	it('shows the retry state and recovers when the list fails to load', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);
		cy.contains('.profile-header .username', owner.username).should('be.visible');

		let shouldFail = true;

		cy.intercept({ method: 'GET', pathname: '/users/*/followers' }, (req) => {
			if (!shouldFail) {
				req.continue();

				return;
			}

			req.reply({ statusCode: 500, body: { code: 'INTERNAL_ERROR' } });
		}).as('userListRequest');
		statButton('followers').click();

		cy.wait('@userListRequest');
		cy.contains('.user-list-error', "Couldn't load this list").should('be.visible');
		rows().should('not.exist');

		cy.then(() => {
			shouldFail = false;
		});
		cy.contains('.user-list-error button', 'Try again').click();

		cy.wait('@userListRequest');
		rows().should('have.length', 2);
	});

	it('shows a 16px bold title on desktop', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('followers').click();

		cy.get('.user-list-popup .popup-title').should('have.css', 'font-size', '16px').and('have.css', 'font-weight', '700');
	});

	it('keeps the popup corners rounded at 12px with overflow hidden on desktop', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('followers').click();

		cy.get('.user-list-popup .popup-body')
			.should('have.css', 'overflow', 'hidden')
			.and('have.css', 'border-bottom-left-radius', '12px')
			.and('have.css', 'border-bottom-right-radius', '12px');
	});

	it('draws a divider before every row except the first', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		statButton('followers').click();

		rows().should('have.length', 2);
		rows()
			.first()
			.then(($row) => {
				expect(dividerOf($row).content).to.eq('none');
			});
		rows()
			.last()
			.then(($row) => {
				const divider = dividerOf($row);

				expect(divider.content).to.eq('""');
				expect(divider.height).to.eq('1px');
			});
	});

	it('does not draw dividers between search dropdown rows', () => {
		cy.viewport(1440, 900);
		cy.visit(ownerPath);

		cy.get('.search-input').type(TEST_USERNAME_PREFIX);

		cy.get('.search-results-dropdown .search-result').should('have.length.greaterThan', 1);
		cy.get('.search-results-dropdown .search-result').each(($row) => {
			expect(dividerOf($row).content).to.eq('none');
		});
	});

	[300, 390].forEach((width) => {
		it(`fills the screen at ${width}px without horizontal scrolling`, () => {
			cy.viewport(width, 700);
			cy.visit(ownerPath);

			statButton('followers').click();

			cy.get('.user-list-popup .popup-body').then(($body) => {
				const { width: bodyWidth, height: bodyHeight } = $body[0].getBoundingClientRect();

				expect(bodyWidth).to.eq(width);
				expect(bodyHeight).to.eq(700);
			});

			cy.document().then((doc) => {
				expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
			});

			rows().first().should('be.visible');
		});
	});
});
