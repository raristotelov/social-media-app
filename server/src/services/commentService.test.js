jest.mock('../models/commentModel');

const CommentModel = require('../models/commentModel');
const { deleteCommentsForPost } = require('./commentService');

const POST_ID = '64b7f0a1c2d3e4f5a6b7c8e1';

describe('commentService', () => {
	beforeEach(() => {
		jest.resetAllMocks();
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
