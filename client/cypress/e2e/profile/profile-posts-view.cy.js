import { buildTestUser } from '../../support/testUser';
import {
	serverUrl,
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromToken,
	uploadPostViaApi,
	likePostViaApi,
	addCommentViaApi,
	getProfileViaApi,
} from '../../support/api';

describe('profile posts view', () => {
	const gridAuthor = buildTestUser();
	const soloAuthor = buildTestUser();
	const commenter = buildTestUser();

	let gridAuthorToken;
	let soloAuthorToken;
	let commenterToken;
	let gridAuthorId;
	let soloAuthorId;
	let gridPosts;
	let soloPost;

	const gridPath = () => `/user/${gridAuthorId}`;
	const soloPath = () => `/user/${soloAuthorId}`;

	const logInThroughForm = (user) => {
		cy.get('input#email').type(user.email);
		cy.get('input#password').type(user.password);
		cy.contains('button', 'Submit').click();
	};

	before(() => {
		createUserViaApi(gridAuthor);
		createUserViaApi(soloAuthor);
		createUserViaApi(commenter);

		loginViaApi(gridAuthor).then((token) => {
			gridAuthorToken = token;
			gridAuthorId = userIdFromToken(token);
		});

		loginViaApi(soloAuthor).then((token) => {
			soloAuthorToken = token;
			soloAuthorId = userIdFromToken(token);
		});

		loginViaApi(commenter).then((token) => {
			commenterToken = token;
		});

		gridPosts = [];

		cy.then(() => uploadPostViaApi(gridAuthorToken, 'grid oldest')).then((post) => gridPosts.push(post));
		cy.then(() => uploadPostViaApi(gridAuthorToken, 'grid middle')).then((post) => gridPosts.push(post));
		cy.then(() => uploadPostViaApi(gridAuthorToken, 'grid newest')).then((post) => gridPosts.push(post));

		cy.then(() => uploadPostViaApi(soloAuthorToken, 'solo caption')).then((post) => {
			soloPost = post;
		});

		cy.then(() => addCommentViaApi(commenterToken, soloPost._id, 'a readable comment'));
	});

	after(() => {
		cy.task('deleteTestUser', gridAuthor.email);
		cy.task('deleteTestUser', soloAuthor.email);
		cy.task('deleteTestUser', commenter.email);
	});

	describe('opening a post from the profile grid', () => {
		it('shows the grid newest first', () => {
			cy.visit(gridPath());

			cy.get('.profile-post').should('have.length', 3);
			cy.get('.profile-post-link').eq(0).should('have.attr', 'href').and('include', gridPosts[2]._id);
			cy.get('.profile-post-link').eq(2).should('have.attr', 'href').and('include', gridPosts[0]._id);
		});

		it('goes to the posts view with the post id in the hash and lists the posts newest first', () => {
			cy.visit(gridPath());

			cy.get('.profile-post-link').eq(1).click();

			cy.location('pathname').should('eq', `${gridPath()}/posts`);
			cy.location('hash').should('eq', `#${gridPosts[1]._id}`);

			cy.get('.user-post').should('have.length', 3);
			cy.get('.user-post').eq(0).should('contain.text', 'grid newest');
			cy.get('.user-post').eq(1).should('contain.text', 'grid middle');
			cy.get('.user-post').eq(2).should('contain.text', 'grid oldest');
		});

		it('opens scrolled to the clicked post', () => {
			cy.visit(gridPath());

			cy.get('.profile-post-link').eq(2).click();

			cy.location('hash').should('eq', `#${gridPosts[0]._id}`);

			cy.get(`[id="${gridPosts[0]._id}"]`).should(($post) => {
				const { top } = $post[0].getBoundingClientRect();

				expect(top).to.be.lessThan(Cypress.config('viewportHeight'));
				expect(top).to.be.greaterThan(-1);
			});
		});

		it('shows the Posts bar with the username and returns to the grid with the back chevron', () => {
			cy.visit(gridPath());

			cy.get('.profile-post-link').eq(1).click();

			cy.contains('.posts-bar .posts-bar-heading', 'Posts').should('be.visible');
			cy.contains('.posts-bar .posts-bar-username', gridAuthor.username).should('be.visible');

			cy.get('.posts-bar-back').click();

			cy.location('pathname').should('eq', gridPath());
			cy.get('.profile-post').should('have.length', 3);
		});

		it('sends the back chevron to the grid when the posts view is the first history entry', () => {
			cy.visit(`${gridPath()}/posts#${gridPosts[1]._id}`);

			cy.get('.posts-bar-back').click();

			cy.location('pathname').should('eq', gridPath());
			cy.get('.profile-post').should('have.length', 3);
		});

		it('loads the posts view from a shared link', () => {
			cy.visit(`${gridPath()}/posts#${gridPosts[1]._id}`);

			cy.get('.user-post').should('have.length', 3);
			cy.contains('.posts-bar .posts-bar-username', gridAuthor.username).should('be.visible');
		});
	});

	describe('as a guest', () => {
		it('reads the post and its comment count', () => {
			cy.visit(`${soloPath()}/posts#${soloPost._id}`);

			cy.get('.user-post').should('have.length', 1);
			cy.contains('.user-post', 'solo caption').should('be.visible');
			cy.contains('.user-post-comments-button', '1 comment').should('be.visible');
		});

		it('reads the comments in the comments popup', () => {
			cy.visit(`${soloPath()}/posts#${soloPost._id}`);

			cy.get('.user-post-comments-button').click();

			cy.contains('.comments-popup .comment-text', 'a readable comment').should('be.visible');
		});

		it('sends the guest to /log-in when liking, and back to the same URL after logging in', () => {
			cy.visit(`${soloPath()}/posts#${soloPost._id}`);

			cy.get('.user-post-like-button').click();

			cy.location('pathname').should('eq', '/log-in');

			logInThroughForm(commenter);

			cy.location('pathname').should('eq', `${soloPath()}/posts`);
			cy.location('hash').should('eq', `#${soloPost._id}`);
		});

		it('sends the guest to /log-in when clicking into the comment box, and back to the same URL', () => {
			cy.visit(`${soloPath()}/posts#${soloPost._id}`);

			cy.get('.user-post .add-comment-form-input').click();

			cy.location('pathname').should('eq', '/log-in');

			logInThroughForm(commenter);

			cy.location('pathname').should('eq', `${soloPath()}/posts`);
			cy.location('hash').should('eq', `#${soloPost._id}`);
		});

		it('sends the guest to /log-in when clicking into the comment box inside the comments popup', () => {
			cy.visit(`${soloPath()}/posts#${soloPost._id}`);

			cy.get('.user-post-comments-button').click();
			cy.get('.comments-popup .add-comment-form-input').click();

			cy.location('pathname').should('eq', '/log-in');
		});

		it('records no like for the guest', () => {
			cy.visit(`${soloPath()}/posts#${soloPost._id}`);

			cy.get('.user-post-like-button').click();

			cy.then(() => getProfileViaApi(soloAuthorId))
				.its('posts.0.likes')
				.should('have.length', 0);
		});
	});

	describe('on the own profile', () => {
		it('shows the post actions with Edit and Delete on every post', () => {
			visitAsUser(`${gridPath()}/posts#${gridPosts[1]._id}`, gridAuthorToken);

			cy.get('.user-post').should('have.length', 3);
			cy.get('.user-post-actions-button').should('have.length', 3);

			cy.get('.user-post-actions-button').eq(0).click();

			cy.contains('.post-actions-menu button', 'Edit').should('be.visible');
			cy.contains('.post-actions-menu button', 'Delete').should('be.visible');
		});

		it("shows no post actions on another user's posts view", () => {
			visitAsUser(`${gridPath()}/posts#${gridPosts[1]._id}`, commenterToken);

			cy.get('.user-post').should('have.length', 3);
			cy.get('.user-post-actions-button').should('not.exist');
		});
	});

	describe('liking a post twice quickly', () => {
		it('records one like when the like button is double-clicked', () => {
			visitAsUser(`${soloPath()}/posts#${soloPost._id}`, commenterToken);

			cy.intercept('POST', '**/user-posts/like/**').as('likeRequest');

			cy.get('.user-post-like-button').dblclick();

			cy.wait('@likeRequest');

			cy.then(() => getProfileViaApi(soloAuthorId))
				.its('posts.0.likes')
				.should('have.length', 1);
		});

		it('records one like when the server receives the like request twice', () => {
			cy.then(() => likePostViaApi(soloAuthorToken, soloPost._id));
			cy.then(() => likePostViaApi(soloAuthorToken, soloPost._id));

			cy.request({ method: 'GET', url: `${serverUrl}/users?userIds=${soloAuthorId}` }).then((response) => {
				const likes = response.body[0].posts[0].likes;

				expect(likes.filter((likerId) => likerId === soloAuthorId)).to.have.length(1);
			});
		});
	});
});
