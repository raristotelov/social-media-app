import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromToken,
	followUserViaApi,
	uploadStoryViaApi,
	getStoryTrayViaApi,
	recordStoryViewViaApi,
} from '../../support/api';

describe('watching stories', () => {
	const posterA = buildTestUser();
	const posterB = buildTestUser();
	const unfollowedPoster = buildTestUser();

	let viewer;
	let viewerToken;
	let posterAToken;
	let posterBToken;
	let posterAStories;
	let posterBStories;

	const trayLabels = () => cy.get('.stories-tray .story-circle-label');

	const circle = (label) => cy.contains('.stories-tray .story-circle-label', label).closest('.story-circle');

	const ring = (label) => circle(label).find('.story-circle-ring');

	const username = () => cy.get('.story-viewer-username');

	const segments = () => cy.get('.story-viewer-segment');

	const waitForPhotoLoad = () => {
		cy.get('.story-viewer-photo').should(($photo) => {
			expect($photo[0].naturalWidth).to.be.greaterThan(0);
		});
		cy.get('.story-viewer').should('not.have.class', 'story-viewer-paused');
	};

	const tapNext = () => cy.get('.story-viewer-zone-next').click();

	const tapPrevious = () => cy.get('.story-viewer-zone-previous').click();

	const openCircle = (label) => {
		circle(label).find('button.story-circle-button').click();
		cy.get('.story-viewer').should('be.visible');
	};

	before(() => {
		createUserViaApi(posterA);
		createUserViaApi(posterB);
		createUserViaApi(unfollowedPoster);

		loginViaApi(posterA).then((token) => {
			posterAToken = token;
		});
		loginViaApi(posterB).then((token) => {
			posterBToken = token;
		});

		let unfollowedToken;

		loginViaApi(unfollowedPoster).then((token) => {
			unfollowedToken = token;
		});

		cy.then(() => uploadStoryViaApi(posterAToken)).then((story) => {
			posterAStories = [story];
		});
		cy.then(() => uploadStoryViaApi(posterAToken)).then((story) => {
			posterAStories.push(story);
		});
		cy.then(() => uploadStoryViaApi(posterBToken)).then((story) => {
			posterBStories = [story];
		});
		cy.then(() => uploadStoryViaApi(unfollowedToken));
	});

	beforeEach(() => {
		viewer = buildTestUser();

		createUserViaApi(viewer);

		loginViaApi(viewer).then((token) => {
			viewerToken = token;
		});

		cy.then(() => followUserViaApi(viewerToken, userIdFromToken(posterAToken)));
		cy.then(() => followUserViaApi(viewerToken, userIdFromToken(posterBToken)));
	});

	afterEach(() => {
		cy.task('deleteTestUser', viewer.email);
	});

	after(() => {
		cy.task('deleteTestUser', posterA.email);
		cy.task('deleteTestUser', posterB.email);
		cy.task('deleteTestUser', unfollowedPoster.email);
	});

	describe('the tray', () => {
		it('lists your circle first, then followed users newest story first, and leaves out people you do not follow', () => {
			visitAsUser('/user-feed', viewerToken);

			trayLabels().should('have.length', 3);
			trayLabels().eq(0).should('have.text', 'Your story');
			trayLabels().eq(1).should('have.text', posterB.username);
			trayLabels().eq(2).should('have.text', posterA.username);
			cy.contains('.stories-tray .story-circle-label', unfollowedPoster.username).should('not.exist');
		});

		it('rings unwatched users in red and keeps your own circle grey', () => {
			visitAsUser('/user-feed', viewerToken);

			ring(posterA.username).should('have.class', 'story-circle-ring-unwatched');
			ring(posterB.username).should('have.class', 'story-circle-ring-unwatched');
			ring('Your story').should('not.have.class', 'story-circle-ring-unwatched');
		});

		it('moves a user whose stories you have all watched after the unwatched ones, with a grey ring', () => {
			cy.then(() => recordStoryViewViaApi(viewerToken, posterBStories[0]._id));

			visitAsUser('/user-feed', viewerToken);

			trayLabels().eq(1).should('have.text', posterA.username);
			trayLabels().eq(2).should('have.text', posterB.username);
			ring(posterB.username).should('not.have.class', 'story-circle-ring-unwatched');
			ring(posterA.username).should('have.class', 'story-circle-ring-unwatched');
		});

		it('keeps a user red while any one of their stories is unwatched', () => {
			cy.then(() => recordStoryViewViaApi(viewerToken, posterAStories[0]._id));

			visitAsUser('/user-feed', viewerToken);

			ring(posterA.username).should('have.class', 'story-circle-ring-unwatched');
		});

		it('turns the ring grey once everything the user posted is watched', () => {
			cy.then(() => recordStoryViewViaApi(viewerToken, posterAStories[0]._id));
			cy.then(() => recordStoryViewViaApi(viewerToken, posterAStories[1]._id));

			visitAsUser('/user-feed', viewerToken);

			ring(posterA.username).should('not.have.class', 'story-circle-ring-unwatched');
		});
	});

	describe('the viewer', () => {
		it('opens on the first story a user has not watched yet', () => {
			cy.then(() => recordStoryViewViaApi(viewerToken, posterAStories[0]._id));
			visitAsUser('/user-feed', viewerToken);

			openCircle(posterA.username);

			username().should('have.text', posterA.username);
			segments().should('have.length', 2);
			cy.get('.story-viewer-segment-fill-complete').should('have.length', 1);
		});

		it('opens on the first story when the user has none unwatched', () => {
			cy.then(() => recordStoryViewViaApi(viewerToken, posterAStories[0]._id));
			cy.then(() => recordStoryViewViaApi(viewerToken, posterAStories[1]._id));
			visitAsUser('/user-feed', viewerToken);

			openCircle(posterA.username);

			segments().should('have.length', 2);
			cy.get('.story-viewer-segment-fill-complete').should('have.length', 0);
		});

		it('moves through a user, on to the next user in the tray, and closes after the last', () => {
			visitAsUser('/user-feed', viewerToken);

			openCircle(posterB.username);
			username().should('have.text', posterB.username);
			segments().should('have.length', 1);

			tapNext();
			username().should('have.text', posterA.username);
			segments().should('have.length', 2);
			cy.get('.story-viewer-segment-fill-complete').should('have.length', 0);

			tapNext();
			cy.get('.story-viewer-segment-fill-complete').should('have.length', 1);

			tapNext();
			cy.get('.story-viewer').should('not.exist');
		});

		it('goes back to the previous user last story from a first story, and does nothing on the very first story', () => {
			visitAsUser('/user-feed', viewerToken);

			openCircle(posterB.username);
			tapPrevious();
			cy.get('.story-viewer').should('be.visible');
			username().should('have.text', posterB.username);

			tapNext();
			username().should('have.text', posterA.username);

			tapPrevious();
			username().should('have.text', posterB.username);
		});

		it('goes back to the previous story of the same user', () => {
			cy.then(() => recordStoryViewViaApi(viewerToken, posterAStories[0]._id));
			visitAsUser('/user-feed', viewerToken);

			openCircle(posterA.username);
			cy.get('.story-viewer-segment-fill-complete').should('have.length', 1);

			tapPrevious();

			cy.get('.story-viewer-segment-fill-complete').should('have.length', 0);
			username().should('have.text', posterA.username);
		});

		it('pauses while held and carries on, on the same story, when released', () => {
			visitAsUser('/user-feed', viewerToken);
			openCircle(posterB.username);
			waitForPhotoLoad();

			cy.get('.story-viewer-zone-next').trigger('pointerdown');
			cy.get('.story-viewer').should('have.class', 'story-viewer-paused');
			cy.wait(400);
			cy.get('.story-viewer-zone-next').trigger('pointerup');

			cy.get('.story-viewer').should('not.have.class', 'story-viewer-paused');
			username().should('have.text', posterB.username);
		});

		it('advances by itself 5 seconds after the photo has loaded', () => {
			visitAsUser('/user-feed', viewerToken);
			openCircle(posterB.username);
			waitForPhotoLoad();

			cy.get('.story-viewer-username', { timeout: 10000 }).should('have.text', posterA.username);
		});

		it('shows the time next to the poster as minutes for a fresh story', () => {
			visitAsUser('/user-feed', viewerToken);

			openCircle(posterB.username);

			cy.get('.story-viewer-age')
				.invoke('text')
				.should('match', /^\d+m$/);
		});

		it('has no Seen by and no delete on someone else story, and no reply input', () => {
			visitAsUser('/user-feed', viewerToken);

			openCircle(posterB.username);

			cy.get('.story-viewer-seen-by').should('not.exist');
			cy.get('button[aria-label="Delete story"]').should('not.exist');
			cy.get('.story-viewer input, .story-viewer textarea').should('not.exist');
		});

		it('closes from the close button and leaves the feed usable', () => {
			visitAsUser('/user-feed', viewerToken);
			openCircle(posterB.username);

			cy.get('.story-viewer-header button[aria-label="Close"]').click();

			cy.get('.story-viewer').should('not.exist');
			cy.get('.stories-tray').should('be.visible');
		});
	});

	describe('watching all the way through', () => {
		it('greys both rings and records every view once the photos have loaded', () => {
			visitAsUser('/user-feed', viewerToken);

			openCircle(posterB.username);
			waitForPhotoLoad();
			tapNext();
			waitForPhotoLoad();
			tapNext();
			waitForPhotoLoad();
			tapNext();
			cy.get('.story-viewer').should('not.exist');

			ring(posterA.username).should('not.have.class', 'story-circle-ring-unwatched');
			ring(posterB.username).should('not.have.class', 'story-circle-ring-unwatched');

			cy.then(() => getStoryTrayViaApi(viewerToken)).then((tray) => {
				expect(tray.filter((entry) => !entry.isOwn).every((entry) => entry.isWatched)).to.equal(true);
			});
		});

		it('counts a story as watched even when tapped past before 5 seconds', () => {
			visitAsUser('/user-feed', viewerToken);

			openCircle(posterB.username);
			waitForPhotoLoad();
			cy.get('.story-viewer-header button[aria-label="Close"]').click();

			ring(posterB.username).should('not.have.class', 'story-circle-ring-unwatched');
		});
	});

	describe('layout', () => {
		it('shows the side arrows on desktop and moves with them', () => {
			cy.viewport(1440, 900);
			visitAsUser('/user-feed', viewerToken);
			openCircle(posterB.username);

			cy.get('.story-viewer-arrow-previous').should('not.exist');
			cy.get('.story-viewer-arrow-next').should('be.visible').click();

			username().should('have.text', posterA.username);
			cy.get('.story-viewer-arrow-previous').should('be.visible').click();
			username().should('have.text', posterB.username);
		});

		[
			['tablet', 768, 1024],
			['mobile', 390, 844],
		].forEach(([name, width, height]) => {
			it(`shows no side arrows on ${name}`, () => {
				cy.viewport(width, height);
				visitAsUser('/user-feed', viewerToken);
				openCircle(posterB.username);

				cy.get('.story-viewer-arrow-next').should('not.be.visible');
			});
		});

		[
			['desktop', 1440, 900],
			['tablet', 768, 1024],
			['mobile', 390, 844],
			['the 300px floor', 300, 700],
		].forEach(([name, width, height]) => {
			it(`keeps the tray and the viewer controls on screen on ${name} without horizontal scrolling`, () => {
				cy.viewport(width, height);
				visitAsUser('/user-feed', viewerToken);

				cy.get('.stories-tray').should('be.visible');
				cy.document().then((doc) => {
					expect(doc.documentElement.scrollWidth).to.be.at.most(width);
				});

				openCircle(posterB.username);

				cy.get('.story-viewer-header button[aria-label="Close"]').should('be.visible');
				cy.get('.story-viewer-progress').then(($progress) => {
					const bounds = $progress[0].getBoundingClientRect();

					expect(bounds.width).to.be.greaterThan(0);
					expect(bounds.left).to.be.at.least(0);
					expect(bounds.right).to.be.at.most(width);
				});
				cy.document().then((doc) => {
					expect(doc.documentElement.scrollWidth).to.be.at.most(width);
				});
				cy.get('.story-viewer-header button[aria-label="Close"]').then(($close) => {
					const bounds = $close[0].getBoundingClientRect();

					expect(bounds.left).to.be.at.least(0);
					expect(bounds.right).to.be.at.most(width);
				});
			});
		});
	});

	describe('when the stories cannot be loaded', () => {
		it('closes the viewer and shows the error toast', () => {
			visitAsUser('/user-feed', viewerToken);
			cy.get('.stories-tray .story-circle-label').should('have.length', 3);
			cy.intercept('GET', '**/stories/user/*', { statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }).as(
				'userStories',
			);

			circle(posterB.username).find('button.story-circle-button').click();
			cy.wait('@userStories');

			cy.get('.story-viewer').should('not.exist');
			cy.get('.toast-region').should('contain.text', "Couldn't load stories. Try again.");
		});

		it('ends the session and goes to /log-in when the token is no longer valid', () => {
			visitAsUser('/user-feed', viewerToken);
			cy.get('.stories-tray .story-circle-label').should('have.length', 3);
			cy.intercept('GET', '**/stories/user/*', { statusCode: 401, body: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } }).as(
				'userStories',
			);

			circle(posterB.username).find('button.story-circle-button').click();
			cy.wait('@userStories');

			cy.location('pathname').should('eq', '/log-in');
		});
	});

	describe('a photo that fails to load', () => {
		it('is skipped straight away, through every user, and never recorded as watched', () => {
			cy.intercept('GET', 'https://res.cloudinary.com/cypress-missing/**', { forceNetworkError: true });
			cy.intercept('GET', '**/stories/user/*', (req) => {
				delete req.headers['if-none-match'];
				delete req.headers['if-modified-since'];

				req.continue((res) => {
					const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;

					body.stories.forEach((story, index) => {
						story.imageUrl = `https://res.cloudinary.com/cypress-missing/image/upload/${Date.now()}-${index}.png`;
					});

					res.send(body);
				});
			}).as('userStories');
			visitAsUser('/user-feed', viewerToken);
			cy.get('.stories-tray .story-circle-label').should('have.length', 3);

			circle(posterB.username).find('button.story-circle-button').click();
			cy.wait('@userStories');
			cy.wait('@userStories');

			cy.get('.story-viewer').should('not.exist');
			ring(posterB.username).should('have.class', 'story-circle-ring-unwatched');
			ring(posterA.username).should('have.class', 'story-circle-ring-unwatched');

			cy.then(() => getStoryTrayViaApi(viewerToken)).then((tray) => {
				expect(tray.filter((entry) => !entry.isOwn).every((entry) => entry.isWatched === false)).to.equal(true);
			});
		});
	});
});
