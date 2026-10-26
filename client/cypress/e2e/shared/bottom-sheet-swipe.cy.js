import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromToken, uploadPostViaApi, addCommentViaApi, deletePostViaApi } from '../../support/api';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const START_Y = 300;
const SETTLE_BEFORE_MOVE_MS = 200;

const COMMENT_TEXT = 'swipe test comment';
const POST_CAPTION = 'swipe test post';

const SHEET_SELECTORS = {
	comments: '.comments-popup .popup-body',
	accountMenu: '.account-menu-sheet',
};

const pointerEvent = (selector, type, clientY) =>
	cy.get(selector).trigger(type, { clientX: 100, clientY, pointerId: 1, pointerType: 'touch', button: 0, force: true });

const pressAt = (selector) => pointerEvent(selector, 'pointerdown', START_Y);

const moveBy = (selector, distance) => pointerEvent(selector, 'pointermove', START_Y + distance);

const releaseAfter = (selector, distance) => pointerEvent(selector, 'pointerup', START_Y + distance);

const swipeDown = (grabSelector, distance) => {
	pressAt(grabSelector);
	cy.wait(SETTLE_BEFORE_MOVE_MS);
	moveBy(grabSelector, distance);
	releaseAfter(grabSelector, distance);
};

const expectTransform = (sheetSelector, expected) => {
	cy.get(sheetSelector).should(($sheet) => {
		expect($sheet[0].style.transform).to.equal(expected);
	});
};

const expectSheetAtRest = (sheetSelector) => {
	cy.window().then((win) => {
		cy.get(sheetSelector).should(($sheet) => {
			expect(Math.round($sheet[0].getBoundingClientRect().bottom)).to.be.at.least(win.innerHeight - 1);
			expect($sheet[0].style.transform).to.equal('');
		});
	});
};

const getSheetHeight = (sheetSelector) => cy.get(sheetSelector).then(($sheet) => $sheet[0].offsetHeight);

