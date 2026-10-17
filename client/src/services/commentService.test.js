import { requestFactory } from './requester';
import { getComments, addComment, likeComment, unlikeComment } from './commentService';

jest.mock('./requester');

describe('commentService', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('getComments', () => {
		it('gets the comments endpoint of the post', async () => {
			const get = jest.fn().mockResolvedValue([]);

			requestFactory.mockReturnValue({ get });

			await getComments({ userPostId: 'post1', jwtToken: 'token123' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/comments\/post\/post1$/));
		});

		it('sends the token when there is one', async () => {
			requestFactory.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });

			await getComments({ userPostId: 'post1', jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
		});

		it('works without a token, for a guest', async () => {
			const get = jest.fn().mockResolvedValue([{ _id: 'c1' }]);

			requestFactory.mockReturnValue({ get });

			await expect(getComments({ userPostId: 'post1' })).resolves.toEqual([{ _id: 'c1' }]);
			expect(requestFactory).toHaveBeenCalledWith(undefined);
		});
	});

	describe('addComment', () => {
		it('posts the post id and text to the comments endpoint with the token', async () => {
			const post = jest.fn().mockResolvedValue({ _id: 'c1' });

			requestFactory.mockReturnValue({ post });

			await addComment({ userPostId: 'post1', text: 'Nice shot', jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments$/), {
				userPostId: 'post1',
				text: 'Nice shot',
				parentCommentId: undefined,
			});
		});

		it('includes the parent comment id for a reply', async () => {
			const post = jest.fn().mockResolvedValue({ _id: 'r1' });

			requestFactory.mockReturnValue({ post });

			await addComment({ userPostId: 'post1', text: 'Thanks', parentCommentId: 'c1', jwtToken: 'token123' });

			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments$/), { userPostId: 'post1', text: 'Thanks', parentCommentId: 'c1' });
		});

		it('resolves with the saved comment', async () => {
			requestFactory.mockReturnValue({ post: jest.fn().mockResolvedValue({ _id: 'c1' }) });

			await expect(addComment({ userPostId: 'post1', text: 'Nice shot', jwtToken: 'token123' })).resolves.toEqual({ _id: 'c1' });
		});
	});

	describe('likeComment', () => {
		it('posts to the like endpoint of the comment with the token', async () => {
			const post = jest.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ post });

			await likeComment({ commentId: 'c1', jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments\/c1\/like$/));
		});
	});

	describe('unlikeComment', () => {
		it('posts to the unlike endpoint of the comment with the token', async () => {
			const post = jest.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ post });

			await unlikeComment({ commentId: 'c1', jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/comments\/c1\/unlike$/));
		});
	});
});
