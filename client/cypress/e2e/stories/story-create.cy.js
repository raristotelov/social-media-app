import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromToken,
	uploadStoryViaApi,
	getUserStoriesViaApi,
	getProfileViaApi,
} from '../../support/api';

const FIXTURE_IMAGE = 'cypress/fixtures/test-image.png';

describe('creating a story', () => {
	let user;
	let jwtToken;
	let userId;

	const selectedTab = () => cy.get('.create-popup [role="tab"][aria-selected="true"]');

	const fileInput = () => cy.get('#add-image-post-form input[type="file"]');

	const shareButton = () => cy.get('#add-image-post-form').contains('button', 'Share');

	const waitForPhotoLoad = () => {
		cy.get('.story-viewer-photo').should(($photo) => {
			expect($photo[0].naturalWidth).to.be.greaterThan(0);
		});
		cy.get('.story-viewer').should('not.have.class', 'story-viewer-paused');
	};

	beforeEach(() => {
		user = buildTestUser();

		createUserViaApi(user);

		loginViaApi(user).then((token) => {
			jwtToken = token;
			userId = userIdFromToken(token);
		});

		cy.intercept('POST', '**/stories').as('storyRequest');
	});

	afterEach(() => {
		cy.task('deleteTestUser', user.email);
	});

	it('posts a story from the "Your story" circle on an empty feed and shows it in the circle', () => {
		visitAsUser('/user-feed', jwtToken);

		cy.get('.stories-tray .story-circle-label').should('have.length', 1).and('have.text', 'Your story');
		cy.get('button[aria-label="Add to your story"]').click();

		selectedTab().should('contain.text', 'Story');
		cy.get('#add-image-post-form textarea').should('not.exist');
		fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		cy.get('#add-image-post-form .preview-backdrop').should('exist');
		shareButton().click();

		cy.wait('@storyRequest').then(({ request, response }) => {
			expect(request.headers['content-type']).to.include('multipart/form-data');
			expect(response.statusCode).to.equal(200);
			expect(response.body).to.have.property('imageWidth');
			expect(response.body).to.have.property('imageHeight');
		});

		cy.get('.create-popup').should('not.exist');
		cy.get('button[aria-label="View your story"]').should('be.visible');
		cy.get('button[aria-label="Add to your story"]').should('be.visible');

		cy.then(() => getUserStoriesViaApi(jwtToken, userId)).then(({ stories }) => {
			expect(stories).to.have.length(1);
			expect(stories[0].imageUrl).to.match(/^https:\/\/res\.cloudinary\.com\//);
		});
	});

	it('does not create a post when a story is shared', () => {
		visitAsUser('/user-feed', jwtToken);

		cy.get('button[aria-label="Add to your story"]').click();
		fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		shareButton().click();
		cy.wait('@storyRequest');

		cy.then(() => getProfileViaApi(userId, jwtToken)).then((profile) => {
			expect(profile.posts).to.have.length(0);
		});
	});

	it('plays the new story for 5 seconds from when its photo loads, then closes the viewer', () => {
		cy.then(() => uploadStoryViaApi(jwtToken));
		visitAsUser('/user-feed', jwtToken);

		cy.get('button[aria-label="View your story"]').click();

		cy.get('.story-viewer').should('be.visible');
		cy.get('.story-viewer-segment').should('have.length', 1);
		cy.get('.story-viewer-username').should('have.text', user.username);
		cy.get('.story-viewer-age').should('have.text', '1m');
		waitForPhotoLoad();
		cy.get('.story-viewer-seen-by').should('not.exist');
		cy.get('button[aria-label="Delete story"]').should('be.visible');

		cy.get('.story-viewer', { timeout: 10000 }).should('not.exist');
		cy.get('.stories-tray').should('be.visible');
	});

	it('opens the viewer from the picture and Create on Story from the plus, once you have a story', () => {
		cy.then(() => uploadStoryViaApi(jwtToken));
		visitAsUser('/user-feed', jwtToken);

		cy.get('button[aria-label="Add to your story"]').click();

		cy.get('.story-viewer').should('not.exist');
		selectedTab().should('contain.text', 'Story');
		cy.get('.create-popup').contains('button', 'Cancel').click();

		cy.get('button[aria-label="View your story"]').click();

		cy.get('.story-viewer').should('be.visible');
		cy.get('.create-popup').should('not.exist');
	});

	it('keeps the chosen picture and the caption when switching between the Post and Story tabs on the profile', () => {
		visitAsUser(`/user/${userId}`, jwtToken);

		cy.get('.add-post-button').click();
		selectedTab().should('contain.text', 'Post');
		fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		cy.get('#add-image-post-form textarea.caption-input').type('Kept caption');

		cy.contains('.create-popup [role="tab"]', 'Story').click();

		selectedTab().should('contain.text', 'Story');
		cy.get('#add-image-post-form .preview-wrapper').should('be.visible');
		cy.get('#add-image-post-form textarea').should('not.exist');

		cy.contains('.create-popup [role="tab"]', 'Post').click();

		cy.get('#add-image-post-form .preview-wrapper').should('be.visible');
		cy.get('#add-image-post-form textarea.caption-input').should('have.value', 'Kept caption');
	});

	it('shares a story from the profile popup after switching to the Story tab, and adds no post tile', () => {
		visitAsUser(`/user/${userId}`, jwtToken);

		cy.get('.add-post-button').click();
		fileInput().selectFile(FIXTURE_IMAGE, { force: true });
		cy.contains('.create-popup [role="tab"]', 'Story').click();
		shareButton().click();

		cy.wait('@storyRequest').its('response.statusCode').should('eq', 200);
		cy.get('.create-popup').should('not.exist');
		cy.get('.profile-post').should('have.length', 0);
	});

	it('lets you pick and share a story at the 300px floor without horizontal scrolling', () => {
		cy.viewport(300, 700);
		visitAsUser('/user-feed', jwtToken);

		cy.get('button[aria-label="Add to your story"]').click();
		fileInput().selectFile(FIXTURE_IMAGE, { force: true });

		cy.document().then((doc) => {
			expect(doc.documentElement.scrollWidth).to.be.at.most(300);
		});
		shareButton().click();

		cy.wait('@storyRequest').its('response.statusCode').should('eq', 200);
		cy.get('button[aria-label="View your story"]').should('be.visible');
	});
});
