import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	visitAsUser,
	userIdFromToken,
	uploadPostViaApi,
	likePostViaApi,
	addCommentViaApi,
	likeCommentViaApi,
	deletePostViaApi,
} from '../../support/api';

describe('likes list popup', () => {
	const author = buildTestUser();
	const firstLiker = buildTestUser();
	const secondLiker = buildTestUser();
	const viewer = buildTestUser();

	let authorToken;
	let viewerToken;
	let firstLikerId;
	let secondLikerId;
	let likedPost;
	let unlikedPost;
	let likedComment;

	const likedPostCaption = 'post with likes';
	const unlikedPostCaption = 'post without likes';
	const likedCommentText = 'comment with likes';
	const unlikedCommentText = 'comment without likes';

	const postsPath = () => `/user/${userIdFromToken(authorToken)}/posts#${likedPost._id}`;

	const likedPostCard = () => cy.contains('.user-post', likedPostCaption);

	const likesPopup = () => cy.get('.user-list-popup');

	const likesRows = () => cy.get('.user-list-popup .user-list-results .search-result');

	const commentsPopup = () => cy.get('.comments-popup');

	const openPostLikes = () => {
		likedPostCard().find('.user-post-likes-button').click();
	};

	const openCommentsAndCommentLikes = () => {
		likedPostCard().find('.user-post-comments-button').click();

		cy.contains('.comments-popup .comment', likedCommentText).contains('button', '2 likes').click();
	};

	before(() => {
		createUserViaApi(author);
		createUserViaApi(firstLiker);
		createUserViaApi(secondLiker);
		createUserViaApi(viewer);

		let firstLikerToken;
		let secondLikerToken;

		loginViaApi(author).then((token) => {
			authorToken = token;
		});

		loginViaApi(firstLiker).then((token) => {
			firstLikerToken = token;
			firstLikerId = userIdFromToken(token);
		});

		loginViaApi(secondLiker).then((token) => {
			secondLikerToken = token;
			secondLikerId = userIdFromToken(token);
		});

		loginViaApi(viewer).then((token) => {
			viewerToken = token;
		});

		cy.then(() => uploadPostViaApi(authorToken, likedPostCaption)).then((post) => {
			likedPost = post;
		});

		cy.then(() => uploadPostViaApi(authorToken, unlikedPostCaption)).then((post) => {
			unlikedPost = post;
		});

		cy.then(() => likePostViaApi(firstLikerToken, likedPost._id));
		cy.then(() => likePostViaApi(secondLikerToken, likedPost._id));

		cy.then(() => addCommentViaApi(authorToken, likedPost._id, likedCommentText)).then((comment) => {
			likedComment = comment;
		});

		cy.then(() => addCommentViaApi(authorToken, likedPost._id, unlikedCommentText));

		cy.then(() => likeCommentViaApi(firstLikerToken, likedComment._id));
		cy.then(() => likeCommentViaApi(secondLikerToken, likedComment._id));
	});

	after(() => {
		cy.then(() => deletePostViaApi(authorToken, likedPost._id, false));
		cy.then(() => deletePostViaApi(authorToken, unlikedPost._id, false));
		cy.task('deleteTestUser', author.email);
		cy.task('deleteTestUser', firstLiker.email);
		cy.task('deleteTestUser', secondLiker.email);
		cy.task('deleteTestUser', viewer.email);
	});

	describe('from a post', () => {
		it('opens from the likes label and lists the accounts that liked it, newest like first', () => {
			visitAsUser(postsPath(), viewerToken);

			openPostLikes();

			cy.contains('.user-list-popup .popup-title', 'Likes').should('be.visible');
			likesRows().should('have.length', 2);
			likesRows().eq(0).should('contain.text', secondLiker.username);
			likesRows().eq(1).should('contain.text', firstLiker.username);
			likesRows().each(($row) => {
				cy.wrap($row).find('.search-result-avatar').should('be.visible');
			});
			cy.get('.user-list-results .search-result-followers').should('not.exist');
		});

		it('opens that profile and closes the popup when an account is clicked', () => {
			visitAsUser(postsPath(), viewerToken);

			openPostLikes();
			cy.contains('.user-list-results .search-result', firstLiker.username).click();

			cy.location('pathname').should('eq', `/user/${firstLikerId}`);
			cy.contains('.profile-header .username', firstLiker.username).should('be.visible');
			likesPopup().should('not.exist');
		});

		it('closes with the close button and leaves the post in place', () => {
			visitAsUser(postsPath(), viewerToken);

			openPostLikes();
			cy.get('.user-list-popup .popup-close').click();

			likesPopup().should('not.exist');
			likedPostCard().should('be.visible');
		});

		it('closes with Escape', () => {
			visitAsUser(postsPath(), viewerToken);

			openPostLikes();
			likesPopup().should('be.visible');
			cy.get('body').type('{esc}');

			likesPopup().should('not.exist');
		});

		it('does not make a post with no likes clickable', () => {
			visitAsUser(postsPath(), viewerToken);

			cy.contains('.user-post', unlikedPostCaption).within(() => {
				cy.contains('0 likes').should('be.visible');
				cy.get('.user-post-likes-button').should('not.exist');
				cy.contains('0 likes').click();
			});

			likesPopup().should('not.exist');
		});

		it('opens for a guest without sending them to log in', () => {
			cy.visit(postsPath());

			openPostLikes();

			likesPopup().should('be.visible');
			likesRows().should('have.length', 2);
			cy.location('pathname').should('not.eq', '/log-in');
		});
	});

	describe('from a comment, inside the comments popup', () => {
		it('opens over the comments popup and lists the accounts that liked the comment, newest like first', () => {
			visitAsUser(postsPath(), viewerToken);

			openCommentsAndCommentLikes();

			cy.contains('.user-list-popup .popup-title', 'Likes').should('be.visible');
			commentsPopup().should('be.visible');
			likesRows().should('have.length', 2);
			likesRows().eq(0).should('contain.text', secondLiker.username);
			likesRows().eq(1).should('contain.text', firstLiker.username);
		});

		it('closes both popups and opens the profile when an account is clicked', () => {
			visitAsUser(postsPath(), viewerToken);

			openCommentsAndCommentLikes();
			cy.contains('.user-list-results .search-result', secondLiker.username).click();

			cy.location('pathname').should('eq', `/user/${secondLikerId}`);
			cy.contains('.profile-header .username', secondLiker.username).should('be.visible');
			likesPopup().should('not.exist');
			commentsPopup().should('not.exist');
		});

		it('closes only the likes popup on Escape, then the comments popup on the next Escape', () => {
			visitAsUser(postsPath(), viewerToken);

			openCommentsAndCommentLikes();
			likesPopup().should('be.visible');
			cy.get('body').type('{esc}');

			likesPopup().should('not.exist');
			commentsPopup().should('be.visible');
			cy.contains('.comments-popup .comment', likedCommentText).should('be.visible');

			cy.get('body').type('{esc}');

			commentsPopup().should('not.exist');
		});

		it('returns to the comments when the likes popup is closed with its close button', () => {
			visitAsUser(postsPath(), viewerToken);

			openCommentsAndCommentLikes();
			cy.get('.user-list-popup .popup-close').click();

			likesPopup().should('not.exist');
			commentsPopup().should('be.visible');
			cy.contains('.comments-popup .comment', likedCommentText).should('be.visible');
		});

		it('does not make a comment with no likes clickable', () => {
			visitAsUser(postsPath(), viewerToken);

			likedPostCard().find('.user-post-comments-button').click();

			cy.contains('.comments-popup .comment', unlikedCommentText).within(() => {
				cy.contains('0 likes').should('be.visible');
				cy.contains('button', '0 likes').should('not.exist');
				cy.contains('0 likes').click();
			});

			likesPopup().should('not.exist');
		});

		it('opens for a guest without sending them to log in', () => {
			cy.visit(postsPath());

			openCommentsAndCommentLikes();

			likesPopup().should('be.visible');
			likesRows().should('have.length', 2);
			cy.location('pathname').should('not.eq', '/log-in');
		});
	});
});
