import { buildTestUser } from '../../support/testUser';
import {
	createUserViaApi,
	loginViaApi,
	userIdFromSession,
	uploadPostViaApi,
	deletePostViaApi,
	addCommentViaApi,
	getCommentsViaApi,
	getProfileViaApi,
	getUnreadNotificationCountViaApi,
} from '../../support/api';

describe('test user cleanup', () => {
	const owner = buildTestUser();
	const replier = buildTestUser();

	let ownerSession;
	let replierSession;
	let post;

	const readCommentsCount = () =>
		getProfileViaApi(userIdFromSession(ownerSession), ownerSession).then(
			(profile) => profile.posts.find((profilePost) => profilePost._id === post._id).commentsCount,
		);

	const readOwnerState = () =>
		readCommentsCount().then((commentsCount) =>
			getUnreadNotificationCountViaApi(ownerSession).then((unreadNotifications) => ({ commentsCount, unreadNotifications })),
		);

	const readCommentTexts = () =>
		getCommentsViaApi(post._id).then((comments) => comments.flatMap((comment) => [comment.text, ...comment.replies.map((reply) => reply.text)]));

	const signUpCommenter = () => {
		const commenter = buildTestUser();

		createUserViaApi(commenter);

		return loginViaApi(commenter).then((session) => ({ commenter, session }));
	};

	before(() => {
		createUserViaApi(owner);
		createUserViaApi(replier);

		loginViaApi(owner).then((session) => {
			ownerSession = session;
		});

		loginViaApi(replier).then((session) => {
			replierSession = session;
		});

		cy.then(() => uploadPostViaApi(ownerSession, 'post that outlives its commenters')).then((uploadedPost) => {
			post = uploadedPost;
		});
	});

	after(() => {
		cy.then(() => {
			if (ownerSession && post) {
				return deletePostViaApi(ownerSession, post._id, false);
			}
		});
		cy.task('deleteTestUser', owner.email);
		cy.task('deleteTestUser', replier.email);
	});

	it('returns the comment count of a surviving post to its starting value when the commenter is removed', () => {
		const commentText = 'comment from a user about to be removed';
		let baseline;
		let commenter;

		readOwnerState().then((state) => {
			baseline = state;
		});

		signUpCommenter().then((account) => {
			commenter = account.commenter;

			return addCommentViaApi(account.session, post._id, commentText);
		});

		cy.then(() => readOwnerState()).then((state) => {
			expect(state.commentsCount).to.eq(baseline.commentsCount + 1);
			expect(state.unreadNotifications).to.eq(baseline.unreadNotifications + 1);
		});

		cy.then(() => cy.task('deleteTestUser', commenter.email));

		cy.then(() => readOwnerState()).then((state) => {
			expect(state).to.deep.eq(baseline);
		});
		cy.then(() => readCommentTexts()).then((texts) => {
			expect(texts).not.to.include(commentText);
		});
	});

	it('also removes a reply from a surviving user under the removed commenter and lowers the count for both', () => {
		const commentText = 'comment that will be replied to';
		const replyText = 'reply from a user who stays';
		let baseline;
		let commenter;

		readOwnerState().then((state) => {
			baseline = state;
		});

		signUpCommenter()
			.then((account) => {
				commenter = account.commenter;

				return addCommentViaApi(account.session, post._id, commentText);
			})
			.then((comment) => addCommentViaApi(replierSession, post._id, replyText, { parentCommentId: comment._id }));

		cy.then(() => readOwnerState()).then((state) => {
			expect(state.commentsCount).to.eq(baseline.commentsCount + 2);
			expect(state.unreadNotifications).to.eq(baseline.unreadNotifications + 2);
		});

		cy.then(() => cy.task('deleteTestUser', commenter.email));

		cy.then(() => readOwnerState()).then((state) => {
			expect(state).to.deep.eq(baseline);
		});
		cy.then(() => readCommentTexts()).then((texts) => {
			expect(texts).not.to.include(commentText);
			expect(texts).not.to.include(replyText);
		});
	});

	it('lowers the count only by the removed comments and keeps a surviving user own comment', () => {
		const survivingText = 'comment from a user who stays';
		const removedText = 'comment from a user about to be removed too';
		let baseline;
		let commenter;

		readOwnerState().then((state) => {
			baseline = state;
		});

		cy.then(() => addCommentViaApi(replierSession, post._id, survivingText));

		signUpCommenter().then((account) => {
			commenter = account.commenter;

			return addCommentViaApi(account.session, post._id, removedText);
		});

		cy.then(() => readCommentsCount()).then((count) => {
			expect(count).to.eq(baseline.commentsCount + 2);
		});

		cy.then(() => cy.task('deleteTestUser', commenter.email));

		cy.then(() => readCommentsCount()).then((count) => {
			expect(count).to.eq(baseline.commentsCount + 1);
		});
		cy.then(() => readCommentTexts()).then((texts) => {
			expect(texts).to.include(survivingText);
			expect(texts).not.to.include(removedText);
		});
	});
});
