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
	getCommentsViaApi,
	deletePostViaApi,
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

			cy.get('.posts-bar-back').then(($back) => $back[0].click());

			cy.location('pathname').should('eq', gridPath());
			cy.get('.profile-post').should('have.length', 3);
		});

		it('sends the back chevron to the grid when the posts view is the first history entry', () => {
			cy.visit(`${gridPath()}/posts#${gridPosts[1]._id}`);

			cy.get('.posts-bar-back').then(($back) => $back[0].click());

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

		it('shows Post disabled in the post card and in the comments popup', () => {
			cy.visit(`${soloPath()}/posts#${soloPost._id}`);

			cy.get('.user-post .add-comment-form-submit').should('be.disabled');

			cy.get('.user-post-comments-button').click();

			cy.get('.comments-popup .add-comment-form-submit').should('be.disabled');
		});

		it('sends the guest to /log-in when clicking Reply in the comments popup', () => {
			cy.visit(`${soloPath()}/posts#${soloPost._id}`);

			cy.get('.user-post-comments-button').click();
			cy.contains('.comments-popup .comment-util-button', 'Reply').click();

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

	describe('the Posts bar while scrolling', () => {
		it('scrolls away with the list on desktop instead of staying at the top', () => {
			cy.visit(`${gridPath()}/posts`);

			cy.get('.user-post').should('have.length', 3);
			cy.get('.posts-bar').should('be.visible').and('not.have.css', 'position', 'sticky').and('not.have.css', 'position', 'fixed');

			cy.scrollTo('bottom');

			cy.get('.posts-bar').should(($bar) => {
				expect($bar[0].getBoundingClientRect().bottom).to.be.lessThan(0);
			});
		});

		it('does not slide away on desktop when scrolling down', () => {
			cy.visit(`${gridPath()}/posts`);

			cy.get('.user-post').should('have.length', 3);

			cy.scrollTo(0, 600);
			cy.scrollTo(0, 1200);

			cy.get('.posts-bar').should('have.css', 'transform', 'none');
		});

		it('hides on mobile when scrolling down and reappears when scrolling up', () => {
			cy.viewport(390, 844);
			cy.visit(`${gridPath()}/posts`);

			cy.get('.user-post').should('have.length', 3);
			cy.get('.posts-bar').should('have.css', 'position', 'fixed').and('not.have.class', 'posts-bar-hidden');

			cy.scrollTo(0, 900);

			cy.get('.posts-bar').should('have.class', 'posts-bar-hidden');
			cy.get('.posts-bar').should(($bar) => {
				expect($bar[0].getBoundingClientRect().bottom).to.be.at.most(0);
			});

			cy.scrollTo(0, 500);

			cy.get('.posts-bar').should('not.have.class', 'posts-bar-hidden');
			cy.get('.posts-bar').should(($bar) => {
				expect($bar[0].getBoundingClientRect().top).to.be.at.least(0);
			});
		});

		it('shows the bar again on mobile when the page is back at the top', () => {
			cy.viewport(390, 844);
			cy.visit(`${gridPath()}/posts`);

			cy.get('.user-post').should('have.length', 3);

			cy.scrollTo(0, 900);
			cy.get('.posts-bar').should('have.class', 'posts-bar-hidden');

			cy.scrollTo('top');

			cy.get('.posts-bar').should('not.have.class', 'posts-bar-hidden');
		});
	});

	describe('replying to comments', () => {
		const replyAuthor = buildTestUser();

		let replyAuthorToken;
		let replyAuthorId;
		let commenterId;
		let replyPost;

		const replyPath = () => `/user/${replyAuthorId}/posts#${replyPost._id}`;

		const openCommentsPopup = (token) => {
			visitAsUser(replyPath(), token);

			cy.get('.user-post-comments-button').click();
		};

		const topComment = (text) => cy.contains('.comments-popup .comment:not(.comment-reply)', text);

		const replyButtonOf = ($comment) => cy.wrap($comment).children('.comment-row').contains('button', 'Reply');

		const postReplyFrom = (replyButton, text) => {
			replyButton.click();

			cy.get('.comments-popup input[placeholder="Write a reply..."]').type(text);
			cy.get('.comments-popup .comment .add-comment-form-submit').click();
		};

		before(() => {
			createUserViaApi(replyAuthor);

			loginViaApi(replyAuthor).then((token) => {
				replyAuthorToken = token;
				replyAuthorId = userIdFromToken(token);
				commenterId = userIdFromToken(commenterToken);
			});

			cy.then(() => uploadPostViaApi(replyAuthorToken, 'reply caption')).then((post) => {
				replyPost = post;
			});
		});

		after(() => {
			cy.then(() => deletePostViaApi(replyAuthorToken, replyPost._id, false));
			cy.task('deleteTestUser', replyAuthor.email);
		});

		it('prefills the reply box with the @username of the author and keeps Post disabled until text follows', () => {
			cy.then(() => addCommentViaApi(commenterToken, replyPost._id, 'top prefill'));

			openCommentsPopup(replyAuthorToken);

			topComment('top prefill').then(($comment) => {
				replyButtonOf($comment).click();
			});

			cy.get('.comments-popup input[placeholder="Write a reply..."]').should('have.value', `@${commenter.username} `);
			cy.get('.comments-popup .comment .add-comment-form-submit').should('be.disabled');

			cy.get('.comments-popup input[placeholder="Write a reply..."]').type('thanks');

			cy.get('.comments-popup .comment .add-comment-form-submit').should('be.enabled');
		});

		it('keeps Post disabled when only spaces follow the mention', () => {
			cy.then(() => addCommentViaApi(commenterToken, replyPost._id, 'top spaces'));

			openCommentsPopup(replyAuthorToken);

			topComment('top spaces').then(($comment) => {
				replyButtonOf($comment).click();
			});

			cy.get('.comments-popup input[placeholder="Write a reply..."]').type('   ');

			cy.get('.comments-popup .comment .add-comment-form-submit').should('be.disabled');
		});

		it('posts a reply that shows the mention as a link to the profile of the replied-to user', () => {
			cy.then(() => addCommentViaApi(commenterToken, replyPost._id, 'top mention'));

			openCommentsPopup(replyAuthorToken);

			topComment('top mention').then(($comment) => {
				postReplyFrom(replyButtonOf($comment), 'thanks for the mention');
			});

			cy.contains('.comments-popup .comment-reply .comment-text', 'thanks for the mention').should('be.visible');
			cy.get('.comments-popup .comment-reply .comment-mention')
				.should('have.text', `@${commenter.username}`)
				.and('have.attr', 'href', `/user/${commenterId}`);
		});

		it('posts a reply without the mention as a plain reply, with no link', () => {
			cy.then(() => addCommentViaApi(commenterToken, replyPost._id, 'top plain'));

			openCommentsPopup(replyAuthorToken);

			topComment('top plain').then(($comment) => {
				replyButtonOf($comment).click();
			});

			cy.get('.comments-popup input[placeholder="Write a reply..."]').clear().type('just a plain reply');
			cy.get('.comments-popup .comment .add-comment-form-submit').click();

			cy.contains('.comments-popup .comment-reply .comment-text', 'just a plain reply').should('be.visible');
			cy.get('.comments-popup .comment-reply .comment-mention').should('not.exist');
		});

		it('replies to a reply under the top-level comment, mentioning the author of that reply', () => {
			cy.then(() => addCommentViaApi(commenterToken, replyPost._id, 'top nested')).then((top) => {
				cy.then(() =>
					addCommentViaApi(replyAuthorToken, replyPost._id, `@${commenter.username} first reply`, {
						parentCommentId: top._id,
						mentionedUserId: commenterId,
					}),
				);

				openCommentsPopup(commenterToken);

				topComment('top nested').contains('button', 'View replies').click();

				cy.contains('.comments-popup .comment-reply', 'first reply').contains('button', 'Reply').click();

				cy.get('.comments-popup input[placeholder="Write a reply..."]')
					.should('have.value', `@${replyAuthor.username} `)
					.type('second reply');
				cy.get('.comments-popup .comment .add-comment-form-submit').click();

				cy.contains('.comments-popup .comment-reply .comment-text', 'second reply').should('be.visible');

				cy.then(() => getCommentsViaApi(replyPost._id)).then((comments) => {
					const savedTop = comments.find((comment) => comment._id === top._id);
					const savedSecond = savedTop.replies.find((reply) => reply.text.endsWith('second reply'));

					expect(savedTop.replies).to.have.length(2);
					expect(savedSecond.parentCommentId).to.eq(top._id);
					expect(savedSecond.mentionedUserId.username).to.eq(replyAuthor.username);
				});
			});
		});

		it('lets a guest follow the mention link and see Post disabled', () => {
			cy.then(() => addCommentViaApi(commenterToken, replyPost._id, 'top guest')).then((top) => {
				cy.then(() =>
					addCommentViaApi(replyAuthorToken, replyPost._id, `@${commenter.username} hello guest`, {
						parentCommentId: top._id,
						mentionedUserId: commenterId,
					}),
				);
			});

			cy.visit(replyPath());
			cy.get('.user-post-comments-button').click();

			topComment('top guest').contains('button', 'View replies').click();

			cy.contains('.comments-popup .comment-reply', 'hello guest').find('.comment-mention').should('have.attr', 'href', `/user/${commenterId}`);
			cy.get('.comments-popup .add-comment-form-submit').should('be.disabled');
		});

		describe('the server', () => {
			const addReplyWithMention = (top, text, mentionedUserId) =>
				cy.then(() => addCommentViaApi(replyAuthorToken, replyPost._id, text, { parentCommentId: top._id, mentionedUserId }));

			it('saves the mentioned user, with the username, only when the reply starts with their @username', () => {
				cy.then(() => addCommentViaApi(commenterToken, replyPost._id, 'top api')).then((top) => {
					addReplyWithMention(top, `@${commenter.username} yes`, commenterId).then((reply) => {
						expect(reply.mentionedUserId.username).to.eq(commenter.username);
					});

					addReplyWithMention(top, 'no mention at the start', commenterId).then((reply) => {
						expect(reply.mentionedUserId).to.eq(null);
					});

					addReplyWithMention(top, '@someone_else not them', commenterId).then((reply) => {
						expect(reply.mentionedUserId).to.eq(null);
					});
				});
			});

			it('saves a plain reply, without an error, for an unknown or malformed user id', () => {
				cy.then(() => addCommentViaApi(commenterToken, replyPost._id, 'top api invalid')).then((top) => {
					addReplyWithMention(top, `@${commenter.username} unknown`, '64b7f0a1c2d3e4f5a6b7c8d2').then((reply) => {
						expect(reply.mentionedUserId).to.eq(null);
					});

					addReplyWithMention(top, `@${commenter.username} malformed`, 'not-an-object-id').then((reply) => {
						expect(reply.mentionedUserId).to.eq(null);
					});
				});
			});

			it('saves no mentioned user on a top-level comment', () => {
				cy.then(() =>
					addCommentViaApi(commenterToken, replyPost._id, `@${commenter.username} top level`, { mentionedUserId: commenterId }),
				).then((comment) => {
					expect(comment.mentionedUserId).to.eq(null);
				});
			});
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
