import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	userIdFromToken,
	uploadStoryViaApi,
	getUserStoriesViaApi,
	recordStoryViewViaApi,
	publicIdFromImageUrl,
} from '../../support/api';

describe('story teardown', () => {
	const author = buildTestUser();
	const watcher = buildTestUser();

	let authorToken;
	let watcherToken;

	beforeEach(() => {
		createUserViaApi(author);
		createUserViaApi(watcher);

		loginViaApi(author).then((token) => {
			authorToken = token;
		});
		loginViaApi(watcher).then((token) => {
			watcherToken = token;
		});
	});

	afterEach(() => {
		cy.task('deleteTestUser', author.email);
		cy.task('deleteTestUser', watcher.email);
	});

	it('removes the story images of a test user from Cloudinary together with the account', () => {
		let publicId;

		cy.then(() => uploadStoryViaApi(authorToken)).then((story) => {
			publicId = publicIdFromImageUrl(story.imageUrl);
		});
		cy.then(() => cy.task('cloudinaryAssetExists', publicId)).should('eq', true);

		cy.task('deleteTestUser', author.email);

		cy.then(() => cy.task('cloudinaryAssetExists', publicId)).should('eq', false);
	});

	it('removes the stories and view records of a test user from the database', () => {
		let storyId;

		cy.then(() => uploadStoryViaApi(authorToken)).then((story) => {
			storyId = story._id;
		});
		cy.then(() => recordStoryViewViaApi(watcherToken, storyId));

		cy.task('deleteTestUser', author.email).then((removed) => {
			expect(removed.users).to.equal(1);
			expect(removed.stories).to.equal(1);
			expect(removed.storyViews).to.equal(1);
		});
	});

	it('removes the views a test user left on other stories along with the account', () => {
		let storyId;

		cy.then(() => uploadStoryViaApi(authorToken)).then((story) => {
			storyId = story._id;
		});
		cy.then(() => recordStoryViewViaApi(watcherToken, storyId));

		cy.task('deleteTestUser', watcher.email).then((removed) => {
			expect(removed.users).to.equal(1);
			expect(removed.storyViews).to.equal(1);
			expect(removed.stories).to.equal(0);
		});

		cy.then(() => getUserStoriesViaApi(authorToken, userIdFromToken(authorToken)))
			.its('stories')
			.should('have.length', 1);
	});
});
