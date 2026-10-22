const CommentModel = require('./commentModel');

const buildComment = (overrides = {}) => ({
	userPostId: '64b7f0a1c2d3e4f5a6b7c8e1',
	userId: '64b7f0a1c2d3e4f5a6b7c8d1',
	text: 'Nice shot',
	...overrides,
});

describe('CommentModel', () => {
	describe('mentionedUserId', () => {
		it('defaults to null', () => {
			const comment = new CommentModel(buildComment());

			expect(comment.mentionedUserId).toBeNull();
		});

		it('keeps the id of the mentioned user', () => {
			const comment = new CommentModel(buildComment({ mentionedUserId: '64b7f0a1c2d3e4f5a6b7c8d2' }));

			expect(String(comment.mentionedUserId)).toBe('64b7f0a1c2d3e4f5a6b7c8d2');
		});

		it('is not required', () => {
			expect(new CommentModel(buildComment()).validateSync()).toBeUndefined();
		});

		it('references the User collection', () => {
			expect(CommentModel.schema.path('mentionedUserId').options.ref).toBe('User');
		});

		it('rejects a value that is not an ObjectId', () => {
			const comment = new CommentModel(buildComment({ mentionedUserId: 'not-an-object-id' }));

			expect(comment.validateSync().errors.mentionedUserId).toBeDefined();
		});
	});
});