describe('bottom sheets: swipe to close', () => {
	const owner = buildTestUser();

	let ownerToken;
	let ownerId;
	let post;

	const postsPath = () => `/user/${ownerId}/posts#${post._id}`;

	const openComments = () => {
		cy.contains('.user-post', POST_CAPTION).find('.user-post-comments-button').click();
		cy.get(SHEET_SELECTORS.comments).should('be.visible');
		cy.contains('.comments-popup .comment', COMMENT_TEXT).should('be.visible');
	};

	const openAccountMenu = () => {
		cy.get('button[aria-label="Account menu"]').click();
		cy.get(SHEET_SELECTORS.accountMenu).should('be.visible');
	};

	before(() => {
		createUserViaApi(owner);

		loginViaApi(owner).then((token) => {
			ownerToken = token;
			ownerId = userIdFromToken(token);
		});

		cy.then(() => uploadPostViaApi(ownerToken, POST_CAPTION)).then((uploaded) => {
			post = uploaded;
		});

		cy.then(() => addCommentViaApi(ownerToken, post._id, COMMENT_TEXT));
	});

	after(() => {
		cy.then(() => deletePostViaApi(ownerToken, post._id, false));
		cy.task('deleteTestUser', owner.email);
	});

	describe('on a 390px screen', () => {
		beforeEach(() => {
			cy.viewport(MOBILE_VIEWPORT.width, MOBILE_VIEWPORT.height);
		});

		describe('the comments sheet', () => {
			beforeEach(() => {
				visitAsUser(postsPath(), ownerToken);
				openComments();
			});

			it('shows a drag handle at the top of the sheet', () => {
				cy.get('.comments-popup .bottom-sheet-handle').should('be.visible');
			});

			it('follows the finger down and never above its resting position', () => {
				pressAt('.comments-popup .bottom-sheet-handle');
				moveBy('.comments-popup .bottom-sheet-handle', 60);
				expectTransform(SHEET_SELECTORS.comments, 'translateY(60px)');

				moveBy('.comments-popup .bottom-sheet-handle', -40);
				expectTransform(SHEET_SELECTORS.comments, 'translateY(0px)');

				releaseAfter('.comments-popup .bottom-sheet-handle', -40);
			});

			it('slides out and closes when the handle is dragged down past 25% of the sheet', () => {
				getSheetHeight(SHEET_SELECTORS.comments).then((height) => {
					swipeDown('.comments-popup .bottom-sheet-handle', Math.round(height * 0.4));
				});

				cy.get('.comments-popup').should('not.exist');
				cy.contains('.user-post', POST_CAPTION).should('be.visible');
				cy.location('pathname').should('eq', `/user/${ownerId}/posts`);
			});

			it('closes when the Comments title is dragged down past 25% of the sheet', () => {
				getSheetHeight(SHEET_SELECTORS.comments).then((height) => {
					swipeDown('.comments-popup .bottom-sheet-header', Math.round(height * 0.4));
				});

				cy.get('.comments-popup').should('not.exist');
				cy.contains('.user-post', POST_CAPTION).should('be.visible');
			});

			it('springs back and stays open when released short of 25%', () => {
				getSheetHeight(SHEET_SELECTORS.comments).then((height) => {
					swipeDown('.comments-popup .bottom-sheet-handle', Math.round(height * 0.1));
				});

				expectSheetAtRest(SHEET_SELECTORS.comments);
				cy.contains('.comments-popup .comment', COMMENT_TEXT).should('be.visible');
			});

			it('springs back when the gesture is cancelled, even past 25% of the sheet', () => {
				getSheetHeight(SHEET_SELECTORS.comments).then((height) => {
					pressAt('.comments-popup .bottom-sheet-handle');
					cy.wait(SETTLE_BEFORE_MOVE_MS);
					moveBy('.comments-popup .bottom-sheet-handle', Math.round(height * 0.4));
					pointerEvent('.comments-popup .bottom-sheet-handle', 'pointercancel', START_Y + Math.round(height * 0.4));
				});

				expectSheetAtRest(SHEET_SELECTORS.comments);
				cy.get('.comments-popup').should('be.visible');
			});

			it('does nothing when the drag starts on a comment', () => {
				swipeDown('.comments-popup .comment', 300);

				expectSheetAtRest(SHEET_SELECTORS.comments);
				cy.get('.comments-popup').should('be.visible');
			});

			it('can be dragged again after springing back', () => {
				getSheetHeight(SHEET_SELECTORS.comments).then((height) => {
					swipeDown('.comments-popup .bottom-sheet-handle', Math.round(height * 0.1));
					expectSheetAtRest(SHEET_SELECTORS.comments);

					swipeDown('.comments-popup .bottom-sheet-handle', Math.round(height * 0.4));
				});

				cy.get('.comments-popup').should('not.exist');
			});
		});

		describe('the account menu sheet', () => {
			beforeEach(() => {
				visitAsUser(`/user/${ownerId}`, ownerToken);
				openAccountMenu();
			});

			it('shows a drag handle at the top of the sheet', () => {
				cy.get('.account-menu-sheet .bottom-sheet-handle').should('be.visible');
			});

			it('slides out and closes when the handle is dragged down past 25% of the sheet', () => {
				getSheetHeight(SHEET_SELECTORS.accountMenu).then((height) => {
					swipeDown('.account-menu-sheet .bottom-sheet-handle', Math.round(height * 0.5));
				});

				cy.get(SHEET_SELECTORS.accountMenu).should('not.exist');
				cy.get('button[aria-label="Account menu"]').should('have.attr', 'aria-expanded', 'false');
				cy.location('pathname').should('eq', `/user/${ownerId}`);
			});

			it('springs back and stays open when released short of 25%', () => {
				getSheetHeight(SHEET_SELECTORS.accountMenu).then((height) => {
					swipeDown('.account-menu-sheet .bottom-sheet-handle', Math.round(height * 0.1));
				});

				expectSheetAtRest(SHEET_SELECTORS.accountMenu);
				cy.contains('.account-menu-row', 'Log out').should('be.visible');
			});

			it('does nothing when the drag starts on a row', () => {
				swipeDown('.account-menu-sheet .account-menu-row:last-child', 300);

				expectSheetAtRest(SHEET_SELECTORS.accountMenu);
				cy.get(SHEET_SELECTORS.accountMenu).should('be.visible');
			});

			it('opens again after being swiped closed', () => {
				getSheetHeight(SHEET_SELECTORS.accountMenu).then((height) => {
					swipeDown('.account-menu-sheet .bottom-sheet-handle', Math.round(height * 0.5));
				});
				cy.get(SHEET_SELECTORS.accountMenu).should('not.exist');

				openAccountMenu();

				cy.contains('.account-menu-row', 'Log out').should('be.visible');
			});
		});
	});

	describe('on a desktop screen', () => {
		beforeEach(() => {
			cy.viewport(1440, 900);
			visitAsUser(postsPath(), ownerToken);
			openComments();
		});

		it('shows no handle and does not move the sheet when the title is dragged', () => {
			cy.get('.comments-popup .bottom-sheet-handle').should('not.be.visible');

			swipeDown('.comments-popup .bottom-sheet-header', 300);

			cy.get(SHEET_SELECTORS.comments).should('be.visible');
			expectTransform(SHEET_SELECTORS.comments, '');
		});
	});
});
