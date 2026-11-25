import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, loginViaApi, visitAsUser, userIdFromSession, followUserViaApi, uploadStoryViaApi } from '../../support/api';

describe('story rings outside the tray', () => {
	const poster = buildTestUser();
	const storylessUser = buildTestUser();

	let posterSession;
	let posterPath;
	let storylessPath;
	let viewer;
	let viewerSession;

	const profilePicture = () => cy.get('.profile-picture-wrapper .profile-picture');

	const storyButton = () => cy.get(`.profile-picture-wrapper button[aria-label="View ${poster.username}'s story"]`);

	const waitForPhotoLoad = () => {
		cy.get('.story-viewer-photo').should(($photo) => {
			expect($photo[0].naturalWidth).to.be.greaterThan(0);
		});
		cy.get('.story-viewer').should('not.have.class', 'story-viewer-paused');
	};

	before(() => {
		createUserViaApi(poster);
		createUserViaApi(storylessUser);

		loginViaApi(poster).then((session) => {
			posterSession = session;
			posterPath = `/user/${userIdFromSession(session)}`;
		});
		loginViaApi(storylessUser).then((session) => {
			storylessPath = `/user/${userIdFromSession(session)}`;
		});

		cy.then(() => uploadStoryViaApi(posterSession));
	});

	beforeEach(() => {
		viewer = buildTestUser();

		createUserViaApi(viewer);

		loginViaApi(viewer).then((session) => {
			viewerSession = session;
		});

		cy.then(() => followUserViaApi(viewerSession, userIdFromSession(posterSession)));
	});

	afterEach(() => {
		cy.task('deleteTestUser', viewer.email);
	});

	after(() => {
		cy.task('deleteTestUser', poster.email);
		cy.task('deleteTestUser', storylessUser.email);
	});

	describe('on the profile', () => {
		it('rings the picture of a followed user with an unwatched story in red and makes it a button', () => {
			cy.viewport(1440, 900);
			visitAsUser(posterPath, viewerSession);

			storyButton().should('be.visible');
			profilePicture().should('have.class', 'story-ring').and('have.class', 'story-ring-unwatched');
		});

		it('draws no ring and no button on a user without an active story', () => {
			visitAsUser(storylessPath, viewerSession);

			cy.contains('.profile-header .username', storylessUser.username).should('be.visible');
			profilePicture().should('not.have.class', 'story-ring');
			cy.get('.profile-picture-wrapper button').should('not.exist');
		});

		it('opens the story on tap and, after the last story, closes and turns the ring grey', () => {
			visitAsUser(posterPath, viewerSession);

			storyButton().click();

			cy.get('.story-viewer').should('be.visible');
			cy.get('.story-viewer-username').should('have.text', poster.username);
			cy.get('.story-viewer-segment').should('have.length', 1);
			waitForPhotoLoad();

			cy.get('.story-viewer-zone-next').click();

			cy.get('.story-viewer').should('not.exist');
			profilePicture().should('have.class', 'story-ring').and('not.have.class', 'story-ring-unwatched');
		});

		it('turns the ring grey on an early close without asking the server again, even while the view is still being recorded', () => {
			cy.intercept('GET', '**/users/*/story').as('getUserStory');
			cy.intercept('POST', '**/stories/*/view', (request) => {
				request.on('response', (response) => {
					response.setDelay(5000);
				});
			}).as('markViewed');

			visitAsUser(posterPath, viewerSession);
			cy.wait('@getUserStory');

			storyButton().click();
			waitForPhotoLoad();

			let requestsBeforeClose;

			cy.get('@getUserStory.all').then((requests) => {
				requestsBeforeClose = requests.length;
			});
			cy.get('.story-viewer-header button[aria-label="Close"]').click();

			cy.get('.story-viewer').should('not.exist');
			profilePicture().should('have.class', 'story-ring').and('not.have.class', 'story-ring-unwatched');
			cy.get('@getUserStory.all').should(($requests) => {
				expect($requests).to.have.length(requestsBeforeClose);
			});
		});

		it('turns the ring grey when the viewer is closed with Escape after the photo had loaded', () => {
			visitAsUser(posterPath, viewerSession);

			storyButton().click();
			waitForPhotoLoad();
			cy.get('body').type('{esc}');

			cy.get('.story-viewer').should('not.exist');
			profilePicture().should('have.class', 'story-ring').and('not.have.class', 'story-ring-unwatched');
		});

		it('shows a grey ring that still opens the story again once it is watched', () => {
			visitAsUser(posterPath, viewerSession);

			storyButton().click();
			waitForPhotoLoad();
			cy.get('.story-viewer-zone-next').click();
			cy.get('.story-viewer').should('not.exist');

			storyButton().click();

			cy.get('.story-viewer').should('be.visible');
			cy.get('.story-viewer-username').should('have.text', poster.username);
		});

		[
			['desktop', 1440, 900, '3px'],
			['tablet', 768, 1024, '3px'],
			['mobile', 390, 844, '2px'],
		].forEach(([name, width, height, ringWidth]) => {
			it(`draws a ${ringWidth} ring on ${name}`, () => {
				cy.viewport(width, height);
				visitAsUser(posterPath, viewerSession);

				profilePicture().should('have.css', 'border-top-width', ringWidth);
			});
		});

		it('keeps the ringed profile inside the screen at the 300px floor', () => {
			cy.viewport(300, 700);
			visitAsUser(posterPath, viewerSession);

			storyButton().should('be.visible');
			cy.document().then((doc) => {
				expect(doc.documentElement.scrollWidth).to.be.at.most(300);
			});
		});
	});

	describe('in search results', () => {
		it('rings the result avatar red and still opens the profile when the row is tapped', () => {
			cy.viewport(1440, 900);
			visitAsUser(storylessPath, viewerSession);

			cy.get('.search-input').type(poster.username);

			cy.contains('.search-results-dropdown .search-result', poster.username).within(() => {
				cy.get('.search-result-avatar').should('have.class', 'story-ring').and('have.class', 'story-ring-unwatched');
			});

			cy.contains('.search-results-dropdown .search-result', poster.username).click();

			cy.location('pathname').should('eq', posterPath);
			cy.get('.story-viewer').should('not.exist');
		});

		it('leaves the avatar of a user without a story unringed', () => {
			cy.viewport(1440, 900);
			visitAsUser(posterPath, viewerSession);

			cy.get('.search-input').type(storylessUser.username);

			cy.contains('.search-results-dropdown .search-result', storylessUser.username)
				.find('.search-result-avatar')
				.should('not.have.class', 'story-ring');
		});

		it('turns the avatar grey once the viewer has watched the story', () => {
			cy.viewport(1440, 900);
			visitAsUser(posterPath, viewerSession);

			storyButton().click();
			waitForPhotoLoad();
			cy.get('.story-viewer-zone-next').click();
			cy.get('.story-viewer').should('not.exist');

			cy.get('.search-input').type(poster.username);

			cy.contains('.search-results-dropdown .search-result', poster.username)
				.find('.search-result-avatar')
				.should('have.class', 'story-ring')
				.and('not.have.class', 'story-ring-unwatched');
		});
	});

	describe('as a guest', () => {
		it('sees the red ring on the profile', () => {
			cy.visit(posterPath);

			storyButton().should('be.visible');
			profilePicture().should('have.class', 'story-ring').and('have.class', 'story-ring-unwatched');
		});

		it('is sent to log in, and not shown the story, when the ringed picture is tapped', () => {
			cy.visit(posterPath);

			storyButton().click();

			cy.location('pathname').should('eq', '/log-in');
			cy.get('.story-viewer').should('not.exist');
		});

		it('sees the red ring in search results too', () => {
			cy.viewport(1440, 900);
			cy.visit(storylessPath);

			cy.get('.search-input').type(poster.username);

			cy.contains('.search-results-dropdown .search-result', poster.username)
				.find('.search-result-avatar')
				.should('have.class', 'story-ring-unwatched');
		});
	});
});
