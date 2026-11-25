import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	uploadPostViaApi,
	followUserViaApi,
	getFollowingViaApi,
	getSuggestionsViaApi,
	dismissSuggestionsCarouselViaApi,
	userIdFromSession,
} from '../../support/api';

const SIDEBAR_SELECTOR = '.suggestions-sidebar';
const CAROUSEL_SELECTOR = '.suggestions-carousel';
const TARGET_POST_CAPTION = 'post of the suggested user';
const WIDTHS = [
	[1440, 900],
	[768, 1024],
	[390, 844],
	[300, 700],
];

const expectNoHorizontalScroll = () => {
	cy.document().then((doc) => {
		expect(doc.documentElement.scrollWidth, 'document scroll width').to.be.at.most(doc.documentElement.clientWidth);
	});
};

describe('follow suggestions on the feed', () => {
	const author = buildTestUser();
	const coAuthor = buildTestUser();
	const targets = Array.from({ length: 10 }, () => buildTestUser());
	const [firstTarget, secondTarget, thirdTarget, fourthTarget, fifthTarget, sixthTarget, seventhTarget] = targets;
	const readerViewer = buildTestUser();
	const sidebarViewer = buildTestUser();
	const reloadViewer = buildTestUser();
	const carouselViewer = buildTestUser();
	const dismissViewer = buildTestUser();
	const dismissedViewer = buildTestUser();
	const failingViewer = buildTestUser();
	const sidebarPostsViewer = buildTestUser();
	const carouselPostsViewer = buildTestUser();
	const sidebarFollowFlowViewer = buildTestUser();
	const carouselFollowFlowViewer = buildTestUser();
	const sidebarFailingUnfollowViewer = buildTestUser();
	const carouselFailingUnfollowViewer = buildTestUser();
	const colourViewer = buildTestUser();
	const carouselReloadViewer = buildTestUser();
	const carouselNarrowViewer = buildTestUser();
	const viewers = [
		readerViewer,
		sidebarViewer,
		reloadViewer,
		carouselViewer,
		dismissViewer,
		dismissedViewer,
		failingViewer,
		sidebarPostsViewer,
		carouselPostsViewer,
		sidebarFollowFlowViewer,
		carouselFollowFlowViewer,
		sidebarFailingUnfollowViewer,
		carouselFailingUnfollowViewer,
		colourViewer,
		carouselReloadViewer,
		carouselNarrowViewer,
	];

	const sessions = {};

	const createAccount = (user) => {
		createUserViaApi(user);
		loginViaApi(user).then((session) => {
			sessions[user.username] = session;
		});
	};

	const sessionOf = (user) => sessions[user.username];

	const idOf = (user) => userIdFromSession(sessionOf(user));

	const sidebarRow = (user) => cy.contains(`${SIDEBAR_SELECTOR} .suggested-user`, user.username);

	const carouselCard = (user) => cy.contains(`${CAROUSEL_SELECTOR} .suggestion-card`, user.username);

	const FOLLOW_URL = '**/users/*/follow/*';
	const UNFOLLOW_URL = '**/users/*/unfollow/*';
	const SERVER_ERROR_RESPONSE = { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } };
	const FOLLOW_TOAST = "Couldn't follow this user. Try again.";
	const UNFOLLOW_TOAST = "Couldn't unfollow this user. Try again.";

	const expectFollowing = (viewer, target, isFollowing) =>
		cy
			.then(() => getFollowingViaApi(idOf(viewer), sessionOf(viewer)))
			.then((following) => {
				const usernames = following.map((user) => user.username);

				if (isFollowing) {
					expect(usernames).to.include(target.username);
				} else {
					expect(usernames).not.to.include(target.username);
				}
			});

	const listedUsernames = (usernameSelector) => cy.get(usernameSelector).then(($names) => [...$names].map((name) => name.textContent));

	const SIDEBAR_USERNAMES = `${SIDEBAR_SELECTOR} .suggested-user-username`;
	const CAROUSEL_USERNAMES = `${CAROUSEL_SELECTOR} .suggestion-card-username`;
	const LIGHT_TEXT_PRIMARY = 'rgb(75, 75, 75)';
	const DARK_TEXT_PRIMARY = 'rgb(240, 240, 240)';
	const BRAND_RED = 'rgb(246, 77, 77)';

	before(() => {
		createAccount(author);
		createAccount(coAuthor);
		targets.forEach(createAccount);
		viewers.forEach(createAccount);

		cy.then(() => uploadPostViaApi(sessionOf(author), 'post the suggestions sit beside'));
		cy.then(() => uploadPostViaApi(sessionOf(firstTarget), TARGET_POST_CAPTION));

		cy.then(() => {
			targets.forEach((target) => followUserViaApi(sessionOf(author), idOf(target)));
			viewers.forEach((viewer) => followUserViaApi(sessionOf(viewer), idOf(author)));
			viewers.forEach((viewer) => followUserViaApi(sessionOf(viewer), idOf(coAuthor)));
			followUserViaApi(sessionOf(coAuthor), idOf(author));
			followUserViaApi(sessionOf(coAuthor), idOf(firstTarget));
			followUserViaApi(sessionOf(fifthTarget), idOf(secondTarget));
			followUserViaApi(sessionOf(sixthTarget), idOf(secondTarget));
			followUserViaApi(sessionOf(seventhTarget), idOf(secondTarget));
			followUserViaApi(sessionOf(fifthTarget), idOf(thirdTarget));
			followUserViaApi(sessionOf(sixthTarget), idOf(thirdTarget));
			followUserViaApi(sessionOf(fifthTarget), idOf(fourthTarget));
		});
	});

	after(() => {
		[author, coAuthor, ...targets, ...viewers].forEach((user) => cy.task('deleteTestUser', user.email));
	});

	describe('the desktop sidebar', () => {
		it('lists the two top mutual suggestions beside the feed, each with who follows them', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', sessionOf(readerViewer));

			cy.get(SIDEBAR_SELECTOR).should('be.visible');
			cy.contains(`${SIDEBAR_SELECTOR} h2`, 'Suggested for you').should('be.visible');

			sidebarRow(firstTarget).should('contain.text', `Followed by ${author.username}`);
			sidebarRow(secondTarget).should('contain.text', `Followed by ${author.username}`);
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).should('have.length', 5);
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).eq(0).should('contain.text', firstTarget.username);
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).eq(1).should('contain.text', secondTarget.username);
		});

		it('is served by an API response that holds only the suggestions and the dismissal flag', () => {
			cy.viewport(1440, 900);
			cy.intercept({ method: 'GET', pathname: '/suggestions', query: { placement: 'sidebar' } }, (request) => {
				delete request.headers['if-none-match'];
			}).as('sidebarRequest');
			visitAsUser('/user-feed', sessionOf(readerViewer));

			cy.wait('@sidebarRequest').then(({ response }) => {
				expect(response.statusCode).to.eq(200);
				expect(Object.keys(response.body).sort()).to.deep.eq(['isCarouselDismissed', 'suggestions']);
				expect(response.body.suggestions).to.have.length(5);
			});
		});

		it('shows no carousel on desktop', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', sessionOf(readerViewer));

			cy.get(SIDEBAR_SELECTOR).should('be.visible');
			cy.get(CAROUSEL_SELECTOR).should('not.exist');
		});

		it('sits beside the posts, not above them', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', sessionOf(readerViewer));

			cy.get('.user-post').should('be.visible');
			cy.get(SIDEBAR_SELECTOR).then(($sidebar) => {
				cy.get('.user-post')
					.first()
					.then(($post) => {
						expect($sidebar[0].getBoundingClientRect().left).to.be.at.least($post[0].getBoundingClientRect().right - 1);
					});
			});
		});

		it('opens the profile from the username', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', sessionOf(readerViewer));

			sidebarRow(secondTarget).find('a').first().click();

			cy.location('pathname').should('eq', `/user/${idOf(secondTarget)}`);
		});

		it('keeps a followed user in place with the same rows, switching Follow to Unfollow', () => {
			cy.viewport(1440, 900);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			visitAsUser('/user-feed', sessionOf(sidebarViewer));

			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).should('have.length', 5);
			listedUsernames(SIDEBAR_USERNAMES).then((usernamesBefore) => {
				expect(usernamesBefore[0]).to.eq(firstTarget.username);

				sidebarRow(firstTarget).find('button').should('have.text', 'Follow').click();

				cy.wait('@follow');
				cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).eq(0).should('contain.text', firstTarget.username);
				cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).eq(0).find('button').should('have.text', 'Unfollow');
				cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).should('have.length', 5);
				listedUsernames(SIDEBAR_USERNAMES).should('deep.equal', usernamesBefore);
			});

			expectFollowing(sidebarViewer, firstTarget, true);
		});

		it('turns Unfollow back into Follow, keeps the row in place and persists the unfollow', () => {
			cy.viewport(1440, 900);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			cy.intercept('POST', UNFOLLOW_URL).as('unfollow');
			visitAsUser('/user-feed', sessionOf(sidebarFollowFlowViewer));

			sidebarRow(secondTarget).find('button').click();
			cy.wait('@follow');
			sidebarRow(secondTarget).find('button').should('have.text', 'Unfollow').click();

			cy.wait('@unfollow');
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).eq(1).should('contain.text', secondTarget.username);
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).eq(1).find('button').should('have.text', 'Follow');
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).should('have.length', 5);

			expectFollowing(sidebarFollowFlowViewer, secondTarget, false);
		});

		it("does not add the followed user's post to the feed until the page is reloaded", () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', sessionOf(sidebarPostsViewer));

			cy.get('.user-post').should('have.length', 1);
			sidebarRow(firstTarget).find('button').click();

			sidebarRow(firstTarget).find('button').should('have.text', 'Unfollow');
			cy.get('.user-post').should('have.length', 1);
			cy.contains('.user-post', TARGET_POST_CAPTION).should('not.exist');

			cy.reload();

			cy.contains('.user-post', TARGET_POST_CAPTION).should('be.visible');
		});

		it('drops the followed user from the sidebar after a reload, with the other suggestions still shown', () => {
			cy.viewport(1440, 900);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			visitAsUser('/user-feed', sessionOf(reloadViewer));

			sidebarRow(firstTarget).find('button').click();
			cy.wait('@follow');
			sidebarRow(firstTarget).find('button').should('have.text', 'Unfollow');

			cy.reload();

			cy.get(SIDEBAR_SELECTOR).should('be.visible');
			cy.contains(SIDEBAR_SELECTOR, firstTarget.username).should('not.exist');
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).should('have.length', 5);
		});

		it('goes back to Follow and shows the follow toast when the follow fails', () => {
			cy.viewport(1440, 900);
			cy.intercept('POST', FOLLOW_URL, SERVER_ERROR_RESPONSE).as('failingFollow');
			visitAsUser('/user-feed', sessionOf(failingViewer));

			sidebarRow(firstTarget).find('button').click();

			cy.wait('@failingFollow');
			cy.contains('.toast-region .toast-message', FOLLOW_TOAST).should('be.visible');
			sidebarRow(firstTarget).should('be.visible');
			sidebarRow(firstTarget).find('button').should('have.text', 'Follow');

			expectFollowing(failingViewer, firstTarget, false);
		});

		it('goes back to Unfollow and shows the unfollow toast when the unfollow fails', () => {
			cy.viewport(1440, 900);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			visitAsUser('/user-feed', sessionOf(sidebarFailingUnfollowViewer));

			sidebarRow(firstTarget).find('button').click();
			cy.wait('@follow');
			sidebarRow(firstTarget).find('button').should('have.text', 'Unfollow');

			cy.intercept('POST', UNFOLLOW_URL, SERVER_ERROR_RESPONSE).as('failingUnfollow');
			sidebarRow(firstTarget).find('button').click();

			cy.wait('@failingUnfollow');
			cy.contains('.toast-region .toast-message', UNFOLLOW_TOAST).should('be.visible');
			sidebarRow(firstTarget).find('button').should('have.text', 'Unfollow');

			expectFollowing(sidebarFailingUnfollowViewer, firstTarget, true);
		});

		it('colours Unfollow as text/primary in light and dark, and Follow red', () => {
			cy.viewport(1440, 900);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			visitAsUser('/user-feed', sessionOf(colourViewer));

			sidebarRow(firstTarget).find('button').should('have.text', 'Follow').and('have.css', 'color', BRAND_RED);

			sidebarRow(firstTarget).find('button').click();
			cy.wait('@follow');

			cy.get('html').should('have.attr', 'data-theme', 'light');
			sidebarRow(firstTarget).find('button').should('have.text', 'Unfollow').and('have.css', 'color', LIGHT_TEXT_PRIMARY);

			cy.get('html').invoke('attr', 'data-theme', 'dark');
			sidebarRow(firstTarget).find('button').should('have.css', 'color', DARK_TEXT_PRIMARY);
			sidebarRow(secondTarget).find('button').should('have.text', 'Follow').and('have.css', 'color', BRAND_RED);
		});
	});

	describe('the carousel on tablet and mobile', () => {
		it('sits after the last post when there are fewer than 5, with the top mutual suggestions as cards', () => {
			cy.viewport(768, 1024);
			visitAsUser('/user-feed', sessionOf(readerViewer));

			cy.get(CAROUSEL_SELECTOR).should('be.visible');
			cy.contains(`${CAROUSEL_SELECTOR} h2`, 'Suggested for you').should('be.visible');
			cy.get('.feed-posts').children().last().should('have.class', 'suggestions-carousel');

			[firstTarget, secondTarget, thirdTarget, fourthTarget].forEach((target) => {
				carouselCard(target).should('contain.text', `Followed by ${author.username}`);
			});
			cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).should('have.length', 10);
			[firstTarget, secondTarget, thirdTarget, fourthTarget].forEach((target, index) => {
				cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).eq(index).should('contain.text', target.username);
			});
		});

		it('shows no sidebar on tablet', () => {
			cy.viewport(768, 1024);
			visitAsUser('/user-feed', sessionOf(readerViewer));

			cy.get(CAROUSEL_SELECTOR).should('be.visible');
			cy.get(SIDEBAR_SELECTOR).should('not.exist');
		});

		it('shows Follow as a filled button on each card', () => {
			cy.viewport(390, 844);
			visitAsUser('/user-feed', sessionOf(readerViewer));

			carouselCard(firstTarget).find('button').should('have.text', 'Follow').and('not.have.class', 'button-secondary');
		});

		it('keeps a followed card in place with the same cards, switching to a secondary Unfollow button', () => {
			cy.viewport(390, 844);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			visitAsUser('/user-feed', sessionOf(carouselViewer));

			cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).should('have.length', 10);
			listedUsernames(CAROUSEL_USERNAMES).then((usernamesBefore) => {
				expect(usernamesBefore[0]).to.eq(firstTarget.username);

				carouselCard(firstTarget).find('button').should('have.text', 'Follow').click();

				cy.wait('@follow');
				cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).eq(0).should('contain.text', firstTarget.username);
				cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`)
					.eq(0)
					.find('button')
					.should('have.text', 'Unfollow')
					.and('have.class', 'button-secondary');
				cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).should('have.length', 10);
				listedUsernames(CAROUSEL_USERNAMES).should('deep.equal', usernamesBefore);
			});

			carouselCard(secondTarget).find('button').should('have.text', 'Follow').and('not.have.class', 'button-secondary');
			expectFollowing(carouselViewer, firstTarget, true);
		});

		it('turns Unfollow back into a filled Follow, keeps the card in place and persists the unfollow', () => {
			cy.viewport(390, 844);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			cy.intercept('POST', UNFOLLOW_URL).as('unfollow');
			visitAsUser('/user-feed', sessionOf(carouselFollowFlowViewer));

			carouselCard(secondTarget).find('button').click();
			cy.wait('@follow');
			carouselCard(secondTarget).find('button').should('have.text', 'Unfollow').click();

			cy.wait('@unfollow');
			cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).eq(1).should('contain.text', secondTarget.username);
			cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`)
				.eq(1)
				.find('button')
				.should('have.text', 'Follow')
				.and('not.have.class', 'button-secondary');
			cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).should('have.length', 10);

			expectFollowing(carouselFollowFlowViewer, secondTarget, false);
		});

		it("does not add the followed user's post to the feed until the page is reloaded", () => {
			cy.viewport(390, 844);
			visitAsUser('/user-feed', sessionOf(carouselPostsViewer));

			cy.get('.user-post').should('have.length', 1);
			carouselCard(firstTarget).find('button').click();

			carouselCard(firstTarget).find('button').should('have.text', 'Unfollow');
			cy.get('.user-post').should('have.length', 1);
			cy.contains('.user-post', TARGET_POST_CAPTION).should('not.exist');

			cy.reload();

			cy.contains('.user-post', TARGET_POST_CAPTION).should('be.visible');
		});

		it('drops the followed card from the carousel after a reload, with the other suggestions still shown', () => {
			cy.viewport(390, 844);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			visitAsUser('/user-feed', sessionOf(carouselReloadViewer));

			carouselCard(firstTarget).find('button').click();
			cy.wait('@follow');
			carouselCard(firstTarget).find('button').should('have.text', 'Unfollow');

			cy.reload();

			cy.get(CAROUSEL_SELECTOR).should('be.visible');
			cy.contains(CAROUSEL_SELECTOR, firstTarget.username).should('not.exist');
			cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).should('have.length.at.least', 9);
		});

		it('goes back to Follow and shows the follow toast when the follow fails', () => {
			cy.viewport(390, 844);
			cy.intercept('POST', FOLLOW_URL, SERVER_ERROR_RESPONSE).as('failingFollow');
			visitAsUser('/user-feed', sessionOf(failingViewer));

			carouselCard(firstTarget).find('button').click();

			cy.wait('@failingFollow');
			cy.contains('.toast-region .toast-message', FOLLOW_TOAST).should('be.visible');
			carouselCard(firstTarget).should('be.visible');
			carouselCard(firstTarget).find('button').should('have.text', 'Follow').and('not.have.class', 'button-secondary');

			expectFollowing(failingViewer, firstTarget, false);
		});

		it('goes back to Unfollow and shows the unfollow toast when the unfollow fails', () => {
			cy.viewport(390, 844);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			visitAsUser('/user-feed', sessionOf(carouselFailingUnfollowViewer));

			carouselCard(firstTarget).find('button').click();
			cy.wait('@follow');
			carouselCard(firstTarget).find('button').should('have.text', 'Unfollow');

			cy.intercept('POST', UNFOLLOW_URL, SERVER_ERROR_RESPONSE).as('failingUnfollow');
			carouselCard(firstTarget).find('button').click();

			cy.wait('@failingUnfollow');
			cy.contains('.toast-region .toast-message', UNFOLLOW_TOAST).should('be.visible');
			carouselCard(firstTarget).find('button').should('have.text', 'Unfollow').and('have.class', 'button-secondary');

			expectFollowing(carouselFailingUnfollowViewer, firstTarget, true);
		});

		it('is dismissed with the ✕, stays hidden after a reload and is remembered by the server', () => {
			cy.viewport(390, 844);
			cy.intercept({ method: 'GET', pathname: '/suggestions', query: { placement: 'carousel' } }).as('carouselRequest');
			visitAsUser('/user-feed', sessionOf(dismissViewer));

			cy.get(CAROUSEL_SELECTOR).should('be.visible');
			cy.get(`${CAROUSEL_SELECTOR} .suggestions-carousel-dismiss`).click();

			cy.get(CAROUSEL_SELECTOR).should('not.exist');

			cy.intercept({ method: 'GET', pathname: '/suggestions', query: { placement: 'carousel' } }).as('reloadedCarouselRequest');
			cy.reload();
			cy.wait('@reloadedCarouselRequest').its('response.body.isCarouselDismissed').should('eq', true);
			cy.get('.user-post').should('be.visible');
			cy.get(CAROUSEL_SELECTOR).should('not.exist');

			cy.then(() => getSuggestionsViaApi(sessionOf(dismissViewer), 'carousel')).then((result) => {
				expect(result.isCarouselDismissed).to.eq(true);
				expect(result.suggestions).to.have.length(0);
			});
		});

		it('stays dismissed at another viewport, while the desktop sidebar is unaffected', () => {
			cy.then(() => dismissSuggestionsCarouselViaApi(sessionOf(dismissedViewer)));
			cy.viewport(768, 1024);
			cy.intercept({ method: 'GET', pathname: '/suggestions', query: { placement: 'carousel' } }).as('carouselRequest');
			visitAsUser('/user-feed', sessionOf(dismissedViewer));

			cy.wait('@carouselRequest');
			cy.get('.user-post').should('be.visible');
			cy.get(CAROUSEL_SELECTOR).should('not.exist');

			cy.viewport(1440, 900);
			visitAsUser('/user-feed', sessionOf(dismissedViewer));

			cy.get(SIDEBAR_SELECTOR).should('be.visible');
		});
	});

	describe('layout', () => {
		WIDTHS.forEach(([width, height]) => {
			it(`has no horizontal scroll at ${width}px with the suggestions shown`, () => {
				cy.viewport(width, height);
				visitAsUser('/user-feed', sessionOf(readerViewer));

				cy.get(width >= 1280 ? SIDEBAR_SELECTOR : CAROUSEL_SELECTOR).should('be.visible');
				expectNoHorizontalScroll();
			});
		});

		it('keeps every control of the carousel reachable at 300px', () => {
			cy.viewport(300, 700);
			visitAsUser('/user-feed', sessionOf(readerViewer));

			cy.get(`${CAROUSEL_SELECTOR} .suggestions-carousel-dismiss`).should('be.visible');
			carouselCard(firstTarget).find('button').scrollIntoView().should('be.visible');
		});

		it('has no horizontal scroll at 300px with Unfollow shown, and the button stays inside its card', () => {
			cy.viewport(300, 700);
			cy.intercept('POST', FOLLOW_URL).as('follow');
			visitAsUser('/user-feed', sessionOf(carouselNarrowViewer));

			carouselCard(firstTarget).find('button').click();
			cy.wait('@follow');

			carouselCard(firstTarget).find('button').should('have.text', 'Unfollow').and('be.visible');
			expectNoHorizontalScroll();
			carouselCard(firstTarget).then(($card) => {
				const cardRect = $card[0].getBoundingClientRect();
				const buttonRect = $card.find('button')[0].getBoundingClientRect();

				expect(buttonRect.left, 'button left edge').to.be.at.least(cardRect.left);
				expect(buttonRect.right, 'button right edge').to.be.at.most(cardRect.right);
			});
		});
	});
});
