import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser } from '../../support/api';

const STRIP = '.demo-strip';
const GRID_PATH = '/popular-posts';
const POSTS_PATH = '/popular-posts/posts';
const GUEST_DISMISSED_KEY = 'demo-strip-dismissed';
const NOTICE_DISMISSED_KEY = 'demo-notice-dismissed';
const PARTLY_SCROLLED = 20;
const PAST_THE_STRIP = 400;
const FAR_DOWN = 1000;

const VIEWPORTS = [
	{ name: 'desktop', width: 1440, height: 900, header: '.header-wrapper' },
	{ name: 'tablet', width: 768, height: 1024, header: '.header-wrapper' },
	{ name: 'mobile', width: 390, height: 844, header: '.mobile-top-bar-slot' },
	{ name: 'the narrowest mobile', width: 300, height: 700, header: '.mobile-top-bar-slot' },
];

const rectOf = (selector) => Cypress.$(selector)[0].getBoundingClientRect();

const scrollToY = (requestedY) => {
	cy.window().then((win) => {
		const maxY = win.document.documentElement.scrollHeight - win.innerHeight;
		const y = Math.min(requestedY, maxY);

		cy.scrollTo(0, y, { duration: 0 });
		cy.window().its('scrollY').should('be.closeTo', y, 1);
	});
};

const expectTop = (selector, expected) => {
	cy.get(selector).should(() => {
		expect(rectOf(selector).top).to.be.closeTo(expected, 1);
	});
};

const expectHeaderRightBelowStrip = (header) => {
	cy.get(header).should(() => {
		expect(rectOf(header).top).to.be.closeTo(Math.max(rectOf(STRIP).bottom, 0), 1);
	});
};

const expectStripScrolledAway = () => {
	cy.get(STRIP).should(() => {
		expect(rectOf(STRIP).bottom).to.be.at.most(0);
	});
};

const expectNothingCoversTheBar = (bar) => {
	cy.get(bar).should(($bar) => {
		const { left, width, top } = $bar[0].getBoundingClientRect();
		const hit = $bar[0].ownerDocument.elementFromPoint(left + width / 2, top + 2);

		expect($bar[0].contains(hit), 'the element at the top of the bar belongs to the bar').to.eq(true);
	});
};

const expectContentBelow = (content, bar) => {
	cy.get(content).should(() => {
		expect(rectOf(content).top).to.be.at.least(rectOf(bar).bottom - 1);
	});
};

const visitWithSessionFlags = (path, flags) =>
	cy.visit(path, {
		onBeforeLoad: (win) => {
			flags.forEach((flag) => win.sessionStorage.setItem(flag, 'true'));
		},
	});

const stubAsDemoVisitor = () => {
	cy.intercept({ method: 'GET', pathname: '/users', query: { userIds: '*' } }, (request) => {
		delete request.headers['if-none-match'];
		delete request.headers['if-modified-since'];

		request.continue((response) => {
			if (Array.isArray(response.body)) {
				response.body = response.body.map((user) => ({ ...user, accountType: 'demo' }));
				delete response.headers.etag;
				response.headers['cache-control'] = 'no-store';
			}
		});
	});
};

const checkTheStripScrollsAwayAndTheBarStays = (bar, content) => {
	cy.get(STRIP).should('be.visible');
	expectTop(STRIP, 0);
	expectHeaderRightBelowStrip(bar);
	expectNothingCoversTheBar(bar);
	expectContentBelow(content, bar);

	scrollToY(PARTLY_SCROLLED);
	expectHeaderRightBelowStrip(bar);

	scrollToY(PAST_THE_STRIP);
	expectStripScrolledAway();
	expectTop(bar, 0);
	expectNothingCoversTheBar(bar);

	scrollToY(FAR_DOWN);
	expectTop(bar, 0);
	expectNothingCoversTheBar(bar);

	scrollToY(0);
	expectHeaderRightBelowStrip(bar);
};

const checkTheBarSitsAtTheTopWithoutAStrip = (bar, content) => {
	cy.get(STRIP).should('not.exist');
	expectTop(bar, 0);
	expectNothingCoversTheBar(bar);
	expectContentBelow(content, bar);

	scrollToY(PAST_THE_STRIP);
	expectTop(bar, 0);
	expectNothingCoversTheBar(bar);

	scrollToY(FAR_DOWN);
	expectTop(bar, 0);

	scrollToY(0);
	expectTop(bar, 0);
};

