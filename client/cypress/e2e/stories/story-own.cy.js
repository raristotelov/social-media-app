import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromToken,
	followUserViaApi,
	uploadStoryViaApi,
	getUserStoriesViaApi,
	recordStoryViewViaApi,
	getStoryViewersViaApi,
	deleteStoryViaApi,
	publicIdFromImageUrl,
} from '../../support/api';

const MISSING_STORY_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
const DELETE_ERROR_TOAST = "Couldn't delete your story. Try again.";

const waitForPhotoLoad = () => {
	cy.get('.story-viewer-photo').should(($photo) => {
		expect($photo[0].naturalWidth).to.be.greaterThan(0);
	});
	cy.get('.story-viewer').should('not.have.class', 'story-viewer-paused');
};

const openOwnStory = () => {
	cy.get('button[aria-label="View your story"]').click();
	cy.get('.story-viewer').should('be.visible');
};

const expectPopupAtBottomOfScreen = (popupSelector, width) => {
	cy.window().then((win) => {
		cy.get(`${popupSelector} .popup-body`).then(($body) => {
			const bounds = $body[0].getBoundingClientRect();

			expect(Math.round(bounds.bottom)).to.be.at.least(win.innerHeight - 1);
			expect(Math.round(bounds.left)).to.equal(0);
			expect(Math.round(bounds.width)).to.equal(width);
		});
	});
};

describe('your own stories: Seen by', () => {
	const owner = buildTestUser();
	const viewer = buildTestUser();

	let ownerToken;
	let viewerToken;
	let ownerId;
	let stories;

	before(() => {
		createUserViaApi(owner);
		createUserViaApi(viewer);

		loginViaApi(owner).then((token) => {
			ownerToken = token;
			ownerId = userIdFromToken(token);
		});
		loginViaApi(viewer).then((token) => {
			viewerToken = token;
		});

		cy.then(() => uploadStoryViaApi(ownerToken)).then((story) => {
			stories = [story];
		});
		cy.then(() => uploadStoryViaApi(ownerToken)).then((story) => {
			stories.push(story);
		});
		cy.then(() => recordStoryViewViaApi(viewerToken, stories[0]._id));
	});

	after(() => {
		cy.task('deleteTestUser', owner.email);
		cy.task('deleteTestUser', viewer.email);
	});

	it('counts the viewers of each story separately', () => {
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();

		cy.get('.story-viewer-seen-by').should('contain.text', 'Seen by 1');

		cy.get('.story-viewer-zone-next').click();

		cy.get('.story-viewer-seen-by').should('not.exist');
		cy.get('button[aria-label="Delete story"]').should('be.visible');
	});

	it('opens the Viewers list with photo and username only, pausing the story, and resumes when it is closed', () => {
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();
		waitForPhotoLoad();

		cy.contains('.story-viewer-seen-by', 'Seen by 1').click();

		cy.contains('.follow-list-popup .popup-title', 'Viewers').should('be.visible');
		cy.get('.story-viewer').should('have.class', 'story-viewer-paused');
		cy.get('.follow-list-popup .search-result').should('have.length', 1);
		cy.contains('.follow-list-popup .search-result', viewer.username).find('.search-result-avatar').should('be.visible');
		cy.contains('.follow-list-popup .search-result', owner.username).should('not.exist');
		cy.get('.follow-list-popup .search-result-followers').should('not.exist');

		cy.get('.follow-list-popup .popup-close').click();

		cy.get('.follow-list-popup').should('not.exist');
		cy.get('.story-viewer').should('not.have.class', 'story-viewer-paused');
		cy.get('.story-viewer').should('be.visible');
	});

	it('shows the Viewers list as a bottom sheet over the story on mobile', () => {
		cy.viewport(390, 844);
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();

		cy.contains('.story-viewer-seen-by', 'Seen by 1').click();

		cy.contains('.follow-list-popup .popup-title', 'Viewers').should('be.visible');
		expectPopupAtBottomOfScreen('.follow-list-popup', 390);
		cy.get('.story-viewer').should('be.visible');
	});

	it('shows the Viewers list as a centred popup on desktop', () => {
		cy.viewport(1440, 900);
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();

		cy.contains('.story-viewer-seen-by', 'Seen by 1').click();

		cy.get('.follow-list-popup .popup-body').then(($body) => {
			const bounds = $body[0].getBoundingClientRect();

			expect(bounds.left).to.be.greaterThan(0);
			expect(bounds.right).to.be.lessThan(1440);
			expect(bounds.bottom).to.be.lessThan(900);
		});
	});

	it('does not record a view when you watch your own story', () => {
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();
		cy.get('.story-viewer-zone-next').click();
		waitForPhotoLoad();

		cy.then(() => getStoryViewersViaApi(ownerToken, stories[1]._id))
			.its('body')
			.should('have.length', 0);
		cy.then(() => getStoryViewersViaApi(ownerToken, stories[0]._id))
			.its('body')
			.should('have.length', 1);
	});

	describe('the owner-only rules on the API', () => {
		it('refuses the viewers of someone else story with 403 STORY_FORBIDDEN', () => {
			cy.then(() => getStoryViewersViaApi(viewerToken, stories[0]._id, false)).then((response) => {
				expect(response.status).to.equal(403);
				expect(response.body.code).to.equal('STORY_FORBIDDEN');
			});
		});

		it('refuses to delete someone else story with 403 STORY_FORBIDDEN and leaves it in place', () => {
			cy.then(() => deleteStoryViaApi(viewerToken, stories[0]._id, false)).then((response) => {
				expect(response.status).to.equal(403);
				expect(response.body.code).to.equal('STORY_FORBIDDEN');
			});

			cy.then(() => getUserStoriesViaApi(ownerToken, ownerId))
				.its('stories')
				.should('have.length', 2);
		});

		it('answers 404 STORY_NOT_FOUND for a story that does not exist or has a malformed id', () => {
			[MISSING_STORY_ID, 'not-an-id'].forEach((storyId) => {
				cy.then(() => getStoryViewersViaApi(ownerToken, storyId, false)).then((response) => {
					expect(response.status).to.equal(404);
					expect(response.body.code).to.equal('STORY_NOT_FOUND');
				});
				cy.then(() => deleteStoryViaApi(ownerToken, storyId, false)).then((response) => {
					expect(response.status).to.equal(404);
					expect(response.body.code).to.equal('STORY_NOT_FOUND');
				});
			});
		});

		it("shows another user's stories oldest first with a watched flag and no viewers count", () => {
			cy.then(() => getUserStoriesViaApi(viewerToken, ownerId)).then(({ stories: listed }) => {
				expect(listed.map((story) => story._id)).to.deep.equal(stories.map((story) => story._id));
				expect(listed.map((story) => story.isWatched)).to.deep.equal([true, false]);
				listed.forEach((story) => expect(story).not.to.have.property('viewersCount'));
			});
		});

		it('shows your own stories with a viewers count and no watched flag', () => {
			cy.then(() => getUserStoriesViaApi(ownerToken, ownerId)).then(({ stories: listed }) => {
				expect(listed.map((story) => story.viewersCount)).to.deep.equal([1, 0]);
				listed.forEach((story) => expect(story).not.to.have.property('isWatched'));
			});
		});
	});
});

