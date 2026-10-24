import { APP_NAME } from '../../../src/constants/app';
import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	uploadPostViaApi,
	followUserViaApi,
	getFollowingViaApi,
	userIdFromToken,
} from '../../support/api';

const LIST_SELECTOR = '.empty-feed-suggestions';
const ROW_SELECTOR = `${LIST_SELECTOR} .suggested-user`;
const POSTER_CAPTION = 'post of the newest user';
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

describe('follow suggestions on the empty feed', () => {
	const fillers = Array.from({ length: 8 }, () => buildTestUser());
	const poster = buildTestUser();
	const readerViewer = buildTestUser();
	const flowViewer = buildTestUser();
	const quietFollowViewer = buildTestUser();
	const failingViewer = buildTestUser();
	const viewers = [readerViewer, flowViewer, quietFollowViewer, failingViewer];

	const tokens = {};

	const createAccount = (user) => {
		createUserViaApi(user);
		loginViaApi(user).then((token) => {
			tokens[user.username] = token;
		});
	};

	const tokenOf = (user) => tokens[user.username];

	const idOf = (user) => userIdFromToken(tokenOf(user));

	const row = (user) => cy.contains(ROW_SELECTOR, user.username);

	const visitEmptyFeed = (viewer, width = 1440, height = 900) => {
		cy.viewport(width, height);
		visitAsUser('/user-feed', tokenOf(viewer));
	};

	before(() => {
		fillers.forEach(createAccount);
		createAccount(poster);
		viewers.forEach(createAccount);

		cy.then(() => uploadPostViaApi(tokenOf(poster), POSTER_CAPTION));
		cy.then(() => followUserViaApi(tokenOf(quietFollowViewer), idOf(fillers[0])));
	});

	after(() => {
		[...fillers, poster, ...viewers].forEach((user) => cy.task('deleteTestUser', user.email));
	});

	describe('for someone who follows nobody', () => {
		it('shows the message, the tray with only "Your story" and the list of 8', () => {
			visitEmptyFeed(readerViewer);

			cy.contains('.feed-empty h1', 'Your feed is empty').should('be.visible');
			cy.contains('.feed-empty', 'Follow people to see their posts here').should('be.visible');
			cy.get('.stories-tray .story-circle-label').should('have.length', 1).and('have.text', 'Your story');
			cy.get(ROW_SELECTOR).should('have.length', 8);
			cy.get('.user-post').should('not.exist');
		});

		it('shows the list under the message', () => {
			visitEmptyFeed(readerViewer);

			cy.get('.feed-empty-message').then(($message) => {
				cy.get(LIST_SELECTOR).then(($list) => {
					expect($list[0].getBoundingClientRect().top).to.be.at.least($message[0].getBoundingClientRect().bottom - 1);
				});
			});
		});

		it('gives each suggestion a filled Follow button and a reason line', () => {
			visitEmptyFeed(readerViewer);

			cy.get(ROW_SELECTOR).should('have.length', 8);
			cy.get(`${ROW_SELECTOR} .suggested-user-follow-button`).each(($button) => {
				expect($button.text()).to.eq('Follow');
				expect($button).not.to.have.class('button-secondary');
			});
			cy.get(`${ROW_SELECTOR} .suggested-user-reason`).each(($reason) => {
				expect($reason.text()).to.match(new RegExp(`^(Popular on|New to) ${APP_NAME}$`));
			});
		});

		it('lists the newest user with a post as "New to the app"', () => {
			visitEmptyFeed(readerViewer);

			row(poster).should('contain.text', `New to ${APP_NAME}`);
		});

		it('opens the profile from the photo or username', () => {
			visitEmptyFeed(readerViewer);

			row(poster).find('a').first().click();

			cy.location('pathname').should('eq', `/user/${idOf(poster)}`);
		});

		it('shows no sidebar and no carousel on desktop', () => {
			visitEmptyFeed(readerViewer, 1440, 900);

			cy.get(ROW_SELECTOR).should('have.length', 8);
			cy.get('.suggestions-sidebar').should('not.exist');
			cy.get('.suggestions-carousel').should('not.exist');
		});

		it('shows no sidebar and no carousel on mobile', () => {
			visitEmptyFeed(readerViewer, 390, 844);

			cy.get(ROW_SELECTOR).should('have.length', 8);
			cy.get('.suggestions-sidebar').should('not.exist');
			cy.get('.suggestions-carousel').should('not.exist');
		});
	});

	describe('for someone who follows only people who have not posted', () => {
		it('still shows the empty feed with the list, without the person already followed', () => {
			visitEmptyFeed(quietFollowViewer);

			cy.contains('.feed-empty h1', 'Your feed is empty').should('be.visible');
			cy.get(ROW_SELECTOR).should('have.length', 8);
			cy.contains(ROW_SELECTOR, fillers[0].username).should('not.exist');
		});
	});

	describe('following from the list', () => {
		it('turns Follow into Unfollow and shows their posts below the list, then undoes it, and the next visit is the normal feed', () => {
			visitEmptyFeed(flowViewer);

			row(poster).find('.suggested-user-follow-button').click();

			row(poster).find('.suggested-user-follow-button').should('have.text', 'Unfollow').and('have.class', 'button-secondary');
			cy.contains('.feed-posts .user-post', POSTER_CAPTION).should('be.visible');
			cy.get(ROW_SELECTOR).should('have.length', 8);
			cy.contains('.feed-empty h1', 'Your feed is empty').should('be.visible');

			cy.get(LIST_SELECTOR).then(($list) => {
				cy.get('.feed-posts').then(($posts) => {
					expect($posts[0].getBoundingClientRect().top).to.be.at.least($list[0].getBoundingClientRect().bottom - 1);
				});
			});
			cy.get('.suggestions-sidebar').should('not.exist');

			cy.then(() => getFollowingViaApi(idOf(flowViewer), tokenOf(flowViewer))).then((following) => {
				expect(following.map((user) => user.username)).to.include(poster.username);
			});

			row(poster).find('.suggested-user-follow-button').click();

			row(poster).find('.suggested-user-follow-button').should('have.text', 'Follow').and('not.have.class', 'button-secondary');
			cy.get('.user-post').should('not.exist');
			cy.contains('.feed-empty h1', 'Your feed is empty').should('be.visible');
			cy.get(ROW_SELECTOR).should('have.length', 8);

			cy.then(() => getFollowingViaApi(idOf(flowViewer), tokenOf(flowViewer))).then((following) => {
				expect(following.map((user) => user.username)).not.to.include(poster.username);
			});

			row(poster).find('.suggested-user-follow-button').click();
			cy.contains('.feed-posts .user-post', POSTER_CAPTION).should('be.visible');

			cy.reload();

			cy.contains('.user-post', POSTER_CAPTION).should('be.visible');
			cy.contains('h1', 'Your feed is empty').should('not.exist');
			cy.get(LIST_SELECTOR).should('not.exist');
		});

		it('goes back to Follow and shows the follow toast when the follow fails', () => {
			cy.intercept('POST', '**/users/*/follow/*', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
				'failingFollow',
			);
			visitEmptyFeed(failingViewer);

			row(poster).find('.suggested-user-follow-button').click();

			cy.wait('@failingFollow');
			cy.contains('.toast-region .toast-message', "Couldn't follow this user. Try again.").should('be.visible');
			row(poster).find('.suggested-user-follow-button').should('have.text', 'Follow').and('not.have.class', 'button-secondary');
			cy.get('.user-post').should('not.exist');
		});
	});

	describe('layout', () => {
		WIDTHS.forEach(([width, height]) => {
			it(`has no horizontal scroll at ${width}px`, () => {
				visitEmptyFeed(readerViewer, width, height);

				cy.get(ROW_SELECTOR).should('have.length', 8);
				expectNoHorizontalScroll();
			});
		});

		it('keeps every Follow button inside the screen at 300px', () => {
			visitEmptyFeed(readerViewer, 300, 700);

			cy.get(`${ROW_SELECTOR} .suggested-user-follow-button`).should('have.length', 8);
			cy.get(`${ROW_SELECTOR} .suggested-user-follow-button`).each(($button) => {
				const { left, right } = $button[0].getBoundingClientRect();

				expect(left, 'button left edge').to.be.at.least(0);
				expect(right, 'button right edge').to.be.at.most(300);
			});
		});
	});
});
