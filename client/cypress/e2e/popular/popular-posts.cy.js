import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromToken,
	uploadPostViaApi,
	addCommentViaApi,
	followUserViaApi,
	deletePostViaApi,
	getProfileViaApi,
} from '../../support/api';

const BOOST_COMMENT_COUNT = 12;
const FIRST_BATCH_SIZE = 30;
const SCROLL_BATCH_POST_COUNT = FIRST_BATCH_SIZE + 1;
const GRID_PATH = '/popular-posts';
const POSTS_PATH = '/popular-posts/posts';

const tileFor = (postId) => cy.get(`a.profile-post-link[href="${POSTS_PATH}#${postId}"]`);

const logInThroughForm = (user) => {
	cy.get('input#email').type(user.email);
	cy.get('input#password').type(user.password);
	cy.contains('button', 'Submit').click();
};

const expectPostInView = (postId) =>
	cy.get(`[id="${postId}"]`).should(($post) => {
		const { top } = $post[0].getBoundingClientRect();

		expect(top).to.be.lessThan(Cypress.config('viewportHeight'));
		expect(top).to.be.greaterThan(-1);
	});

const expectUnique = (values) => {
	expect(Cypress._.uniq(values)).to.have.length(values.length);
};

describe('popular posts', () => {
	const strangerAuthor = buildTestUser();
	const followedAuthor = buildTestUser();
	const member = buildTestUser();
	const commenter = buildTestUser();

	let strangerAuthorToken;
	let followedAuthorToken;
	let memberToken;
	let commenterToken;
	let strangerAuthorId;
	let memberId;
	let strangerPost;
	let followedPost;
	let memberPost;
	let deletedPostId;

	const boostPost = (post) => {
		Cypress._.times(BOOST_COMMENT_COUNT, (index) => {
			cy.then(() => addCommentViaApi(commenterToken, post._id, `boost ${index}`));
		});
	};

	before(() => {
		createUserViaApi(strangerAuthor);
		createUserViaApi(followedAuthor);
		createUserViaApi(member);
		createUserViaApi(commenter);

		loginViaApi(strangerAuthor).then((token) => {
			strangerAuthorToken = token;
			strangerAuthorId = userIdFromToken(token);
		});

		loginViaApi(followedAuthor).then((token) => {
			followedAuthorToken = token;
		});

		loginViaApi(member).then((token) => {
			memberToken = token;
			memberId = userIdFromToken(token);
		});

		loginViaApi(commenter).then((token) => {
			commenterToken = token;
		});

		cy.then(() => uploadPostViaApi(strangerAuthorToken, 'popular stranger post')).then((post) => {
			strangerPost = post;
		});

		cy.then(() => uploadPostViaApi(followedAuthorToken, 'popular followed post')).then((post) => {
			followedPost = post;
		});

		cy.then(() => uploadPostViaApi(memberToken, 'popular member post')).then((post) => {
			memberPost = post;
		});

		cy.then(() => uploadPostViaApi(strangerAuthorToken, 'popular deleted post')).then((post) => {
			deletedPostId = post._id;
		});

		cy.then(() => deletePostViaApi(strangerAuthorToken, deletedPostId));

		cy.then(() => boostPost(strangerPost));
		cy.then(() => boostPost(followedPost));
		cy.then(() => boostPost(memberPost));

		cy.then(() => addCommentViaApi(commenterToken, strangerPost._id, 'a readable comment'));

		cy.then(() => followUserViaApi(memberToken, userIdFromToken(followedAuthorToken)));
	});

	after(() => {
		cy.task('deleteTestUser', strangerAuthor.email);
		cy.task('deleteTestUser', followedAuthor.email);
		cy.task('deleteTestUser', member.email);
		cy.task('deleteTestUser', commenter.email);
	});

	describe('as a guest', () => {
		it('browses the popular grid without logging in, seeing every post', () => {
			cy.visit(GRID_PATH);

			cy.location('pathname').should('eq', GRID_PATH);

			tileFor(strangerPost._id).should('exist');
			tileFor(followedPost._id).should('exist');
			tileFor(memberPost._id).should('exist');
		});

		it('shows the guest header with Log in and Sign up, and no account menu', () => {
			cy.visit(GRID_PATH);

			cy.get('.header-wrapper').within(() => {
				cy.contains('Log in').should('be.visible');
				cy.contains('Sign up').should('be.visible');
				cy.contains('Popular').should('be.visible');
			});

			cy.get('.logged-user-avatar').should('not.exist');
		});

		it('opens a post from the grid in the posts view, read-only, at the clicked post', () => {
			cy.visit(GRID_PATH);

			tileFor(strangerPost._id).click();

			cy.location('pathname').should('eq', POSTS_PATH);
			cy.location('hash').should('eq', `#${strangerPost._id}`);

			cy.contains('.posts-bar .posts-bar-heading', 'Posts').should('be.visible');
			cy.contains('.posts-bar .posts-bar-subtitle', 'Popular').should('be.visible');
			cy.contains(`[id="${strangerPost._id}"]`, 'popular stranger post').should('exist');

			expectPostInView(strangerPost._id);
		});

		it('shows posts only on the posts view, with no stories tray', () => {
			cy.visit(`${POSTS_PATH}#${strangerPost._id}`);

			cy.get('.user-post').should('have.length.at.least', 3);
			cy.get('.stories-tray').should('not.exist');
		});

		it('reads the comments in the comments popup without logging in', () => {
			cy.visit(`${POSTS_PATH}#${strangerPost._id}`);

			cy.get(`[id="${strangerPost._id}"] .user-post-comments-button`).click();

			cy.contains('.comments-popup .comment-text', 'a readable comment').should('be.visible');
			cy.location('pathname').should('eq', POSTS_PATH);
		});

		it('sends the guest to /log-in when liking, and back to the same post after logging in', () => {
			cy.visit(`${POSTS_PATH}#${strangerPost._id}`);

			cy.get(`[id="${strangerPost._id}"] .user-post-like-button`).click();

			cy.location('pathname').should('eq', '/log-in');

			logInThroughForm(commenter);

			cy.location('pathname').should('eq', POSTS_PATH);
			cy.location('hash').should('eq', `#${strangerPost._id}`);
			expectPostInView(strangerPost._id);
		});

		it('sends the guest to /log-in when clicking into the comment box, and back to the popular posts view after logging in', () => {
			cy.visit(`${POSTS_PATH}#${strangerPost._id}`);

			cy.get(`[id="${strangerPost._id}"] .add-comment-form-input`).click();

			cy.location('pathname').should('eq', '/log-in');
			cy.window()
				.its('history.state.usr.from')
				.should('match', new RegExp(`^${POSTS_PATH}#[0-9a-f]{24}$`));

			logInThroughForm(commenter);

			cy.location('pathname').should('eq', POSTS_PATH);
			cy.location('hash').should('match', /^#[0-9a-f]{24}$/);
		});

		it('sends the guest to /log-in when clicking into the comment box inside the comments popup', () => {
			cy.visit(`${POSTS_PATH}#${strangerPost._id}`);

			cy.get(`[id="${strangerPost._id}"] .user-post-comments-button`).click();
			cy.get('.comments-popup .add-comment-form-input').click();

			cy.location('pathname').should('eq', '/log-in');
		});
	});

	describe('as a member', () => {
		it('shows the member header and no Log in or Sign up', () => {
			visitAsUser(GRID_PATH, memberToken);

			cy.contains('.logged-user-avatar', member.username).should('be.visible');
			cy.get('.header-wrapper').within(() => {
				cy.contains('Log in').should('not.exist');
				cy.contains('Sign up').should('not.exist');
			});
		});

		it('leaves out their own posts and the posts of the people they follow', () => {
			visitAsUser(GRID_PATH, memberToken);

			tileFor(strangerPost._id).should('exist');
			tileFor(followedPost._id).should('not.exist');
			tileFor(memberPost._id).should('not.exist');
		});

		it('leaves the same posts out of the posts view', () => {
			visitAsUser(`${POSTS_PATH}#${strangerPost._id}`, memberToken);

			cy.get(`[id="${strangerPost._id}"]`).should('exist');
			cy.get(`[id="${followedPost._id}"]`).should('not.exist');
			cy.get(`[id="${memberPost._id}"]`).should('not.exist');
		});

		it('keeps the full interactive post, liking it without leaving the page', () => {
			visitAsUser(`${POSTS_PATH}#${strangerPost._id}`, memberToken);

			cy.get(`[id="${strangerPost._id}"] .user-post-like-button`).click();

			cy.contains(`[id="${strangerPost._id}"]`, '1 like').should('be.visible');
			cy.location('pathname').should('eq', POSTS_PATH);

			cy.then(() => getProfileViaApi(strangerAuthorId))
				.its('posts')
				.then((posts) => {
					expect(posts.find((post) => post._id === strangerPost._id).likes).to.include(memberId);
				});
		});
	});

	describe('opening a post and coming back', () => {
		it('opens on the post after a refresh, with it first and a fresh ranking below it', () => {
			cy.visit(GRID_PATH);

			tileFor(memberPost._id).click();
			cy.location('hash').should('eq', `#${memberPost._id}`);

			cy.reload();

			cy.location('pathname').should('eq', POSTS_PATH);
			cy.location('hash').should('eq', `#${memberPost._id}`);
			cy.get('.user-post').first().should('have.attr', 'id', memberPost._id);
			expectPostInView(memberPost._id);
		});

		it('opens on the post from a shared link', () => {
			cy.visit(`${POSTS_PATH}#${followedPost._id}`);

			cy.get('.user-post').first().should('have.attr', 'id', followedPost._id);
			expectPostInView(followedPost._id);
		});

		it('shows a shared post even when a member follows its author or owns it', () => {
			visitAsUser(`${POSTS_PATH}#${memberPost._id}`, memberToken);

			cy.get('.user-post').first().should('have.attr', 'id', memberPost._id);
		});

		it('goes back to the grid with the back chevron, the opened post first, after a shared-link visit', () => {
			cy.visit(`${POSTS_PATH}#${memberPost._id}`);

			cy.get('.user-post').should('have.length.at.least', 3);
			cy.get('.posts-bar-back').then(($back) => $back[0].click());

			cy.location('pathname').should('eq', GRID_PATH);
			cy.get('a.profile-post-link').first().should('have.attr', 'href', `${POSTS_PATH}#${memberPost._id}`);
		});

		it('goes back to the grid after opening a post from it', () => {
			cy.visit(GRID_PATH);

			tileFor(strangerPost._id).click();
			cy.location('pathname').should('eq', POSTS_PATH);

			cy.get('.posts-bar-back').then(($back) => $back[0].click());

			cy.location('pathname').should('eq', GRID_PATH);
			tileFor(strangerPost._id).should('exist');
		});
	});

	describe('a shared link to a deleted post', () => {
		it('opens the grid with the toast "This post no longer exists"', () => {
			cy.visit(`${POSTS_PATH}#${deletedPostId}`);

			cy.contains('.toast', 'This post no longer exists').should('be.visible');
			cy.location('pathname').should('eq', GRID_PATH);
			cy.get('.profile-post').should('have.length.at.least', 3);
		});

		it('opens the grid for a member too', () => {
			visitAsUser(`${POSTS_PATH}#${deletedPostId}`, memberToken);

			cy.contains('.toast', 'This post no longer exists').should('be.visible');
			cy.location('pathname').should('eq', GRID_PATH);
		});
	});

	describe('the layout', () => {
		Cypress._.each([300, 390, 768, 1440], (width) => {
			it(`shows a square 3-column grid with no horizontal scroll at ${width}`, () => {
				cy.viewport(width, 900);
				cy.visit(GRID_PATH);

				cy.get('.profile-post').should('have.length.at.least', 3);

				cy.get('.profile-post').should(($tiles) => {
					const [first, second, third] = Array.from($tiles).map((tile) => tile.getBoundingClientRect());

					expect(Math.abs(first.top - second.top)).to.be.lessThan(1);
					expect(Math.abs(first.top - third.top)).to.be.lessThan(1);
					expect(Math.abs(first.width - first.height)).to.be.lessThan(1);
				});

				cy.document().then((doc) => {
					expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
				});
			});
		});

		it('runs the grid edge to edge on mobile', () => {
			cy.viewport(390, 844);
			cy.visit(GRID_PATH);

			cy.get('.profile-post').should('have.length.at.least', 3);

			cy.get('.profile-post').should(($tiles) => {
				const [first, , third] = Array.from($tiles).map((tile) => tile.getBoundingClientRect());

				expect(first.left).to.be.lessThan(1);
				expect(Math.abs(third.right - 390)).to.be.lessThan(1);
			});
		});

		it('centres the grid in a column on desktop', () => {
			cy.viewport(1440, 900);
			cy.visit(GRID_PATH);

			cy.get('.profile-post').should('have.length.at.least', 3);

			cy.get('.popular-posts-grid').should(($grid) => {
				const { left, right } = $grid[0].getBoundingClientRect();

				expect(left).to.be.greaterThan(100);
				expect(Math.abs(left - (1440 - right))).to.be.lessThan(20);
			});
		});

		it('marks Popular as current in the guest tab bar at 390, on the grid and on the posts view', () => {
			cy.viewport(390, 844);
			cy.visit(GRID_PATH);

			cy.get('.tab-bar .tab-bar-item-active').should('contain.text', 'Popular');

			cy.visit(`${POSTS_PATH}#${strangerPost._id}`);

			cy.get('.tab-bar .tab-bar-item-active').should('contain.text', 'Popular');
		});
	});

	describe('infinite scroll', () => {
		const scroller = buildTestUser();

		let scrollerPosts;

		before(() => {
			createUserViaApi(scroller);

			let scrollerToken;

			loginViaApi(scroller).then((token) => {
				scrollerToken = token;
			});

			scrollerPosts = [];

			Cypress._.times(SCROLL_BATCH_POST_COUNT, (index) => {
				cy.then(() => uploadPostViaApi(scrollerToken, `scroll ${index}`)).then((post) => scrollerPosts.push(post));
			});
		});

		after(() => {
			cy.task('deleteTestUser', scroller.email);
		});

		it('loads a second batch of the grid when scrolling to the bottom, with no post repeated', () => {
			cy.intercept('POST', '**/user-posts/popular').as('nextBatch');

			cy.visit(GRID_PATH);

			cy.get('.profile-post').should('have.length.at.least', FIRST_BATCH_SIZE);

			cy.scrollTo('bottom');

			cy.wait('@nextBatch').then(({ request, response }) => {
				expect(response.statusCode).to.eq(200);
				expect(request.body.snapshotTime).to.be.a('string');
				expect(request.body.shownPostIds).to.have.length.at.least(FIRST_BATCH_SIZE);
			});

			cy.get('.profile-post').should('have.length.greaterThan', FIRST_BATCH_SIZE);

			cy.get('a.profile-post-link').then(($links) => {
				expectUnique(Array.from($links).map((link) => link.getAttribute('href')));
			});
		});

		it('loads a second batch in the posts view when scrolling to the bottom, with no post repeated', () => {
			cy.intercept('POST', '**/user-posts/popular').as('nextBatch');

			cy.visit(`${POSTS_PATH}#${scrollerPosts[0]._id}`);

			cy.get('.user-post').should('have.length.at.least', FIRST_BATCH_SIZE);

			cy.scrollTo('bottom');

			cy.wait('@nextBatch').its('response.statusCode').should('eq', 200);

			cy.get('.user-post').should('have.length.greaterThan', FIRST_BATCH_SIZE);

			cy.get('.user-post').then(($posts) => {
				expectUnique(Array.from($posts).map((post) => post.id));
			});
		});

		it('sends the ids already shown with each batch', () => {
			cy.intercept('POST', '**/user-posts/popular').as('nextBatch');

			cy.visit(GRID_PATH);

			cy.get('.profile-post').should('have.length.at.least', FIRST_BATCH_SIZE);

			cy.get('a.profile-post-link').then(($links) => {
				const shownIds = Array.from($links).map((link) => link.getAttribute('href').split('#')[1]);

				cy.scrollTo('bottom');

				cy.wait('@nextBatch').its('request.body.shownPostIds').should('deep.equal', shownIds);
			});
		});

		it('keeps both loaded batches, opening a second-batch post and going back, without requesting the page again', () => {
			cy.intercept('GET', '**/user-posts/popular*').as('firstPage');
			cy.intercept('POST', '**/user-posts/popular').as('nextBatch');

			cy.visit(GRID_PATH);

			cy.get('.profile-post').should('have.length.at.least', FIRST_BATCH_SIZE);

			cy.scrollTo('bottom');

			cy.wait('@nextBatch').its('response.statusCode').should('eq', 200);

			cy.get('.profile-post').should('have.length.greaterThan', FIRST_BATCH_SIZE);

			let firstPageRequestCount;

			cy.get('@firstPage.all').then((requests) => {
				firstPageRequestCount = requests.length;
			});

			cy.get('a.profile-post-link').then(($links) => {
				const loadedCount = $links.length;
				const secondBatchLink = $links[loadedCount - 1];
				const secondBatchPostId = secondBatchLink.getAttribute('href').split('#')[1];

				cy.wrap(secondBatchLink).scrollIntoView().click();

				cy.location('pathname').should('eq', POSTS_PATH);
				cy.location('hash').should('eq', `#${secondBatchPostId}`);
				cy.get(`[id="${secondBatchPostId}"]`).should('exist');
				expectPostInView(secondBatchPostId);
				cy.get('.user-post').should('have.length.at.least', loadedCount);

				cy.get('.posts-bar-back').then(($back) => $back[0].click());

				cy.location('pathname').should('eq', GRID_PATH);
				cy.get('.profile-post').should('have.length.at.least', loadedCount);
				tileFor(secondBatchPostId).should('exist');
			});

			cy.get('@firstPage.all').should(($requests) => {
				expect($requests).to.have.length(firstPageRequestCount);
			});
		});
	});
});
