import { buildTestUser } from '../../support/testUser';
import {
	AUTH_COOKIE_NAME,
	cookieHeader,
	createUserViaApi,
	getCurrentUserViaApi,
	loginViaApi,
	serverUrl,
	setSessionCookie,
	visitAsUser,
} from '../../support/api';

const PROTECTED_API_URL = `${serverUrl}/user-posts/followed-users-posts`;
const LOGOUT_FAILURE_MESSAGE = "Couldn't log you out. Try again.";
const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;

describe('session cookie', () => {
	const user = buildTestUser();

	let session;

	before(() => {
		createUserViaApi(user);

		loginViaApi(user).then((loggedInSession) => {
			session = loggedInSession;
		});
	});

	after(() => {
		cy.task('deleteTestUser', user.email);
	});

	const signIn = () => {
		cy.visit('/log-in');
		cy.get('input#email').type(user.email);
		cy.get('input#password').type(user.password);
		cy.contains('button', 'Submit').click();
	};

	const logOutFromTheAccountMenu = () => {
		cy.get('.logged-user-avatar').click();
		cy.contains('.account-menu-row', 'Log out').click();
	};

	const expectGuestTabBar = () => {
		cy.get('.logged-user-avatar').should('not.exist');
		cy.get('.tab-bar').within(() => {
			cy.contains('Log in').should('exist');
			cy.contains('Feed').should('not.exist');
		});
	};

	describe('after logging in', () => {
		it('holds the session in an httpOnly cookie that the page cannot read', () => {
			signIn();
			cy.location('pathname').should('eq', '/user-feed');

			cy.getCookie(AUTH_COOKIE_NAME).then((cookie) => {
				expect(cookie.httpOnly).to.eq(true);
				expect(cookie.sameSite).to.eq('lax');
				expect(cookie.value).to.match(JWT_SHAPE);
			});

			cy.document().its('cookie').should('not.contain', AUTH_COOKIE_NAME);
		});

		it('leaves no token in localStorage or sessionStorage', () => {
			signIn();
			cy.location('pathname').should('eq', '/user-feed');
			cy.get('.logged-user-avatar').should('be.visible');

			cy.window().then((win) => {
				[win.localStorage, win.sessionStorage].forEach((storage) => {
					Object.keys(storage).forEach((key) => {
						expect(key).not.to.match(/jwt|token/i);
						expect(storage.getItem(key)).not.to.match(JWT_SHAPE);
					});
				});
			});
		});

		it('answers the login with the user and sets the cookie, without a token in the body', () => {
			cy.request('POST', `${serverUrl}/users/login`, { email: user.email, password: user.password }).then((response) => {
				const [setCookie] = response.headers['set-cookie'];

				expect(response.body).to.have.property('username', user.username);
				expect(JSON.stringify(response.body)).not.to.match(/"(jwt|token)"/);
				expect(setCookie).to.contain(`${AUTH_COOKIE_NAME}=`);
				expect(setCookie).to.contain('HttpOnly');
				expect(setCookie).to.contain('SameSite=Lax');
				expect(setCookie).to.match(/Max-Age=\d+/);
			});
		});

		it('restores the session after a refresh by asking the server who is logged in', () => {
			signIn();
			cy.location('pathname').should('eq', '/user-feed');

			cy.intercept('GET', '**/users/me').as('restoreSession');
			cy.reload();

			cy.wait('@restoreSession').then(({ request, response }) => {
				expect(response.statusCode).to.eq(200);
				expect(response.body).to.have.property('username', user.username);
				expect(request.headers.cookie).to.contain(AUTH_COOKIE_NAME);
			});

			cy.location('pathname').should('eq', '/user-feed');
			cy.get('.logged-user-avatar').should('be.visible');
		});

		it('sends the session with every request and never in an X-Authorization header', () => {
			cy.intercept('GET', '**/user-posts/followed-users-posts').as('feedRequest');

			visitAsUser('/user-feed', session);

			cy.wait('@feedRequest').then(({ request }) => {
				expect(request.headers.cookie).to.contain(AUTH_COOKIE_NAME);
				expect(request.headers).not.to.have.property('x-authorization');
			});
		});
	});

	describe('logging out', () => {
		it('clears the cookie on the server, and the protected routes close at once', () => {
			cy.intercept('POST', '**/users/logout').as('logout');
			visitAsUser('/user-feed', session);

			logOutFromTheAccountMenu();

			cy.wait('@logout').then(({ response }) => {
				expect(response.statusCode).to.eq(204);
				expect(response.headers['set-cookie'].join(';')).to.match(new RegExp(`${AUTH_COOKIE_NAME}=;`));
			});

			cy.location('pathname').should('eq', '/log-in');
			cy.getCookie(AUTH_COOKIE_NAME).should('not.exist');
			expectGuestTabBar();

			cy.visit('/user-feed');
			cy.location('pathname').should('eq', '/log-in');

			cy.request({ url: PROTECTED_API_URL, failOnStatusCode: false }).its('status').should('eq', 401);
		});

		it('stays logged out after a refresh', () => {
			visitAsUser('/user-feed', session);

			logOutFromTheAccountMenu();
			cy.location('pathname').should('eq', '/log-in');

			cy.reload();

			cy.location('pathname').should('eq', '/log-in');
			expectGuestTabBar();
		});

		it('keeps the user logged in and shows a message when the logout request fails', () => {
			cy.intercept('POST', '**/users/logout', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
				'logout',
			);
			visitAsUser('/user-feed', session);

			logOutFromTheAccountMenu();
			cy.wait('@logout');

			cy.contains('.toast-region .toast-message', LOGOUT_FAILURE_MESSAGE).should('be.visible');
			cy.location('pathname').should('eq', '/user-feed');
			cy.get('.logged-user-avatar').should('be.visible');
			cy.getCookie(AUTH_COOKIE_NAME).should('exist');
		});
	});

	describe('a visitor with no session', () => {
		it('is answered with null, not an error, when the server is asked who is logged in', () => {
			getCurrentUserViaApi().then((response) => {
				expect(response.status).to.eq(200);
				expect(response.body).to.eq(null);
			});
		});

		it('is a clean guest on first load, with no error toast', () => {
			cy.intercept('GET', '**/users/me').as('restoreSession');
			cy.visit('/');

			cy.wait('@restoreSession').its('response.statusCode').should('eq', 200);
			cy.location('pathname').should('eq', '/popular-posts');
			expectGuestTabBar();
			cy.get('.toast').should('not.exist');
		});
	});

	describe('a cookie the server rejects', () => {
		it('is answered with 401 UNAUTHENTICATED when the cookie is invalid', () => {
			cy.request({ url: `${serverUrl}/users/me`, headers: cookieHeader('not.a.valid.token'), failOnStatusCode: false }).then((response) => {
				expect(response.status).to.eq(401);
				expect(response.body).to.have.property('code', 'UNAUTHENTICATED');
			});
		});

		it('leaves a clean guest state, not a half-logged-in one, when the cookie is invalid', () => {
			setSessionCookie('not.a.valid.token');
			cy.intercept('GET', '**/users/me').as('restoreSession');

			cy.visit('/');

			cy.wait('@restoreSession').its('response.statusCode').should('eq', 401);
			cy.location('pathname').should('eq', '/popular-posts');
			expectGuestTabBar();
			cy.get('.toast').should('not.exist');
		});

		it('removes an invalid cookie from the browser after one page load', () => {
			setSessionCookie('not.a.valid.token');
			cy.getCookie(AUTH_COOKIE_NAME).should('exist');
			cy.intercept('GET', '**/users/me').as('restoreSession');

			cy.visit('/');
			cy.wait('@restoreSession');

			cy.getCookie(AUTH_COOKIE_NAME).should('not.exist');
		});

		it('removes an expired cookie from the browser after one page load', () => {
			cy.task('signExpiredSessionToken', session.userId).then((expiredToken) => {
				setSessionCookie(expiredToken);
			});
			cy.getCookie(AUTH_COOKIE_NAME).should('exist');
			cy.intercept('GET', '**/users/me').as('restoreSession');

			cy.visit('/user-feed');
			cy.wait('@restoreSession');

			cy.getCookie(AUTH_COOKIE_NAME).should('not.exist');
		});

		it('does not set a cookie for a guest who never had one', () => {
			cy.intercept('GET', '**/users/me').as('restoreSession');

			cy.visit('/');

			cy.wait('@restoreSession').then(({ response }) => {
				expect(response.headers).not.to.have.property('set-cookie');
			});
			cy.getCookie(AUTH_COOKIE_NAME).should('not.exist');
		});

		it('leaves a clean guest state and closes the protected routes when the cookie has expired', () => {
			cy.task('signExpiredSessionToken', session.userId).then((expiredToken) => {
				cy.request({ url: `${serverUrl}/users/me`, headers: cookieHeader(expiredToken), failOnStatusCode: false })
					.its('status')
					.should('eq', 401);

				cy.request({ url: PROTECTED_API_URL, headers: cookieHeader(expiredToken), failOnStatusCode: false })
					.its('status')
					.should('eq', 401);

				setSessionCookie(expiredToken);
			});

			cy.visit('/user-feed');

			cy.location('pathname').should('eq', '/log-in');
			expectGuestTabBar();
			cy.get('.toast').should('not.exist');
		});

		it('lets the guest log in again after an expired cookie', () => {
			cy.task('signExpiredSessionToken', session.userId).then((expiredToken) => {
				setSessionCookie(expiredToken);
			});

			signIn();

			cy.location('pathname').should('eq', '/user-feed');
			cy.get('.logged-user-avatar').should('be.visible');
		});
	});
});