describe('the strip and the sticky bars', () => {
	const user = buildTestUser();

	let userToken;

	before(() => {
		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			userToken = token;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
	});

	VIEWPORTS.forEach(({ name, width, height, header }) => {
		describe(`the header at ${name} width (${width}px)`, () => {
			beforeEach(() => {
				cy.viewport(width, height);
			});

			describe('for a guest', () => {
				it('sits right under the strip, then stays at the top once the strip scrolls away', () => {
					cy.visit(GRID_PATH);

					cy.get('.popular-posts-grid').should('be.visible');
					checkTheStripScrollsAwayAndTheBarStays(header, '.popular-posts-wrapper');
				});

				it('moves to the top at once when the strip is closed, with the content right below it', () => {
					cy.visit(GRID_PATH);
					cy.get('.popular-posts-grid').should('be.visible');

					cy.get('.demo-strip-close').click();

					checkTheBarSitsAtTheTopWithoutAStrip(header, '.popular-posts-wrapper');
				});

				it('stays at the top after the strip was closed and the page reloads', () => {
					cy.visit(GRID_PATH);
					cy.get('.demo-strip-close').click();
					cy.reload();

					cy.get('.popular-posts-grid').should('be.visible');
					checkTheBarSitsAtTheTopWithoutAStrip(header, '.popular-posts-wrapper');
				});

				it('is at the top from the start in a tab where the strip was closed earlier', () => {
					visitWithSessionFlags(GRID_PATH, [GUEST_DISMISSED_KEY]);

					cy.get('.popular-posts-grid').should('be.visible');
					checkTheBarSitsAtTheTopWithoutAStrip(header, '.popular-posts-wrapper');
				});

				it('goes back under the strip in a fresh tab', () => {
					visitWithSessionFlags(GRID_PATH, [GUEST_DISMISSED_KEY]);
					cy.get('.demo-strip').should('not.exist');

					cy.window().then((win) => win.sessionStorage.clear());
					cy.reload();

					cy.get('.popular-posts-grid').should('be.visible');
					checkTheStripScrollsAwayAndTheBarStays(header, '.popular-posts-wrapper');
				});
			});

			describe('for a signed-in user who is not a demo visitor', () => {
				it('is at the top from the start and stays there while scrolling', () => {
					visitAsUser(GRID_PATH, userToken);

					cy.get('.popular-posts-grid').should('be.visible');
					checkTheBarSitsAtTheTopWithoutAStrip(header, '.popular-posts-wrapper');
				});
			});

			describe('for a demo visitor', () => {
				beforeEach(() => {
					stubAsDemoVisitor();
				});

				it('sits right under the demo account notice, then stays at the top once the notice scrolls away', () => {
					visitAsUser(GRID_PATH, userToken);

					cy.contains(STRIP, /demo account/i).should('exist');
					cy.get('.popular-posts-grid').should('be.visible');
					checkTheStripScrollsAwayAndTheBarStays(header, '.popular-posts-wrapper');
				});

				it('moves to the top at once when the notice is closed', () => {
					visitAsUser(GRID_PATH, userToken);
					cy.contains(STRIP, /demo account/i).should('exist');

					cy.get('.demo-strip-close').click();

					cy.get('.popular-posts-grid').should('be.visible');
					checkTheBarSitsAtTheTopWithoutAStrip(header, '.popular-posts-wrapper');
				});

				it('stays at the top after the notice was closed and the page reloads', () => {
					visitAsUser(GRID_PATH, userToken);
					cy.get('.demo-strip-close').click();
					cy.reload();

					cy.get('.popular-posts-grid').should('be.visible');
					checkTheBarSitsAtTheTopWithoutAStrip(header, '.popular-posts-wrapper');
				});

				it('is at the top from the start in a tab where the notice was closed earlier', () => {
					cy.visit(GRID_PATH, {
						onBeforeLoad: (win) => {
							win.localStorage.setItem('jwt-token', JSON.stringify(userToken));
							win.sessionStorage.setItem(NOTICE_DISMISSED_KEY, 'true');
						},
					});

					cy.get('.popular-posts-grid').should('be.visible');
					checkTheBarSitsAtTheTopWithoutAStrip(header, '.popular-posts-wrapper');
				});
			});
		});
	});

	[390, 300].forEach((width) => {
		describe(`the Posts bar at ${width}px`, () => {
			beforeEach(() => {
				cy.viewport(width, 800);
			});

			it('sits right under the strip, then stays at the top once the strip scrolls away', () => {
				cy.visit(POSTS_PATH);

				cy.get('.posts-bar').should('be.visible');
				cy.get('.profile-posts-list .user-post').should('have.length.greaterThan', 0);
				checkTheStripScrollsAwayAndTheBarStays('.posts-bar', '.profile-posts-list');
			});

			it('moves to the top at once when the strip is closed', () => {
				cy.visit(POSTS_PATH);
				cy.get('.posts-bar').should('be.visible');

				cy.get('.demo-strip-close').click();

				cy.get('.profile-posts-list .user-post').should('have.length.greaterThan', 0);
				checkTheBarSitsAtTheTopWithoutAStrip('.posts-bar', '.profile-posts-list');
			});

			it('is at the top from the start for a signed-in user', () => {
				visitAsUser(POSTS_PATH, userToken);

				cy.get('.posts-bar').should('be.visible');
				cy.get('.profile-posts-list .user-post').should('have.length.greaterThan', 0);
				checkTheBarSitsAtTheTopWithoutAStrip('.posts-bar', '.profile-posts-list');
			});
		});
	});

	describe('the pages that fill the screen below the header', () => {
		const expectNoVerticalOverflowFromTheSpinnerHeight = () => {
			cy.document().then((doc) => {
				expect(doc.documentElement.scrollHeight).to.be.at.most(doc.documentElement.clientHeight + 1);
			});
		};

		[
			['the log-in page', '/log-in'],
			['the sign-up page', '/sign-up'],
		].forEach(([pageName, path]) => {
			VIEWPORTS.forEach(({ name, width, height }) => {
				it(`${pageName} does not scroll at ${name} width without a strip`, () => {
					cy.viewport(width, height);
					visitWithSessionFlags(path, [GUEST_DISMISSED_KEY]);

					cy.get('form').should('be.visible');
					expectNoVerticalOverflowFromTheSpinnerHeight();
				});
			});
		});
	});
});
