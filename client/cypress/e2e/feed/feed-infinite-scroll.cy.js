import { buildTestUser } from '../../support/testUser';
import { createUserViaApi, followUserViaApi, loginViaApi, uploadPostViaApi, userIdFromToken, visitAsUser } from '../../support/api';

const FEED_PATH = '/user-feed';
const FIRST_PAGE_SIZE = 30;
const POST_COUNT = FIRST_PAGE_SIZE + 2;
const FEED_REQUEST = '**/user-posts/followed-users-posts*';

const captionPattern = (number) => new RegExp(`scroll post ${number}(?!\\d)`);

const getPostIds = () => cy.get('.user-post').then(($posts) => Cypress._.map($posts, 'id'));

const expectNoDuplicates = () => {
	getPostIds().then((ids) => {
		expect(Cypress._.uniq(ids)).to.have.length(POST_COUNT);
	});
};

const expectNewestFirst = () => {
	for (let position = 0; position < POST_COUNT; position += 1) {
		cy.get('.user-post')
			.eq(position)
			.invoke('text')
			.should('match', captionPattern(POST_COUNT - position));
	}
};

const expectCursorRequestCount = (count) => {
	cy.get('@feed.all').should((requests) => {
		expect(requests.filter(({ request }) => request.url.includes('cursor='))).to.have.length(count);
	});
};

describe('feed infinite scroll', () => {
	const viewer = buildTestUser();
	const author = buildTestUser();

	let viewerToken;
	let authorToken;

	before(() => {
		createUserViaApi(viewer);
		createUserViaApi(author);

		loginViaApi(viewer).then((token) => {
			viewerToken = token;
		});

		loginViaApi(author).then((token) => {
			authorToken = token;
		});

		cy.then(() => followUserViaApi(viewerToken, userIdFromToken(authorToken)));

		Cypress._.times(POST_COUNT, (index) => {
			cy.then(() => uploadPostViaApi(authorToken, `scroll post ${index + 1}`));
		});
	});

	after(() => {
		cy.task('deleteTestUser', viewer.email);
		cy.task('deleteTestUser', author.email);
	});

	beforeEach(() => {
		cy.intercept('GET', FEED_REQUEST, (request) => {
			delete request.headers['if-none-match'];
			delete request.headers['if-modified-since'];
		}).as('feed');
	});

	it('shows the first 30 posts and asks for no more until the reader scrolls', () => {
		visitAsUser(FEED_PATH, viewerToken);

		cy.get('.user-post').should('have.length', FIRST_PAGE_SIZE);
		cy.get('.user-post').first().invoke('text').should('match', captionPattern(POST_COUNT));
		cy.get('.loading-spinner').should('not.exist');
		expectCursorRequestCount(0);
	});

	it('asks for the first page without a cursor and is told there is more', () => {
		visitAsUser(FEED_PATH, viewerToken);

		cy.wait('@feed').then(({ request, response }) => {
			expect(request.url).to.not.include('cursor=');
			expect(response.body.posts).to.have.length(FIRST_PAGE_SIZE);
			expect(response.body.hasMore).to.eq(true);
			expect(response.body.nextCursor).to.be.a('string');
		});
	});

	it('loads the rest when the reader scrolls to the bottom: newest first, no duplicate, no gap', () => {
		visitAsUser(FEED_PATH, viewerToken);

		cy.get('.user-post').should('have.length', FIRST_PAGE_SIZE);
		cy.scrollTo('bottom');

		cy.get('.user-post').should('have.length', POST_COUNT);
		cy.get('@feed.all').then((requests) => {
			const [more] = requests.filter(({ request }) => request.url.includes('cursor='));

			expect(more.response.body.posts).to.have.length(POST_COUNT - FIRST_PAGE_SIZE);
			expect(more.response.body.hasMore).to.eq(false);
			expect(more.response.body.nextCursor).to.eq(null);
		});
		expectNoDuplicates();
		expectNewestFirst();
		cy.get('.loading-spinner').should('not.exist');
	});

	it('asks for nothing after the last page, however much the reader scrolls', () => {
		visitAsUser(FEED_PATH, viewerToken);

		cy.get('.user-post').should('have.length', FIRST_PAGE_SIZE);
		cy.scrollTo('bottom');
		cy.get('.user-post').should('have.length', POST_COUNT);
		cy.scrollTo('top');
		cy.scrollTo('bottom');

		expectCursorRequestCount(1);
	});

	it('shows a failed load of more posts as an inline message and loads them when Try again is clicked', () => {
		cy.intercept(
			{ method: 'GET', url: FEED_REQUEST, query: { cursor: '*' }, times: 1 },
			{ statusCode: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
		).as('failedMore');

		visitAsUser(FEED_PATH, viewerToken);

		cy.get('.user-post').should('have.length', FIRST_PAGE_SIZE);
		cy.scrollTo('bottom');
		cy.wait('@failedMore');

		cy.contains('.load-more-error', "Couldn't load more posts").should('be.visible');
		cy.get('.user-post').should('have.length', FIRST_PAGE_SIZE);

		cy.contains('.load-more-error button', 'Try again').click();

		cy.get('.user-post').should('have.length', POST_COUNT);
		cy.get('.load-more-error').should('not.exist');
		expectNoDuplicates();
	});

	it('loads more on scroll at 390 too, with the suggestions carousel staying after the 5th post', () => {
		cy.viewport(390, 844);
		visitAsUser(FEED_PATH, viewerToken);

		cy.get('.user-post').should('have.length', FIRST_PAGE_SIZE);
		cy.get('.suggestions-carousel').should('have.length', 1);
		cy.get('.feed-posts > *').eq(5).should('have.class', 'suggestions-carousel');

		cy.scrollTo('bottom');

		cy.get('.user-post').should('have.length', POST_COUNT);
		cy.get('.suggestions-carousel').should('have.length', 1);
		cy.get('.feed-posts > *').eq(5).should('have.class', 'suggestions-carousel');
		expectNoDuplicates();
	});

	it('does not repeat or lose a post when a new one arrives between two pages', () => {
		visitAsUser(FEED_PATH, viewerToken);

		cy.get('.user-post').should('have.length', FIRST_PAGE_SIZE);

		cy.then(() => uploadPostViaApi(authorToken, 'scroll arrival'));

		cy.scrollTo('bottom');

		cy.get('.user-post').should('have.length', POST_COUNT);
		expectNoDuplicates();
		cy.contains('.user-post', 'scroll arrival').should('not.exist');
	});
});
