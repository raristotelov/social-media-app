import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	uploadPostViaApi,
	followUserViaApi,
	getFollowingViaApi,
	getSuggestionsViaApi,
	userIdFromToken,
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
	const targets = Array.from({ length: 10 }, () => buildTestUser());
	const [firstTarget, secondTarget, thirdTarget, fourthTarget] = targets;
	const readerViewer = buildTestUser();
	const sidebarViewer = buildTestUser();
	const carouselViewer = buildTestUser();
	const dismissViewer = buildTestUser();
	const failingViewer = buildTestUser();
	const sidebarPostsViewer = buildTestUser();
	const carouselPostsViewer = buildTestUser();
	const viewers = [readerViewer, sidebarViewer, carouselViewer, dismissViewer, failingViewer, sidebarPostsViewer, carouselPostsViewer];

	const tokens = {};

	const createAccount = (user) => {
		createUserViaApi(user);
		loginViaApi(user).then((token) => {
			tokens[user.username] = token;
		});
	};

	const tokenOf = (user) => tokens[user.username];

	const idOf = (user) => userIdFromToken(tokenOf(user));

	const sidebarRow = (user) => cy.contains(`${SIDEBAR_SELECTOR} .suggested-user`, user.username);

	const carouselCard = (user) => cy.contains(`${CAROUSEL_SELECTOR} .suggestion-card`, user.username);

	before(() => {
		createAccount(author);
		targets.forEach(createAccount);
		viewers.forEach(createAccount);

		cy.then(() => uploadPostViaApi(tokenOf(author), 'post the suggestions sit beside'));
		cy.then(() => uploadPostViaApi(tokenOf(firstTarget), TARGET_POST_CAPTION));

		cy.then(() => {
			targets.forEach((target) => followUserViaApi(tokenOf(author), idOf(target)));
			viewers.forEach((viewer) => followUserViaApi(tokenOf(viewer), idOf(author)));
		});
	});

	after(() => {
		[author, ...targets, ...viewers].forEach((user) => cy.task('deleteTestUser', user.email));
	});

	describe('the desktop sidebar', () => {
		it('lists the two top mutual suggestions beside the feed, each with who follows them', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', tokenOf(readerViewer));

			cy.get(SIDEBAR_SELECTOR).should('be.visible');
			cy.contains(`${SIDEBAR_SELECTOR} h2`, 'Suggested for you').should('be.visible');

			sidebarRow(firstTarget).should('contain.text', `Followed by ${author.username}`);
			sidebarRow(secondTarget).should('contain.text', `Followed by ${author.username}`);
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).should('have.length', 5);
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).eq(0).should('contain.text', firstTarget.username);
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).eq(1).should('contain.text', secondTarget.username);
		});

		it('shows no carousel on desktop', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', tokenOf(readerViewer));

			cy.get(SIDEBAR_SELECTOR).should('be.visible');
			cy.get(CAROUSEL_SELECTOR).should('not.exist');
		});

		it('sits beside the posts, not above them', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', tokenOf(readerViewer));

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
			visitAsUser('/user-feed', tokenOf(readerViewer));

			sidebarRow(secondTarget).find('a').first().click();

			cy.location('pathname').should('eq', `/user/${idOf(secondTarget)}`);
		});

		it('removes a followed user and fills the gap with the next mutual suggestion', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', tokenOf(sidebarViewer));

			sidebarRow(firstTarget).find('button').click();

			cy.contains(SIDEBAR_SELECTOR, firstTarget.username).should('not.exist');
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).should('have.length', 5);
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`).eq(0).should('contain.text', secondTarget.username);
			cy.get(`${SIDEBAR_SELECTOR} .suggested-user`)
				.eq(1)
				.should('contain.text', `Followed by ${author.username}`)
				.and('not.contain.text', firstTarget.username);

			cy.then(() => getFollowingViaApi(idOf(sidebarViewer), tokenOf(sidebarViewer))).then((following) => {
				expect(following.map((user) => user.username)).to.include(firstTarget.username);
			});
		});

		it("does not add the followed user's post to the feed until the page is reloaded", () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', tokenOf(sidebarPostsViewer));

			cy.get('.user-post').should('have.length', 1);
			sidebarRow(firstTarget).find('button').click();

			cy.contains(SIDEBAR_SELECTOR, firstTarget.username).should('not.exist');
			cy.get('.user-post').should('have.length', 1);
			cy.contains('.user-post', TARGET_POST_CAPTION).should('not.exist');

			cy.reload();

			cy.contains('.user-post', TARGET_POST_CAPTION).should('be.visible');
		});

		it('keeps the followed user out of the sidebar after a reload', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', tokenOf(sidebarViewer));

			cy.get(SIDEBAR_SELECTOR).should('be.visible');
			cy.contains(SIDEBAR_SELECTOR, firstTarget.username).should('not.exist');
		});

		it('keeps the user in the list and shows the follow toast when the follow fails', () => {
			cy.viewport(1440, 900);
			cy.intercept('POST', '**/users/*/follow/*', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
				'failingFollow',
			);
			visitAsUser('/user-feed', tokenOf(failingViewer));

			sidebarRow(firstTarget).find('button').click();

			cy.wait('@failingFollow');
			cy.contains('.toast-region .toast-message', "Couldn't follow this user. Try again.").should('be.visible');
			sidebarRow(firstTarget).should('be.visible');
		});
	});

	describe('the carousel on tablet and mobile', () => {
		it('sits after the last post when there are fewer than 5, with the top mutual suggestions as cards', () => {
			cy.viewport(768, 1024);
			visitAsUser('/user-feed', tokenOf(readerViewer));

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
			visitAsUser('/user-feed', tokenOf(readerViewer));

			cy.get(CAROUSEL_SELECTOR).should('be.visible');
			cy.get(SIDEBAR_SELECTOR).should('not.exist');
		});

		it('shows Follow as a filled button on each card', () => {
			cy.viewport(390, 844);
			visitAsUser('/user-feed', tokenOf(readerViewer));

			carouselCard(firstTarget).find('button').should('have.text', 'Follow').and('not.have.class', 'button-secondary');
		});

		it('removes a followed card and fills the gap with the next mutual suggestion', () => {
			cy.viewport(390, 844);
			visitAsUser('/user-feed', tokenOf(carouselViewer));

			carouselCard(firstTarget).find('button').click();

			cy.contains(CAROUSEL_SELECTOR, firstTarget.username).should('not.exist');
			cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).should('have.length', 10);
			cy.get(`${CAROUSEL_SELECTOR} .suggestion-card`).eq(0).should('contain.text', secondTarget.username);
		});

		it("does not add the followed user's post to the feed until the page is reloaded", () => {
			cy.viewport(390, 844);
			visitAsUser('/user-feed', tokenOf(carouselPostsViewer));

			cy.get('.user-post').should('have.length', 1);
			carouselCard(firstTarget).find('button').click();

			cy.contains(CAROUSEL_SELECTOR, firstTarget.username).should('not.exist');
			cy.get('.user-post').should('have.length', 1);
			cy.contains('.user-post', TARGET_POST_CAPTION).should('not.exist');

			cy.reload();

			cy.contains('.user-post', TARGET_POST_CAPTION).should('be.visible');
		});

		it('puts the card back and shows the follow toast when the follow fails', () => {
			cy.viewport(390, 844);
			cy.intercept('POST', '**/users/*/follow/*', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
				'failingFollow',
			);
			visitAsUser('/user-feed', tokenOf(failingViewer));

			carouselCard(firstTarget).find('button').click();

			cy.wait('@failingFollow');
			cy.contains('.toast-region .toast-message', "Couldn't follow this user. Try again.").should('be.visible');
			carouselCard(firstTarget).should('be.visible');
		});

		it('is dismissed with the ✕, stays hidden after a reload and is remembered by the server', () => {
			cy.viewport(390, 844);
			cy.intercept({ method: 'GET', pathname: '/suggestions', query: { placement: 'carousel' } }).as('carouselRequest');
			visitAsUser('/user-feed', tokenOf(dismissViewer));

			cy.get(CAROUSEL_SELECTOR).should('be.visible');
			cy.get(`${CAROUSEL_SELECTOR} .suggestions-carousel-dismiss`).click();

			cy.get(CAROUSEL_SELECTOR).should('not.exist');

			cy.intercept({ method: 'GET', pathname: '/suggestions', query: { placement: 'carousel' } }).as('reloadedCarouselRequest');
			cy.reload();
			cy.wait('@reloadedCarouselRequest').its('response.body.isCarouselDismissed').should('eq', true);
			cy.get('.user-post').should('be.visible');
			cy.get(CAROUSEL_SELECTOR).should('not.exist');

			cy.then(() => getSuggestionsViaApi(tokenOf(dismissViewer), 'carousel')).then((result) => {
				expect(result.isCarouselDismissed).to.eq(true);
				expect(result.suggestions).to.have.length(0);
			});
		});

		it('stays dismissed at another viewport, while the desktop sidebar is unaffected', () => {
			cy.viewport(768, 1024);
			cy.intercept({ method: 'GET', pathname: '/suggestions', query: { placement: 'carousel' } }).as('carouselRequest');
			visitAsUser('/user-feed', tokenOf(dismissViewer));

			cy.wait('@carouselRequest');
			cy.get('.user-post').should('be.visible');
			cy.get(CAROUSEL_SELECTOR).should('not.exist');

			cy.viewport(1440, 900);
			visitAsUser('/user-feed', tokenOf(dismissViewer));

			cy.get(SIDEBAR_SELECTOR).should('be.visible');
		});
	});

	describe('layout', () => {
		WIDTHS.forEach(([width, height]) => {
			it(`has no horizontal scroll at ${width}px with the suggestions shown`, () => {
				cy.viewport(width, height);
				visitAsUser('/user-feed', tokenOf(readerViewer));

				cy.get(width >= 1280 ? SIDEBAR_SELECTOR : CAROUSEL_SELECTOR).should('be.visible');
				expectNoHorizontalScroll();
			});
		});

		it('keeps every control of the carousel reachable at 300px', () => {
			cy.viewport(300, 700);
			visitAsUser('/user-feed', tokenOf(readerViewer));

			cy.get(`${CAROUSEL_SELECTOR} .suggestions-carousel-dismiss`).should('be.visible');
			carouselCard(firstTarget).find('button').scrollIntoView().should('be.visible');
		});
	});
});
