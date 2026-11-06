import { requestFactory } from './requester';
import { getComments, addComment, likeComment, unlikeComment, getCommentLikes } from './commentService';

jest.mock('./requester');

describe('commentService', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('getComments', () => {
		it('gets the comments endpoint of the post', async () => {
			const get = jest.fn().mockResolvedValue([]);

			requestFactory.mockReturnValue({ get });

			await getComments({ userPostId: 'post1' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/comments\/post\/post1$/));
		});

		it('builds the requester without a token, as the session travels in the cookie', async () => {
			requestFactory.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });

			await getComments({ userPostId: 'post1' });

			expect(requestFactory).toHaveBeenCalledWith();
		});

		it('resolves with the comments', async () => {
			requestFactory.mockReturnValue({ get: jest.fn().mockResolvedValue([{ _id: 'c1' }]) });

			await expect(getComments({ userPostId: 'post1' })).resolves.toEqual([{ _id: 'c1' }]);
		});
	});

	describe('getCommentLikes', () => {
		it('gets the likes endpoint of the comment', async () => {
			const get = jest.fn().mockResolvedValue([]);

			requestFactory.mockReturnValue({ get });

			await getCommentLikes({ commentId: 'c1' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/comments\/c1\/likes$/));
		});
	});

	describe('addComment', () => {
		it('posts the post id and text to the comments endpoint', async () => {
			const post = jest.fn().mockResolvedValue({ _id: 'c1' });

			requestFactory.mockReturnValue({ post });

			await addComment({ userPostId: 'post1', text: 'Nice shot' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments$/), {
				userPostId: 'post1',
				text: 'Nice shot',
				parentCommentId: undefined,
				mentionedUserId: undefined,
			});
		});

		it('includes the parent comment id for a reply', async () => {
			const post = jest.fn().mockResolvedValue({ _id: 'r1' });

			requestFactory.mockReturnValue({ post });

			await addComment({ userPostId: 'post1', text: 'Thanks', parentCommentId: 'c1' });

			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments$/), {
				userPostId: 'post1',
				text: 'Thanks',
				parentCommentId: 'c1',
				mentionedUserId: undefined,
			});
		});

		it('includes the mentioned user id for a reply that mentions someone', async () => {
			const post = jest.fn().mockResolvedValue({ _id: 'r1' });

			requestFactory.mockReturnValue({ post });

			await addComment({ userPostId: 'post1', text: '@bob Thanks', parentCommentId: 'c1', mentionedUserId: 'user4' });

			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments$/), {
				userPostId: 'post1',
				text: '@bob Thanks',
				parentCommentId: 'c1',
				mentionedUserId: 'user4',
			});
		});

		it('sends a null mentioned user id as null', async () => {
			const post = jest.fn().mockResolvedValue({ _id: 'r1' });

			requestFactory.mockReturnValue({ post });

			await addComment({ userPostId: 'post1', text: 'Thanks', parentCommentId: 'c1', mentionedUserId: null });

			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments$/), expect.objectContaining({ mentionedUserId: null }));
		});

		it('resolves with the saved comment', async () => {
			requestFactory.mockReturnValue({ post: jest.fn().mockResolvedValue({ _id: 'c1' }) });

			await expect(addComment({ userPostId: 'post1', text: 'Nice shot' })).resolves.toEqual({ _id: 'c1' });
		});
	});

	describe('likeComment', () => {
		it('posts to the like endpoint of the comment', async () => {
			const post = jest.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ post });

			await likeComment({ commentId: 'c1' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments\/c1\/like$/));
		});
	});

	describe('unlikeComment', () => {
		it('posts to the unlike endpoint of the comment', async () => {
			const post = jest.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ post });

			await unlikeComment({ commentId: 'c1' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments\/c1\/unlike$/));
		});
	});
});
