import { AUTH_COOKIE_NAME, visitAsUser } from '../../support/api';

const GUEST_PAGE = '/popular-posts';
const GUEST_COPY = 'Explore the app without signing up';
const GUEST_COPY_MOBILE = 'Explore without signing up';
const NOTICE_LEAD = "You're using a demo account.";
const GUEST_DISMISSED_KEY = 'demo-strip-dismissed';
const NOTICE_DISMISSED_KEY = 'demo-notice-dismissed';
const RATE_LIMIT_MESSAGE = 'Too many demo accounts from this connection. Try again later.';
const FALLBACK_MESSAGE = "Couldn't start the demo. Try again.";

const readSession = (key) => cy.window().then((win) => win.sessionStorage.getItem(key));

const expectNoHorizontalScroll = () =>
	cy.window().then((win) => {
		expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth);
	});

describe('demo entry', () => {
	describe('the guest strip', () => {
		it('shows the invitation above the header on a guest page', () => {
			cy.visit(GUEST_PAGE);

			cy.contains('.demo-strip', GUEST_COPY).should('be.visible');
			cy.contains('.demo-strip button', 'Try the demo').should('be.visible');
			cy.get('.demo-strip-close').should('be.visible');

			cy.get('.demo-strip').then(($strip) => {
				cy.get('.header-wrapper').then(($header) => {
					expect($header[0].getBoundingClientRect().top).to.be.at.least($strip[0].getBoundingClientRect().bottom - 1);
				});
			});
		});

		it('hides for the rest of the tab session with the close button, and shows again in a fresh tab', () => {
			cy.visit(GUEST_PAGE);

			cy.get('.demo-strip-close').click();

			cy.get('.demo-strip').should('not.exist');
			readSession(GUEST_DISMISSED_KEY).should('eq', 'true');

			cy.reload();

			cy.get('.header-wrapper').should('be.visible');
			cy.get('.demo-strip').should('not.exist');

			cy.window().then((win) => win.sessionStorage.clear());
			cy.reload();

			cy.contains('.demo-strip', GUEST_COPY).should('be.visible');
		});

		it('stays hidden when the guest moves to another page of the same tab', () => {
			cy.visit(GUEST_PAGE);

			cy.get('.demo-strip-close').click();
			cy.visit('/log-in');

			cy.get('.demo-strip').should('not.exist');
		});

		it('shows the shorter invitation at 390', () => {
			cy.viewport(390, 844);
			cy.visit(GUEST_PAGE);

			cy.contains('.demo-strip', GUEST_COPY_MOBILE).should('be.visible');
			cy.contains('.demo-strip', GUEST_COPY).should('not.exist');
			cy.contains('.demo-strip button', 'Try the demo').should('be.visible');
			expectNoHorizontalScroll();
		});

		it('keeps the invitation text at 340 and hides it at 339, leaving the button and the close button', () => {
			cy.viewport(340, 700);
			cy.visit(GUEST_PAGE);

			cy.get('.demo-strip-message').should('be.visible');

			cy.viewport(339, 700);

			cy.get('.demo-strip-message').should('not.be.visible');
			cy.contains('.demo-strip button', 'Try the demo').should('be.visible');
			cy.get('.demo-strip-close').should('be.visible');
		});

		it('stays usable at 300 with no horizontal scroll', () => {
			cy.viewport(300, 700);
			cy.visit(GUEST_PAGE);

			cy.contains('.demo-strip button', 'Try the demo').should('be.visible');
			cy.get('.demo-strip-close').should('be.visible');
			expectNoHorizontalScroll();
		});
	});

	describe('when the demo cannot be started', () => {
		it('shows the connection limit message in a toast and leaves the guest where they were', () => {
			cy.intercept('POST', '**/users/demo-login', {
				statusCode: 429,
				body: { code: 'TOO_MANY_REQUESTS', message: 'Too many demo accounts requested' },
			}).as('demoLogin');

			cy.visit(GUEST_PAGE);
			cy.contains('.demo-strip button', 'Try the demo').click();
			cy.wait('@demoLogin');

			cy.contains('.toast-region .toast-message', RATE_LIMIT_MESSAGE).should('be.visible');
			cy.location('pathname').should('eq', GUEST_PAGE);
			cy.contains('.demo-strip button', 'Try the demo').should('be.enabled');
			cy.getCookie(AUTH_COOKIE_NAME).should('not.exist');
		});

		it('shows the fallback message in a toast when the server fails', () => {
			cy.intercept('POST', '**/users/demo-login', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
				'demoLogin',
			);

			cy.visit(GUEST_PAGE);
			cy.contains('.demo-strip button', 'Try the demo').click();
			cy.wait('@demoLogin');

			cy.contains('.toast-region .toast-message', FALLBACK_MESSAGE).should('be.visible');
			cy.location('pathname').should('eq', GUEST_PAGE);
		});

		it('shows the fallback message in a toast when the network fails', () => {
			cy.intercept('POST', '**/users/demo-login', { forceNetworkError: true }).as('demoLogin');

			cy.visit(GUEST_PAGE);
			cy.contains('.demo-strip button', 'Try the demo').click();

			cy.contains('.toast-region .toast-message', FALLBACK_MESSAGE).should('be.visible');
		});

		it('reads Starting... on a disabled button while the request runs, then offers the button again', () => {
			cy.intercept('POST', '**/users/demo-login', {
				delay: 1000,
				statusCode: 500,
				body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
			}).as('demoLogin');

			cy.visit(GUEST_PAGE);
			cy.contains('.demo-strip button', 'Try the demo').click();

			cy.contains('.demo-strip button', 'Starting...').should('be.disabled');

			cy.wait('@demoLogin');

			cy.contains('.demo-strip button', 'Try the demo').should('be.enabled');
		});
	});

	describe('entering the app as a demo visitor', () => {
		let visitorSession;
		let visitorId;
		let visitorUsername;

		after(() => {
			cy.then(() => {
				if (visitorId) {
					cy.task('deleteDemoVisitor', visitorId);
				}
			});
		});

		it('logs in from the strip without any form and lands on a feed with content', () => {
			cy.intercept('POST', '**/users/demo-login').as('demoLogin');

			cy.visit(GUEST_PAGE);
			cy.contains('.demo-strip button', 'Try the demo').click();

			cy.wait('@demoLogin').then(({ response }) => {
				expect(response.statusCode).to.eq(200);

				visitorId = response.body._id;
				visitorUsername = response.body.username;

				expect(response.body.accountType).to.eq('demo');
				expect(JSON.stringify(response.body)).not.to.match(/"(jwt|token)"/);
			});

			cy.getCookie(AUTH_COOKIE_NAME).then((cookie) => {
				expect(cookie.httpOnly).to.eq(true);

				visitorSession = { userId: visitorId, value: cookie.value };
			});

			cy.location('pathname').should('eq', '/user-feed');
			cy.get('.user-post').should('have.length.greaterThan', 0);
			cy.get('.tab-bar').within(() => {
				cy.contains('Feed').should('exist');
				cy.contains('Log in').should('not.exist');
			});
		});

		it('replaces the invitation with the demo account notice', () => {
			visitAsUser('/user-feed', visitorSession);

			cy.contains('.demo-strip', NOTICE_LEAD).should('be.visible');
			cy.contains('.demo-strip', 'It and everything you post will be deleted within 24 hours.').should('be.visible');
			cy.contains('.demo-strip button', 'Try the demo').should('not.exist');
			cy.get('.demo-strip-close').should('be.visible');
		});

		it('opens the own profile with the starter posts and the edit button', () => {
			visitAsUser(`/user/${visitorId}`, visitorSession);

			cy.contains('.profile-header .username', visitorUsername).should('be.visible');
			cy.contains('.profile-action button', 'Edit Profile').should('be.visible');
			cy.get('.profile-post').its('length').should('be.within', 2, 3);
		});

		it('hides the notice with the close button and keeps it hidden after a reload, while staying logged in', () => {
			visitAsUser('/user-feed', visitorSession);

			cy.get('.demo-strip-close').click();

			cy.get('.demo-strip').should('not.exist');
			readSession(NOTICE_DISMISSED_KEY).should('eq', 'true');

			cy.reload();

			cy.location('pathname').should('eq', '/user-feed');
			cy.get('.user-post').should('have.length.greaterThan', 0);
			cy.get('.demo-strip').should('not.exist');
		});

		it('shows the shorter notice at 390', () => {
			cy.viewport(390, 844);
			visitAsUser('/user-feed', visitorSession);

			cy.contains('.demo-strip', 'Demo account').should('be.visible');
			cy.contains('.demo-strip', '· deleted within 24 hours').should('be.visible');
			expectNoHorizontalScroll();
		});
	});
});
