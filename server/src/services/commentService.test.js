jest.mock('../models/commentModel');
jest.mock('../models/userPostModel');
jest.mock('../models/userModel');
jest.mock('./userRowService');

const CommentModel = require('../models/commentModel');
const UserPostModel = require('../models/userPostModel');
const UserModel = require('../models/userModel');
const { ERROR_CODES } = require('../config/errorCodes');
const { getUserRowsInOrder } = require('./userRowService');
const {
	addComment,
	getCommentsForPost,
	likeComment,
	unlikeComment,
	getCommentLikes,
	getPreviewCommentsForPosts,
	deleteCommentsForPost,
} = require('./commentService');

const POST_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
const COMMENT_ID = '64b7f0a1c2d3e4f5a6b7c8f1';
const PARENT_ID = '64b7f0a1c2d3e4f5a6b7c8f2';
const USER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const MENTIONED_ID = '64b7f0a1c2d3e4f5a6b7c8d2';
const AUTHOR_POPULATE = { path: 'userId', select: 'username profilePicture' };
const MENTIONED_USER_POPULATE = { path: 'mentionedUserId', select: 'username' };

describe('commentService', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('addComment', () => {
		const buildCommentModelMock = ({ save = jest.fn().mockResolvedValue(undefined), populate = jest.fn().mockResolvedValue(undefined) } = {}) => {
			CommentModel.mockImplementation(function CommentModelMock(data) {
				Object.assign(this, data);
				this.save = save;
				this.populate = populate;
			});

			return { save, populate };
		};

		const givenPostExists = (exists = true) => {
			UserPostModel.exists = jest.fn().mockResolvedValue(exists ? { _id: POST_ID } : null);
		};

		const givenParentExists = (exists = true) => {
			CommentModel.exists = jest.fn().mockResolvedValue(exists ? { _id: PARENT_ID } : null);
		};

		const givenMentionedUser = (user) => {
			const select = jest.fn().mockResolvedValue(user);

			UserModel.findById = jest.fn().mockReturnValue({ select });

			return { select };
		};

		describe('the comment text', () => {
			it.each([[''], ['   '], ['\n\t '], [undefined], [null], [42], [{}]])(
				'rejects %p with a 400 COMMENT_TEXT_REQUIRED, looking nothing up and saving nothing',
				async (text) => {
					givenPostExists();
					buildCommentModelMock();

					await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text })).rejects.toMatchObject({
						statusCode: 400,
						code: ERROR_CODES.COMMENT_TEXT_REQUIRED,
					});

					expect(UserPostModel.exists).not.toHaveBeenCalled();
					expect(CommentModel).not.toHaveBeenCalled();
				},
			);

			it('rejects an empty reply the same way', async () => {
				givenPostExists();
				givenParentExists();
				buildCommentModelMock();

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: '  ', parentCommentId: PARENT_ID })).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.COMMENT_TEXT_REQUIRED,
				});
			});

			it('saves the text without surrounding spaces', async () => {
				givenPostExists();
				buildCommentModelMock();

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: '  Nice shot  ' });

				expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ text: 'Nice shot' }));
			});
		});

		describe('the post', () => {
			it('rejects a malformed post id with a 404 POST_NOT_FOUND, without querying the database or saving', async () => {
				UserPostModel.exists = jest.fn();
				buildCommentModelMock();

				await expect(addComment({ userPostId: 'not-an-object-id', userId: USER_ID, text: 'Hi' })).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.POST_NOT_FOUND,
				});

				expect(UserPostModel.exists).not.toHaveBeenCalled();
				expect(CommentModel).not.toHaveBeenCalled();
			});

			it('rejects a post that does not exist with a 404 POST_NOT_FOUND and saves no orphaned comment', async () => {
				givenPostExists(false);
				const { save } = buildCommentModelMock();

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Hi' })).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.POST_NOT_FOUND,
				});

				expect(UserPostModel.exists).toHaveBeenCalledWith({ _id: POST_ID });
				expect(save).not.toHaveBeenCalled();
			});
		});

		describe('the parent comment of a reply', () => {
			it('rejects a malformed parent id with a 404 COMMENT_NOT_FOUND, without saving', async () => {
				givenPostExists();
				CommentModel.exists = jest.fn();
				const { save } = buildCommentModelMock();

				await expect(
					addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Hi', parentCommentId: 'not-an-object-id' }),
				).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.COMMENT_NOT_FOUND,
				});

				expect(CommentModel.exists).not.toHaveBeenCalled();
				expect(save).not.toHaveBeenCalled();
			});

			it('rejects a parent that is missing, on another post, or itself a reply with a 404 COMMENT_NOT_FOUND, without saving', async () => {
				givenPostExists();
				givenParentExists(false);
				const { save } = buildCommentModelMock();

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Hi', parentCommentId: PARENT_ID })).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.COMMENT_NOT_FOUND,
				});

				expect(CommentModel.exists).toHaveBeenCalledWith({ _id: PARENT_ID, userPostId: POST_ID, parentCommentId: null });
				expect(save).not.toHaveBeenCalled();
			});

			it('looks for a parent that is a top-level comment on the same post', async () => {
				givenPostExists();
				givenParentExists();
				buildCommentModelMock();

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Thanks', parentCommentId: PARENT_ID });

				expect(CommentModel.exists).toHaveBeenCalledTimes(1);
				expect(CommentModel.exists).toHaveBeenCalledWith({ _id: PARENT_ID, userPostId: POST_ID, parentCommentId: null });
			});

			it('checks the post before the parent, so a missing post is reported as POST_NOT_FOUND', async () => {
				givenPostExists(false);
				CommentModel.exists = jest.fn();
				buildCommentModelMock();

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Hi', parentCommentId: PARENT_ID })).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.POST_NOT_FOUND,
				});

				expect(CommentModel.exists).not.toHaveBeenCalled();
			});

			it('wraps a failing parent lookup in a 500 AppError that keeps the cause', async () => {
				const lookupError = new Error('connection lost');

				givenPostExists();
				CommentModel.exists = jest.fn().mockRejectedValue(lookupError);
				const { save } = buildCommentModelMock();

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Hi', parentCommentId: PARENT_ID })).rejects.toMatchObject({
					statusCode: 500,
					cause: lookupError,
				});

				expect(save).not.toHaveBeenCalled();
			});

			it('does not look for a parent when the comment is not a reply', async () => {
				givenPostExists();
				CommentModel.exists = jest.fn();
				buildCommentModelMock();

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Hi' });

				expect(CommentModel.exists).not.toHaveBeenCalled();
			});
		});

		describe('the mentioned user of a reply', () => {
			const sendReply = (overrides = {}) =>
				addComment({
					userPostId: POST_ID,
					userId: USER_ID,
					parentCommentId: PARENT_ID,
					text: '@bob thanks',
					mentionedUserId: MENTIONED_ID,
					...overrides,
				});

			beforeEach(() => {
				givenPostExists();
				givenParentExists();
				buildCommentModelMock();
			});

			it('saves the id when the user exists and the reply starts with their @username', async () => {
				const { select } = givenMentionedUser({ _id: MENTIONED_ID, username: 'bob' });

				await sendReply();

				expect(UserModel.findById).toHaveBeenCalledWith(MENTIONED_ID);
				expect(select).toHaveBeenCalledWith({ username: 1 });
				expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserId: MENTIONED_ID }));
			});

			it('still saves the id when the reply is only the mention', async () => {
				givenMentionedUser({ _id: MENTIONED_ID, username: 'bob' });

				await sendReply({ text: '@bob' });

				expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserId: MENTIONED_ID }));
			});

			it('checks the mention against the trimmed text', async () => {
				givenMentionedUser({ _id: MENTIONED_ID, username: 'bob' });

				await sendReply({ text: '   @bob thanks  ' });

				expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ text: '@bob thanks', mentionedUserId: MENTIONED_ID }));
			});

			it('saves null, with no error, when the user id is unknown', async () => {
				givenMentionedUser(null);

				await expect(sendReply()).resolves.toBeDefined();

				expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserId: null }));
			});

			it('saves null, with no error and no lookup, when the user id is malformed', async () => {
				givenMentionedUser({ _id: MENTIONED_ID, username: 'bob' });

				await expect(sendReply({ mentionedUserId: 'not-an-object-id' })).resolves.toBeDefined();

				expect(UserModel.findById).not.toHaveBeenCalled();
				expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserId: null }));
			});

			it.each([[undefined], [null], [''], [42], [{}]])(
				'saves null, with no error and no lookup, when the user id is %p',
				async (mentionedUserId) => {
					givenMentionedUser({ _id: MENTIONED_ID, username: 'bob' });

					await expect(sendReply({ mentionedUserId })).resolves.toBeDefined();

					expect(UserModel.findById).not.toHaveBeenCalled();
					expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserId: null }));
				},
			);

			it('saves null, with no error, when the reply starts with a different @name', async () => {
				givenMentionedUser({ _id: MENTIONED_ID, username: 'alice' });

				await expect(sendReply({ text: '@bob thanks' })).resolves.toBeDefined();

				expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserId: null }));
			});

			it('saves null when the mention was removed from the start of the reply', async () => {
				givenMentionedUser({ _id: MENTIONED_ID, username: 'bob' });

				await sendReply({ text: 'thanks @bob' });

				expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserId: null }));
			});

			it('saves null for a top-level comment even when a user id is sent, without looking the user up', async () => {
				givenMentionedUser({ _id: MENTIONED_ID, username: 'bob' });

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: '@bob hi', mentionedUserId: MENTIONED_ID });

				expect(UserModel.findById).not.toHaveBeenCalled();
				expect(CommentModel).toHaveBeenCalledWith(expect.objectContaining({ parentCommentId: null, mentionedUserId: null }));
			});

			it('wraps a failing user lookup in a 500 AppError that keeps the cause', async () => {
				const lookupError = new Error('connection lost');

				UserModel.findById = jest.fn().mockReturnValue({ select: jest.fn().mockRejectedValue(lookupError) });

				await expect(sendReply()).rejects.toMatchObject({ statusCode: 500, cause: lookupError });
			});
		});

		describe('saving', () => {
			it('saves a top-level comment by the user on the post, with no parent', async () => {
				givenPostExists();
				const { save } = buildCommentModelMock();

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' });

				expect(CommentModel).toHaveBeenCalledWith({
					userPostId: POST_ID,
					userId: USER_ID,
					text: 'Nice shot',
					parentCommentId: null,
					mentionedUserId: null,
				});
				expect(save).toHaveBeenCalledTimes(1);
			});

			it('saves a reply with the id of its parent comment', async () => {
				givenPostExists();
				givenParentExists();
				buildCommentModelMock();

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Thanks', parentCommentId: PARENT_ID });

				expect(CommentModel).toHaveBeenCalledWith({
					userPostId: POST_ID,
					userId: USER_ID,
					text: 'Thanks',
					parentCommentId: PARENT_ID,
					mentionedUserId: null,
				});
			});

			it('populates only the username and profile picture of the author, and only the username of the mentioned user', async () => {
				givenPostExists();
				const { populate } = buildCommentModelMock();

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' });

				expect(populate).toHaveBeenCalledWith([AUTHOR_POPULATE, MENTIONED_USER_POPULATE]);
			});

			it('resolves with the saved comment', async () => {
				givenPostExists();
				buildCommentModelMock();

				const result = await addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' });

				expect(result).toMatchObject({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' });
			});

			it('wraps an unexpected save failure in a 500 AppError that keeps the cause', async () => {
				const saveError = new Error('connection lost');

				givenPostExists();
				buildCommentModelMock({ save: jest.fn().mockRejectedValue(saveError) });

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' })).rejects.toMatchObject({
					statusCode: 500,
					message: 'Could not add comment',
					cause: saveError,
				});
			});

			it('wraps a failing post lookup in a 500 AppError', async () => {
				const lookupError = new Error('connection lost');

				UserPostModel.exists = jest.fn().mockRejectedValue(lookupError);
				buildCommentModelMock();

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' })).rejects.toMatchObject({
					statusCode: 500,
					cause: lookupError,
				});
			});
		});

		describe('the stored comment count of the post', () => {
			beforeEach(() => {
				UserPostModel.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
			});

			it('adds 1 to the commentsCount of the post when a top-level comment is saved', async () => {
				givenPostExists();
				buildCommentModelMock();

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' });

				expect(UserPostModel.updateOne).toHaveBeenCalledTimes(1);
				expect(UserPostModel.updateOne).toHaveBeenCalledWith({ _id: POST_ID }, { $inc: { commentsCount: 1 } });
			});

			it('adds 1 to the commentsCount of the post when a reply is saved', async () => {
				givenPostExists();
				givenParentExists();
				buildCommentModelMock();

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Thanks', parentCommentId: PARENT_ID });

				expect(UserPostModel.updateOne).toHaveBeenCalledTimes(1);
				expect(UserPostModel.updateOne).toHaveBeenCalledWith({ _id: POST_ID }, { $inc: { commentsCount: 1 } });
			});

			it('adds to the count only after the comment is saved', async () => {
				const callOrder = [];

				givenPostExists();
				buildCommentModelMock({
					save: jest.fn().mockImplementation(async () => {
						callOrder.push('save');
					}),
				});
				UserPostModel.updateOne = jest.fn().mockImplementation(async () => {
					callOrder.push('increment');
				});

				await addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' });

				expect(callOrder).toEqual(['save', 'increment']);
			});

			it('does not change the count when saving the comment fails', async () => {
				givenPostExists();
				buildCommentModelMock({ save: jest.fn().mockRejectedValue(new Error('connection lost')) });

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' })).rejects.toBeDefined();

				expect(UserPostModel.updateOne).not.toHaveBeenCalled();
			});

			it('does not change the count when the text is empty', async () => {
				givenPostExists();
				buildCommentModelMock();

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: '   ' })).rejects.toBeDefined();

				expect(UserPostModel.updateOne).not.toHaveBeenCalled();
			});

			it('does not change the count when the post does not exist', async () => {
				givenPostExists(false);
				buildCommentModelMock();

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' })).rejects.toBeDefined();

				expect(UserPostModel.updateOne).not.toHaveBeenCalled();
			});

			it('does not change the count when the parent comment of a reply is not valid', async () => {
				givenPostExists();
				givenParentExists(false);
				buildCommentModelMock();

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Thanks', parentCommentId: PARENT_ID })).rejects.toBeDefined();

				expect(UserPostModel.updateOne).not.toHaveBeenCalled();
			});

			it('wraps a failing count update in a 500 AppError that keeps the cause', async () => {
				const updateError = new Error('connection lost');

				givenPostExists();
				buildCommentModelMock();
				UserPostModel.updateOne = jest.fn().mockRejectedValue(updateError);

				await expect(addComment({ userPostId: POST_ID, userId: USER_ID, text: 'Nice shot' })).rejects.toMatchObject({
					statusCode: 500,
					message: 'Could not add comment',
					cause: updateError,
				});
			});
		});
	});

	describe('getCommentsForPost', () => {
		const buildStoredComment = ({ _id, parentCommentId = null, likes = [], createdAt }) => {
			const data = { _id, parentCommentId, likes, createdAt: new Date(createdAt) };

			return { ...data, toObject: () => ({ ...data }) };
		};

		const givenStoredComments = (docs) => {
			const populate = jest.fn().mockResolvedValue(docs);
			const sort = jest.fn().mockReturnValue({ populate });

			UserPostModel.exists = jest.fn().mockResolvedValue({ _id: POST_ID });
			CommentModel.find = jest.fn().mockReturnValue({ sort });

			return { sort, populate };
		};

		const getIds = (comments) => comments.map((comment) => comment._id);

		it('rejects a malformed post id with a 404 POST_NOT_FOUND, without querying the database', async () => {
			UserPostModel.exists = jest.fn();
			CommentModel.find = jest.fn();

			await expect(getCommentsForPost({ userPostId: 'not-an-object-id' })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.POST_NOT_FOUND,
			});

			expect(UserPostModel.exists).not.toHaveBeenCalled();
			expect(CommentModel.find).not.toHaveBeenCalled();
		});

		it('rejects a post that does not exist with a 404 POST_NOT_FOUND, loading no comments', async () => {
			UserPostModel.exists = jest.fn().mockResolvedValue(null);
			CommentModel.find = jest.fn();

			await expect(getCommentsForPost({ userPostId: POST_ID })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.POST_NOT_FOUND,
			});

			expect(CommentModel.find).not.toHaveBeenCalled();
		});

		it('loads the comments of the post oldest first, with the username and picture of each author and the username of each mentioned user', async () => {
			const { sort, populate } = givenStoredComments([]);

			await getCommentsForPost({ userPostId: POST_ID });

			expect(CommentModel.find).toHaveBeenCalledWith({ userPostId: POST_ID });
			expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
			expect(populate).toHaveBeenCalledWith([AUTHOR_POPULATE, MENTIONED_USER_POPULATE]);
		});

		it('returns an empty list for a post without comments', async () => {
			givenStoredComments([]);

			await expect(getCommentsForPost({ userPostId: POST_ID })).resolves.toEqual([]);
		});

		it('returns the top-level comments, with the replies nested under their parent', async () => {
			givenStoredComments([
				buildStoredComment({ _id: 'c1', createdAt: '2024-01-01' }),
				buildStoredComment({ _id: 'r1', parentCommentId: 'c1', createdAt: '2024-01-02' }),
			]);

			const result = await getCommentsForPost({ userPostId: POST_ID });

			expect(getIds(result)).toEqual(['c1']);
			expect(getIds(result[0].replies)).toEqual(['r1']);
		});

		it('gives a comment without replies an empty replies list', async () => {
			givenStoredComments([buildStoredComment({ _id: 'c1', createdAt: '2024-01-01' })]);

			const [comment] = await getCommentsForPost({ userPostId: POST_ID });

			expect(comment.replies).toEqual([]);
		});

		it('puts the most liked top-level comment first', async () => {
			givenStoredComments([
				buildStoredComment({ _id: 'few', likes: ['u1'], createdAt: '2024-01-01' }),
				buildStoredComment({ _id: 'many', likes: ['u1', 'u2', 'u3'], createdAt: '2024-01-02' }),
				buildStoredComment({ _id: 'none', createdAt: '2024-01-03' }),
			]);

			const result = await getCommentsForPost({ userPostId: POST_ID });

			expect(getIds(result)).toEqual(['many', 'few', 'none']);
		});

		it('puts the newest first among top-level comments with the same number of likes', async () => {
			givenStoredComments([
				buildStoredComment({ _id: 'oldest', createdAt: '2024-01-01' }),
				buildStoredComment({ _id: 'newest', createdAt: '2024-03-01' }),
				buildStoredComment({ _id: 'middle', createdAt: '2024-02-01' }),
			]);

			const result = await getCommentsForPost({ userPostId: POST_ID });

			expect(getIds(result)).toEqual(['newest', 'middle', 'oldest']);
		});

		it('keeps the replies of a comment oldest first', async () => {
			givenStoredComments([
				buildStoredComment({ _id: 'c1', createdAt: '2024-01-01' }),
				buildStoredComment({ _id: 'r1', parentCommentId: 'c1', createdAt: '2024-01-02' }),
				buildStoredComment({ _id: 'r2', parentCommentId: 'c1', createdAt: '2024-01-03' }),
				buildStoredComment({ _id: 'r3', parentCommentId: 'c1', createdAt: '2024-01-04' }),
			]);

			const [comment] = await getCommentsForPost({ userPostId: POST_ID });

			expect(getIds(comment.replies)).toEqual(['r1', 'r2', 'r3']);
		});

		it('ranks top-level comments by their own likes, not the likes of their replies', async () => {
			givenStoredComments([
				buildStoredComment({ _id: 'liked', likes: ['u1'], createdAt: '2024-01-01' }),
				buildStoredComment({ _id: 'quiet', createdAt: '2024-01-02' }),
				buildStoredComment({ _id: 'popularReply', parentCommentId: 'quiet', likes: ['u1', 'u2', 'u3'], createdAt: '2024-01-03' }),
			]);

			const result = await getCommentsForPost({ userPostId: POST_ID });

			expect(getIds(result)).toEqual(['liked', 'quiet']);
		});

		it('keeps replies of different comments apart', async () => {
			givenStoredComments([
				buildStoredComment({ _id: 'c1', createdAt: '2024-01-01' }),
				buildStoredComment({ _id: 'c2', createdAt: '2024-01-02' }),
				buildStoredComment({ _id: 'r1', parentCommentId: 'c1', createdAt: '2024-01-03' }),
				buildStoredComment({ _id: 'r2', parentCommentId: 'c2', createdAt: '2024-01-04' }),
			]);

			const result = await getCommentsForPost({ userPostId: POST_ID });
			const repliesByParent = Object.fromEntries(result.map((comment) => [comment._id, getIds(comment.replies)]));

			expect(repliesByParent).toEqual({ c1: ['r1'], c2: ['r2'] });
		});

		it('needs no user, so a guest can load the comments', async () => {
			givenStoredComments([buildStoredComment({ _id: 'c1', createdAt: '2024-01-01' })]);

			await expect(getCommentsForPost({ userPostId: POST_ID })).resolves.toHaveLength(1);
		});

		it('wraps an unexpected database failure in a 500 AppError that keeps the cause', async () => {
			const dbError = new Error('connection lost');

			UserPostModel.exists = jest.fn().mockResolvedValue({ _id: POST_ID });
			CommentModel.find = jest.fn().mockImplementation(() => {
				throw dbError;
			});

			await expect(getCommentsForPost({ userPostId: POST_ID })).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not load comments',
				cause: dbError,
			});
		});
	});

	describe.each([
		['likeComment', likeComment, { $addToSet: { likes: USER_ID } }, 'Could not like comment'],
		['unlikeComment', unlikeComment, { $pull: { likes: USER_ID } }, 'Could not unlike comment'],
	])('%s', (_name, action, expectedUpdate, failureMessage) => {
		it('updates the likes of the comment with the right operator and resolves with the updated comment', async () => {
			const updatedComment = { _id: COMMENT_ID, likes: [USER_ID] };

			CommentModel.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedComment);

			const result = await action({ commentId: COMMENT_ID, userId: USER_ID });

			expect(CommentModel.findByIdAndUpdate).toHaveBeenCalledWith(COMMENT_ID, expectedUpdate, { new: true });
			expect(result).toBe(updatedComment);
		});

		it('rejects a malformed comment id with a 404 COMMENT_NOT_FOUND, without querying the database', async () => {
			CommentModel.findByIdAndUpdate = jest.fn();

			await expect(action({ commentId: 'not-an-object-id', userId: USER_ID })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.COMMENT_NOT_FOUND,
			});

			expect(CommentModel.findByIdAndUpdate).not.toHaveBeenCalled();
		});

		it('rejects a comment that does not exist with a 404 COMMENT_NOT_FOUND instead of resolving with null', async () => {
			CommentModel.findByIdAndUpdate = jest.fn().mockResolvedValue(null);

			await expect(action({ commentId: COMMENT_ID, userId: USER_ID })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.COMMENT_NOT_FOUND,
			});
		});

		it('wraps an unexpected database failure in a 500 AppError that keeps the cause', async () => {
			const dbError = new Error('connection lost');

			CommentModel.findByIdAndUpdate = jest.fn().mockRejectedValue(dbError);

			await expect(action({ commentId: COMMENT_ID, userId: USER_ID })).rejects.toMatchObject({
				statusCode: 500,
				message: failureMessage,
				cause: dbError,
			});
		});
	});

	describe('getCommentLikes', () => {
		const FIRST_LIKER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
		const SECOND_LIKER_ID = '64b7f0a1c2d3e4f5a6b7c8d2';
		const THIRD_LIKER_ID = '64b7f0a1c2d3e4f5a6b7c8d3';

		const givenCommentWithLikes = (likes) => {
			const select = jest.fn().mockResolvedValue({ _id: COMMENT_ID, likes });

			CommentModel.findById = jest.fn().mockReturnValue({ select });

			return select;
		};

		it('reads only the likes of the comment in the path', async () => {
			const select = givenCommentWithLikes([]);

			getUserRowsInOrder.mockResolvedValue([]);

			await getCommentLikes({ commentId: COMMENT_ID });

			expect(CommentModel.findById).toHaveBeenCalledWith(COMMENT_ID);
			expect(select).toHaveBeenCalledWith({ likes: 1 });
		});

		it('asks for the user rows with the newest like first', async () => {
			givenCommentWithLikes([FIRST_LIKER_ID, SECOND_LIKER_ID, THIRD_LIKER_ID]);
			getUserRowsInOrder.mockResolvedValue([]);

			await getCommentLikes({ commentId: COMMENT_ID });

			expect(getUserRowsInOrder).toHaveBeenCalledWith([THIRD_LIKER_ID, SECOND_LIKER_ID, FIRST_LIKER_ID]);
		});

		it('does not reorder the stored likes of the comment', async () => {
			const likes = [FIRST_LIKER_ID, SECOND_LIKER_ID];

			givenCommentWithLikes(likes);
			getUserRowsInOrder.mockResolvedValue([]);

			await getCommentLikes({ commentId: COMMENT_ID });

			expect(likes).toEqual([FIRST_LIKER_ID, SECOND_LIKER_ID]);
		});

		it('resolves with the rows the user row service returns', async () => {
			const rows = [{ _id: SECOND_LIKER_ID, username: 'second' }];

			givenCommentWithLikes([SECOND_LIKER_ID]);
			getUserRowsInOrder.mockResolvedValue(rows);

			await expect(getCommentLikes({ commentId: COMMENT_ID })).resolves.toBe(rows);
		});

		it('resolves with an empty list for a comment nobody liked', async () => {
			givenCommentWithLikes([]);
			getUserRowsInOrder.mockResolvedValue([]);

			await expect(getCommentLikes({ commentId: COMMENT_ID })).resolves.toEqual([]);
		});

		it('rejects a malformed comment id with a 404 COMMENT_NOT_FOUND, without querying the database', async () => {
			CommentModel.findById = jest.fn();

			await expect(getCommentLikes({ commentId: 'not-an-object-id' })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.COMMENT_NOT_FOUND,
			});

			expect(CommentModel.findById).not.toHaveBeenCalled();
			expect(getUserRowsInOrder).not.toHaveBeenCalled();
		});

		it('rejects an unknown comment with a 404 COMMENT_NOT_FOUND, not a 500', async () => {
			CommentModel.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

			await expect(getCommentLikes({ commentId: COMMENT_ID })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.COMMENT_NOT_FOUND,
			});

			expect(getUserRowsInOrder).not.toHaveBeenCalled();
		});

		it('wraps a failing comment lookup in a 500 AppError that keeps the cause', async () => {
			const dbError = new Error('connection lost');

			CommentModel.findById = jest.fn().mockReturnValue({ select: jest.fn().mockRejectedValue(dbError) });

			await expect(getCommentLikes({ commentId: COMMENT_ID })).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not load the likes',
				cause: dbError,
			});
		});

		it('wraps a failing user rows query in a 500 AppError that keeps the cause', async () => {
			const dbError = new Error('connection lost');

			givenCommentWithLikes([FIRST_LIKER_ID]);
			getUserRowsInOrder.mockRejectedValue(dbError);

			await expect(getCommentLikes({ commentId: COMMENT_ID })).rejects.toMatchObject({ statusCode: 500, cause: dbError });
		});
	});

	describe('getPreviewCommentsForPosts', () => {
		const givenPreviewGroups = (groups) => {
			CommentModel.aggregate = jest.fn().mockResolvedValue(groups);
			CommentModel.populate = jest
				.fn()
				.mockImplementation(async (comments) => comments.map((comment) => ({ ...comment, userId: { _id: 'user3', username: 'alice' } })));
		};

		const getPipeline = () => CommentModel.aggregate.mock.calls[0][0];

		const findStage = (stageName) => getPipeline().find((stage) => stageName in stage);

		it('only considers top-level comments of the given posts', async () => {
			givenPreviewGroups([]);

			await getPreviewCommentsForPosts(['post1', 'post2']);

			expect(getPipeline()[0]).toEqual({ $match: { userPostId: { $in: ['post1', 'post2'] }, parentCommentId: null } });
		});

		it('ranks comments by most likes first, then newest first', async () => {
			givenPreviewGroups([]);

			await getPreviewCommentsForPosts(['post1']);

			expect(findStage('$sort').$sort).toMatchObject({ likesCount: -1, createdAt: -1 });
			const stageNames = getPipeline().map((stage) => Object.keys(stage)[0]);

			expect(stageNames.indexOf('$sort')).toBeLessThan(stageNames.indexOf('$group'));
		});

		it('keeps two comments per post', async () => {
			givenPreviewGroups([]);

			await getPreviewCommentsForPosts(['post1']);

			expect(findStage('$project').$project.comments).toEqual({ $slice: ['$comments', 2] });
		});

		it('groups the comments by post', async () => {
			givenPreviewGroups([]);

			await getPreviewCommentsForPosts(['post1']);

			expect(findStage('$group').$group._id).toBe('$userPostId');
		});

		it('returns the preview comments keyed by post id, in the order the pipeline ranked them', async () => {
			givenPreviewGroups([
				{ _id: 'post1', comments: [{ _id: 'c2' }, { _id: 'c1' }] },
				{ _id: 'post2', comments: [{ _id: 'c3' }] },
			]);

			const previews = await getPreviewCommentsForPosts(['post1', 'post2']);

			expect(previews.post1.map((comment) => comment._id)).toEqual(['c2', 'c1']);
			expect(previews.post2.map((comment) => comment._id)).toEqual(['c3']);
		});

		it('populates the author of every preview comment with only the username and picture', async () => {
			givenPreviewGroups([{ _id: 'post1', comments: [{ _id: 'c1' }] }]);

			const previews = await getPreviewCommentsForPosts(['post1']);

			expect(CommentModel.populate).toHaveBeenCalledWith([{ _id: 'c1' }], AUTHOR_POPULATE);
			expect(previews.post1[0].userId).toEqual({ _id: 'user3', username: 'alice' });
		});

		it('leaves out posts that have no comments', async () => {
			givenPreviewGroups([{ _id: 'post1', comments: [{ _id: 'c1' }] }]);

			const previews = await getPreviewCommentsForPosts(['post1', 'post2']);

			expect(previews).not.toHaveProperty('post2');
		});

		it('returns an empty map when there are no comments at all', async () => {
			givenPreviewGroups([]);

			await expect(getPreviewCommentsForPosts(['post1'])).resolves.toEqual({});
		});

		it('wraps an unexpected database failure in a 500 AppError that keeps the cause', async () => {
			const dbError = new Error('connection lost');

			CommentModel.aggregate = jest.fn().mockRejectedValue(dbError);

			await expect(getPreviewCommentsForPosts(['post1'])).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not load preview comments',
				cause: dbError,
			});
		});
	});

	describe('deleteCommentsForPost', () => {
		it("deletes the post's comments together with the replies to them", async () => {
			const select = jest.fn().mockResolvedValue([{ _id: 'comment1' }, { _id: 'comment2' }]);

			CommentModel.find = jest.fn().mockReturnValue({ select });
			CommentModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 4 });

			await deleteCommentsForPost({ userPostId: POST_ID });

			expect(CommentModel.find).toHaveBeenCalledWith({ userPostId: POST_ID });
			expect(CommentModel.deleteMany).toHaveBeenCalledWith({
				$or: [{ userPostId: POST_ID }, { parentCommentId: { $in: ['comment1', 'comment2'] } }],
			});
		});

		it('still issues the delete when the post has no comments', async () => {
			CommentModel.find = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
			CommentModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });

			await deleteCommentsForPost({ userPostId: POST_ID });

			expect(CommentModel.deleteMany).toHaveBeenCalledWith({
				$or: [{ userPostId: POST_ID }, { parentCommentId: { $in: [] } }],
			});
		});

		it('wraps a database failure in a 500 AppError', async () => {
			const dbError = new Error('connection lost');

			CommentModel.find = jest.fn().mockReturnValue({ select: jest.fn().mockRejectedValue(dbError) });
			CommentModel.deleteMany = jest.fn();

			await expect(deleteCommentsForPost({ userPostId: POST_ID })).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not delete comments',
				cause: dbError,
			});

			expect(CommentModel.deleteMany).not.toHaveBeenCalled();
		});
	});
});