describe('your own stories: delete, and views recorded in the browser', () => {
	let owner;
	let viewer;
	let ownerToken;
	let viewerToken;
	let ownerId;
	let stories;

	const trashButton = () => cy.get('button[aria-label="Delete story"]');

	const confirmPopup = () => cy.get('.delete-post-popup');

	beforeEach(() => {
		owner = buildTestUser();
		viewer = buildTestUser();

		createUserViaApi(owner);
		createUserViaApi(viewer);

		loginViaApi(owner).then((token) => {
			ownerToken = token;
			ownerId = userIdFromToken(token);
		});
		loginViaApi(viewer).then((token) => {
			viewerToken = token;
		});

		cy.then(() => uploadStoryViaApi(ownerToken)).then((story) => {
			stories = [story];
		});
		cy.then(() => uploadStoryViaApi(ownerToken)).then((story) => {
			stories.push(story);
		});
		cy.then(() => recordStoryViewViaApi(viewerToken, stories[0]._id));

		cy.intercept('DELETE', '**/stories/*').as('deleteRequest');
	});

	afterEach(() => {
		cy.task('deleteTestUser', owner.email);
		cy.task('deleteTestUser', viewer.email);
	});

	it('lists a follower who watched the story in the browser among its viewers', () => {
		cy.then(() => followUserViaApi(viewerToken, ownerId));
		visitAsUser('/user-feed', viewerToken);

		cy.contains('.stories-tray .story-circle-label', owner.username).closest('button').click();
		cy.get('.story-viewer').should('be.visible');
		waitForPhotoLoad();
		cy.get('.story-viewer-header button[aria-label="Close"]').click();

		cy.then(() => getStoryViewersViaApi(ownerToken, stories[1]._id))
			.its('body')
			.should('have.length', 1);
		cy.then(() => getStoryViewersViaApi(ownerToken, stories[1]._id))
			.its('body.0.username')
			.should('eq', viewer.username);
	});

	it('opens "Delete story" over a paused story, and Cancel resumes it without deleting', () => {
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();
		waitForPhotoLoad();

		trashButton().click();

		confirmPopup().contains('.popup-title', 'Delete story').should('be.visible');
		confirmPopup().contains('This story will be permanently deleted').should('be.visible');
		cy.get('.story-viewer').should('have.class', 'story-viewer-paused');

		confirmPopup().contains('button', 'Cancel').click();

		confirmPopup().should('not.exist');
		cy.get('.story-viewer').should('not.have.class', 'story-viewer-paused');
		cy.get('@deleteRequest.all').should('have.length', 0);
		cy.then(() => getUserStoriesViaApi(ownerToken, ownerId))
			.its('stories')
			.should('have.length', 2);
	});

	it('deletes the story with its Cloudinary image and view records, and carries on with the next story', () => {
		let deletedPublicId;
		let keptPublicId;

		cy.then(() => getUserStoriesViaApi(ownerToken, ownerId)).then(({ stories: listed }) => {
			deletedPublicId = publicIdFromImageUrl(listed[0].imageUrl);
			keptPublicId = publicIdFromImageUrl(listed[1].imageUrl);
		});
		cy.then(() => cy.task('cloudinaryAssetExists', deletedPublicId)).should('eq', true);

		visitAsUser('/user-feed', ownerToken);
		openOwnStory();
		cy.get('.story-viewer-segment').should('have.length', 2);
		waitForPhotoLoad();

		trashButton().click();
		confirmPopup().contains('button', 'Delete').click();

		cy.wait('@deleteRequest').its('response.statusCode').should('eq', 204);
		confirmPopup().should('not.exist');
		cy.get('.story-viewer').should('be.visible');
		cy.get('.story-viewer-segment').should('have.length', 1);

		cy.then(() => getUserStoriesViaApi(ownerToken, ownerId)).then(({ stories: listed }) => {
			expect(listed.map((story) => story._id)).to.deep.equal([stories[1]._id]);
		});
		cy.then(() => cy.task('cloudinaryAssetExists', deletedPublicId)).should('eq', false);
		cy.then(() => cy.task('cloudinaryAssetExists', keptPublicId)).should('eq', true);
		cy.then(() => getStoryViewersViaApi(ownerToken, stories[0]._id, false))
			.its('status')
			.should('eq', 404);
	});

	it('closes the viewer and leaves only "Add to your story" when the last story is deleted', () => {
		cy.then(() => deleteStoryViaApi(ownerToken, stories[1]._id));

		visitAsUser('/user-feed', ownerToken);
		openOwnStory();
		waitForPhotoLoad();

		trashButton().click();
		confirmPopup().contains('button', 'Delete').click();
		cy.wait('@deleteRequest').its('response.statusCode').should('eq', 204);

		cy.get('.story-viewer').should('not.exist');
		cy.get('button[aria-label="Add to your story"]').should('have.length', 1);
		cy.get('button[aria-label="View your story"]').should('not.exist');
	});

	it('closes the confirmation, resumes and shows the error toast when deleting fails, keeping the story', () => {
		cy.intercept('DELETE', '**/stories/*', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
			'failedDelete',
		);
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();
		waitForPhotoLoad();

		trashButton().click();
		confirmPopup().contains('button', 'Delete').click();
		cy.wait('@failedDelete');

		confirmPopup().should('not.exist');
		cy.get('.toast-region').should('contain.text', DELETE_ERROR_TOAST);
		cy.get('.story-viewer').should('not.have.class', 'story-viewer-paused');
		cy.get('.story-viewer-segment').should('have.length', 2);
		cy.then(() => getUserStoriesViaApi(ownerToken, ownerId))
			.its('stories')
			.should('have.length', 2);
	});

	it('ends the session and goes to /log-in when the token is no longer valid', () => {
		cy.intercept('DELETE', '**/stories/*', { statusCode: 401, body: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } }).as(
			'failedDelete',
		);
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();

		trashButton().click();
		confirmPopup().contains('button', 'Delete').click();
		cy.wait('@failedDelete');

		cy.location('pathname').should('eq', '/log-in');
	});

	it('shows the confirmation as a bottom sheet over the story on mobile', () => {
		cy.viewport(390, 844);
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();

		trashButton().click();

		confirmPopup().contains('.popup-title', 'Delete story').should('be.visible');
		expectPopupAtBottomOfScreen('.delete-post-popup', 390);
	});

	it('keeps Seen by bottom-left and the trash bottom-right of the story', () => {
		cy.viewport(390, 844);
		visitAsUser('/user-feed', ownerToken);
		openOwnStory();

		cy.get('.story-viewer-seen-by').then(($seenBy) => {
			cy.get('button[aria-label="Delete story"]').then(($trash) => {
				const seenByBounds = $seenBy[0].getBoundingClientRect();
				const trashBounds = $trash[0].getBoundingClientRect();

				expect(seenByBounds.left).to.be.lessThan(390 / 2);
				expect(trashBounds.left).to.be.greaterThan(390 / 2);
				expect(Math.abs(seenByBounds.bottom - trashBounds.bottom)).to.be.lessThan(24);
			});
		});
	});
});
