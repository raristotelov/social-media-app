import { requestFactory } from './requester';
import { addUserPost, getFollowedUsersPosts, likeUserPost, unlikeUserPost } from './userPostService';

jest.mock('./requester');

describe('userPostService', () => {
	describe('addUserPost', () => {
		const image = new File(['(image)'], 'photo.png', { type: 'image/png' });
		let post;

		beforeEach(() => {
			post = jest.fn().mockResolvedValue({ _id: 'post1' });
			requestFactory.mockReturnValue({ post });
		});

		it('posts to the user-posts endpoint with the token', async () => {
			await addUserPost({ image, caption: 'Sunset' }, 'token123');

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts$/), expect.any(FormData));
		});

		it('sends the image under the "image" field and the caption as text, as multipart form data', async () => {
			await addUserPost({ image, caption: 'Sunset' }, 'token123');

			const formData = post.mock.calls[0][1];

			expect(formData.get('image')).toBeInstanceOf(File);
			expect(formData.get('image').name).toBe('photo.png');
			expect(formData.get('caption')).toBe('Sunset');
		});

		it('sends an empty caption as an empty string', async () => {
			await addUserPost({ image, caption: '' }, 'token123');

			expect(post.mock.calls[0][1].get('caption')).toBe('');
		});

		it('sends only the fields it was given: no Cloudinary fields leak into the request', async () => {
			await addUserPost({ image, caption: 'Sunset' }, 'token123');

			expect([...post.mock.calls[0][1].keys()].sort()).toEqual(['caption', 'image']);
		});

		it('resolves with the saved post', async () => {
			await expect(addUserPost({ image, caption: 'Sunset' }, 'token123')).resolves.toEqual({ _id: 'post1' });
		});
	});

	describe('getFollowedUsersPosts', () => {
		it('gets the followed users posts endpoint with the token', async () => {
			const get = jest.fn().mockResolvedValue([{ _id: 'post1' }]);

			requestFactory.mockReturnValue({ get });

			await getFollowedUsersPosts({ jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts\/followed-users-posts$/));
		});

		it('resolves with the posts', async () => {
			requestFactory.mockReturnValue({ get: jest.fn().mockResolvedValue([{ _id: 'post1' }]) });

			await expect(getFollowedUsersPosts({ jwtToken: 'token123' })).resolves.toEqual([{ _id: 'post1' }]);
		});
	});

	describe('likeUserPost', () => {
		it('posts to the like endpoint of that post with the token', async () => {
			const post = jest.fn().mockResolvedValue({ _id: 'post1', likes: ['user1'] });

			requestFactory.mockReturnValue({ post });

			await likeUserPost({ userPostToLikeId: 'post1', jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts\/like\/post1$/));
		});
	});

	describe('unlikeUserPost', () => {
		it('posts to the unlike endpoint of that post with the token', async () => {
			const post = jest.fn().mockResolvedValue({ _id: 'post1', likes: [] });

			requestFactory.mockReturnValue({ post });

			await unlikeUserPost({ userPostToUnlikeId: 'post1', jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts\/unlike\/post1$/));
		});
	});
});
