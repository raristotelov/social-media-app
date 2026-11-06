import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromSession,
	uploadPostViaApi,
	deletePostViaApi,
	followUserViaApi,
	unfollowUserViaApi,
	likePostViaApi,
	unlikePostViaApi,
	addCommentViaApi,
} from '../../support/api';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_POPUP_WIDTH = 480;

const notificationsPopup = () => cy.get('.notifications-popup');

const notificationRows = () => cy.get('.notifications-popup .notification-row');

const closeNotifications = () => cy.get('.notifications-popup .popup-close').click();

const openAccountMenuOnDesktop = () => cy.get('.logged-user-avatar').click();

const accountMenuNotificationsRow = () => cy.contains('.account-menu button', 'Notifications');

describe('notifications', () => {
	const owner = buildTestUser();
	const actor = buildTestUser();
	const postCaption = 'a post that gets notifications';
	const commentText = 'great post';

	let ownerSession;
	let actorSession;
	let ownerId;
	let actorId;
	let post;

	const visitFeedAsOwner = () => visitAsUser('/user-feed', ownerSession);

	const visitFeedAsOwnerOnceTheCountLoaded = () => {
		cy.intercept({ method: 'GET', pathname: '/notifications/unread-count' }).as('unreadCount');

		visitFeedAsOwner();

		cy.wait('@unreadCount');
	};

	const openNotificationsAsOwner = () => {
		visitFeedAsOwner();
		openAccountMenuOnDesktop();
		accountMenuNotificationsRow().click();
		notificationsPopup().should('be.visible');
	};

	before(() => {
		createUserViaApi(owner);
		createUserViaApi(actor);

		loginViaApi(owner).then((session) => {
			ownerSession = session;
			ownerId = userIdFromSession(session);
		});

		loginViaApi(actor).then((session) => {
			actorSession = session;
			actorId = userIdFromSession(session);
		});

		cy.then(() => uploadPostViaApi(ownerSession, postCaption)).then((uploadedPost) => {
			post = uploadedPost;
		});

		cy.then(() => followUserViaApi(actorSession, ownerId));
		cy.then(() => likePostViaApi(actorSession, post._id));
		cy.then(() => addCommentViaApi(actorSession, post._id, commentText));
	});

	after(() => {
		cy.then(() => deletePostViaApi(ownerSession, post._id, false));
		cy.task('deleteTestUser', owner.email);
		cy.task('deleteTestUser', actor.email);
	});

	describe('on desktop', () => {
		it('shows the red dot on the avatar and the unread count under Profile in the account menu', () => {
			visitFeedAsOwner();

			cy.get('.logged-user-avatar .unread-dot').should('be.visible');

			openAccountMenuOnDesktop();

			cy.get('.account-menu .account-menu-row').eq(0).should('contain.text', 'Profile');
			cy.get('.account-menu .account-menu-row').eq(1).should('contain.text', 'Notifications');
			accountMenuNotificationsRow().find('.account-menu-badge').should('have.text', '3');
		});

		it('lists the follow, the like and the comment newest first, and clears the dot and the badge on opening', () => {
			openNotificationsAsOwner();

			notificationsPopup().contains('.popup-title', 'Notifications').should('be.visible');
			notificationRows().should('have.length', 3);
			notificationRows().eq(0).should('contain.text', actor.username).and('contain.text', `commented: ${commentText}`);
			notificationRows().eq(1).should('contain.text', actor.username).and('contain.text', 'liked your post.');
			notificationRows().eq(2).should('contain.text', actor.username).and('contain.text', 'started following you.');

			notificationRows().eq(0).find('.notification-row-thumbnail').should('have.attr', 'src').and('not.be.empty');
			notificationRows().eq(1).find('.notification-row-thumbnail').should('have.attr', 'src').and('not.be.empty');
			notificationRows().eq(2).find('.notification-row-thumbnail').should('not.exist');

			notificationRows().each(($row) => {
				cy.wrap($row).should('have.class', 'notification-row-unread');
			});

			cy.get('.logged-user-avatar .unread-dot').should('not.exist');
			notificationsPopup().find('.popup-body').invoke('outerWidth').should('eq', DESKTOP_POPUP_WIDTH);

			closeNotifications();
			notificationsPopup().should('not.exist');

			openAccountMenuOnDesktop();
			accountMenuNotificationsRow().find('.account-menu-badge').should('not.exist');
		});

		it('stays free of the dot after a reload, and shows the rows as read the next time it opens', () => {
			visitFeedAsOwnerOnceTheCountLoaded();

			cy.get('.logged-user-avatar').should('be.visible');
			cy.get('.logged-user-avatar .unread-dot').should('not.exist');

			openAccountMenuOnDesktop();
			accountMenuNotificationsRow().find('.account-menu-badge').should('not.exist');
			accountMenuNotificationsRow().click();

			notificationRows().should('have.length', 3);
			cy.get('.notification-row-unread').should('not.exist');
		});

		it('opens the profile of the follower and closes the list when a follow row is clicked', () => {
			openNotificationsAsOwner();

			notificationRows().eq(2).click('right');

			cy.location('pathname').should('eq', `/user/${actorId}`);
			cy.contains('.profile-header .username', actor.username).should('be.visible');
			notificationsPopup().should('not.exist');
		});

		it('opens the profile, not the post, when the name on a row is clicked', () => {
			openNotificationsAsOwner();

			notificationRows().eq(1).find('.notification-row-username').click();

			cy.location('pathname').should('eq', `/user/${actorId}`);
			notificationsPopup().should('not.exist');
		});

		it('opens the posts view at the post when a like row is clicked, without opening the comments', () => {
			openNotificationsAsOwner();

			notificationRows().eq(1).click('right');

			cy.location('pathname').should('eq', `/user/${ownerId}/posts`);
			cy.location('hash').should('eq', `#${post._id}`);
			cy.contains('.user-post', postCaption).should('be.visible');
			notificationsPopup().should('not.exist');
			cy.get('.comments-popup').should('not.exist');
		});

		it('opens the post with its comments when a comment row is clicked', () => {
			openNotificationsAsOwner();

			notificationRows().eq(0).click('right');

			cy.location('pathname').should('eq', `/user/${ownerId}/posts`);
			cy.location('hash').should('eq', `#${post._id}`);
			cy.get('.comments-popup').should('be.visible');
			cy.contains('.comments-popup .comment', commentText).should('be.visible');
			notificationsPopup().should('not.exist');
		});

		it('closes with Escape', () => {
			openNotificationsAsOwner();

			cy.get('body').type('{esc}');

			notificationsPopup().should('not.exist');
		});

		it('shows the empty state to an account nobody has interacted with', () => {
			visitAsUser('/user-feed', actorSession);
			openAccountMenuOnDesktop();
			accountMenuNotificationsRow().click();

			notificationsPopup().contains('No notifications yet').should('be.visible');
			notificationsPopup().contains("When people follow you, like or comment on your posts, you'll see it here.").should('be.visible');
			cy.get('.logged-user-avatar .unread-dot').should('not.exist');
		});

		it('removes the follow and the like notifications when they are undone, and keeps the comment', () => {
			cy.then(() => unfollowUserViaApi(actorSession, ownerId));
			cy.then(() => unlikePostViaApi(actorSession, post._id));

			openNotificationsAsOwner();

			notificationRows().should('have.length', 1);
			notificationRows().eq(0).should('contain.text', `commented: ${commentText}`);
			notificationsPopup().should('not.contain.text', 'started following you.');
			notificationsPopup().should('not.contain.text', 'liked your post.');
		});

		it('raises the dot for a new notification and drops it when that action is undone before it was read', () => {
			cy.then(() => followUserViaApi(actorSession, ownerId));

			visitFeedAsOwner();
			cy.get('.logged-user-avatar .unread-dot').should('be.visible');
			openAccountMenuOnDesktop();
			accountMenuNotificationsRow().find('.account-menu-badge').should('have.text', '1');

			cy.then(() => unfollowUserViaApi(actorSession, ownerId));

			visitFeedAsOwnerOnceTheCountLoaded();
			cy.get('.logged-user-avatar').should('be.visible');
			cy.get('.logged-user-avatar .unread-dot').should('not.exist');
		});

		it('keeps one notification per person when the action is repeated', () => {
			cy.then(() => likePostViaApi(actorSession, post._id));
			cy.then(() => likePostViaApi(actorSession, post._id));

			openNotificationsAsOwner();

			notificationRows().filter(':contains("liked your post.")').should('have.length', 1);
		});

		it('does not notify the owner of their own like', () => {
			cy.then(() => likePostViaApi(ownerSession, post._id));

			openNotificationsAsOwner();

			notificationRows().filter(`:contains("${owner.username} liked")`).should('have.length', 0);
		});
	});

	describe('when the list fails to load', () => {
		let shouldFail;

		beforeEach(() => {
			shouldFail = true;

			cy.intercept({ method: 'GET', pathname: '/notifications' }, (request) => {
				if (shouldFail) {
					request.reply({ statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
				}
			}).as('getNotifications');
		});

		it('shows the inline "Couldn\'t load this list" error and loads the list on Try again', () => {
			openNotificationsAsOwner();

			notificationsPopup().find('[role="alert"]').should('contain.text', "Couldn't load this list");

			cy.then(() => {
				shouldFail = false;
			});

			notificationsPopup().contains('button', 'Try again').click();

			notificationRows().should('have.length.at.least', 1);
			notificationsPopup().find('[role="alert"]').should('not.exist');
		});
	});
});

describe('notifications on mobile', () => {
	const owner = buildTestUser();
	const follower = buildTestUser();

	let ownerSession;
	let followerSession;
	let ownerId;
	let followerId;

	const openAccountMenuOnMobile = () => cy.get('.mobile-top-bar-action[aria-label="Account menu"]').click();

	before(() => {
		createUserViaApi(owner);
		createUserViaApi(follower);

		loginViaApi(owner).then((session) => {
			ownerSession = session;
			ownerId = userIdFromSession(session);
		});

		loginViaApi(follower).then((session) => {
			followerSession = session;
			followerId = userIdFromSession(session);
		});

		cy.then(() => followUserViaApi(followerSession, ownerId));
	});

	after(() => {
		cy.task('deleteTestUser', owner.email);
		cy.task('deleteTestUser', follower.email);
	});

	beforeEach(() => {
		cy.viewport(MOBILE_VIEWPORT.width, MOBILE_VIEWPORT.height);
	});

	it('shows the dot on the profile photo in the tab bar, and none on the feed top bar', () => {
		visitAsUser('/user-feed', ownerSession);

		cy.get('.tab-bar .tab-bar-unread-dot').should('be.visible');
		cy.get('.mobile-top-bar .unread-dot').should('not.exist');
	});

	it('shows the dot on the burger on your own profile as well as on the tab bar', () => {
		visitAsUser(`/user/${ownerId}`, ownerSession);

		cy.get('.mobile-top-bar-action[aria-label="Account menu"] .unread-dot').invoke('outerWidth').should('be.greaterThan', 0);
		cy.get('.tab-bar .tab-bar-unread-dot').should('be.visible');
	});

	it("shows no burger and so no burger dot on someone else's profile, but keeps the tab bar dot", () => {
		visitAsUser(`/user/${followerId}`, ownerSession);

		cy.get('.mobile-top-bar-action[aria-label="Account menu"]').should('not.exist');
		cy.get('.tab-bar .tab-bar-unread-dot').should('be.visible');
	});

	it('opens a full-screen list from the account menu sheet, then clears both dots', () => {
		visitAsUser(`/user/${ownerId}`, ownerSession);

		openAccountMenuOnMobile();
		accountMenuNotificationsRow().find('.account-menu-badge').should('have.text', '1');
		accountMenuNotificationsRow().click();

		notificationsPopup().should('be.visible');
		notificationsPopup().find('.popup-body').invoke('outerWidth').should('eq', MOBILE_VIEWPORT.width);
		notificationsPopup().find('.popup-body').invoke('outerHeight').should('eq', MOBILE_VIEWPORT.height);
		notificationRows().should('have.length', 1);
		notificationRows().eq(0).should('contain.text', follower.username).and('contain.text', 'started following you.');
		notificationRows().eq(0).should('have.class', 'notification-row-unread');

		closeNotifications();
		notificationsPopup().should('not.exist');

		cy.get('.tab-bar-unread-dot').should('not.exist');
		cy.get('.mobile-top-bar-unread-dot').should('not.exist');
	});

	it('opens the profile of the follower and closes the full-screen list when the row is clicked', () => {
		visitAsUser(`/user/${ownerId}`, ownerSession);

		openAccountMenuOnMobile();
		accountMenuNotificationsRow().click();
		notificationRows().eq(0).click('right');

		cy.location('pathname').should('eq', `/user/${followerId}`);
		notificationsPopup().should('not.exist');
	});
});
