import { requestFactory } from './requester';
import { addUserPost, getFollowedUsersPosts, getNextPopularPosts, getPopularPosts, likeUserPost, unlikeUserPost } from './userPostService';

vi.mock('./requester');

describe('userPostService', () => {
	describe('addUserPost', () => {
		const image = new File(['(image)'], 'photo.png', { type: 'image/png' });
		let post;

		beforeEach(() => {
			post = vi.fn().mockResolvedValue({ _id: 'post1' });
			requestFactory.mockReturnValue({ post });
		});

		it('posts to the user-posts endpoint', async () => {
			await addUserPost({ image, caption: 'Sunset' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts$/), expect.any(FormData));
		});

		it('sends the image under the "image" field and the caption as text, as multipart form data', async () => {
			await addUserPost({ image, caption: 'Sunset' });

			const formData = post.mock.calls[0][1];

			expect(formData.get('image')).toBeInstanceOf(File);
			expect(formData.get('image').name).toBe('photo.png');
			expect(formData.get('caption')).toBe('Sunset');
		});

		it('sends an empty caption as an empty string', async () => {
			await addUserPost({ image, caption: '' });

			expect(post.mock.calls[0][1].get('caption')).toBe('');
		});

		it('sends only the fields it was given: no Cloudinary fields leak into the request', async () => {
			await addUserPost({ image, caption: 'Sunset' });

			expect([...post.mock.calls[0][1].keys()].sort()).toEqual(['caption', 'image']);
		});

		it('resolves with the saved post', async () => {
			await expect(addUserPost({ image, caption: 'Sunset' })).resolves.toEqual({ _id: 'post1' });
		});
	});

	describe('getFollowedUsersPosts', () => {
		it('gets the followed users posts endpoint', async () => {
			const get = vi.fn().mockResolvedValue([{ _id: 'post1' }]);

			requestFactory.mockReturnValue({ get });

			await getFollowedUsersPosts();

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts\/followed-users-posts$/));
		});

		it('resolves with the page', async () => {
			const page = { posts: [{ _id: 'post1' }], hasMore: true, nextCursor: '1_abc' };

			requestFactory.mockReturnValue({ get: vi.fn().mockResolvedValue(page) });

			await expect(getFollowedUsersPosts()).resolves.toEqual(page);
		});

		it('sends no query string for the first page', async () => {
			const get = vi.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ get });

			await getFollowedUsersPosts({ cursor: null });

			expect(get).toHaveBeenCalledWith(expect.not.stringContaining('?'));
		});

		it('sends the cursor of the page to continue from', async () => {
			const get = vi.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ get });

			await getFollowedUsersPosts({ cursor: '1793000000000_64b7f0a1c2d3e4f5a6b7c8d1' });

			expect(get).toHaveBeenCalledWith(
				expect.stringMatching(/\/user-posts\/followed-users-posts\?cursor=1793000000000_64b7f0a1c2d3e4f5a6b7c8d1$/),
			);
		});

		it('encodes a cursor so no character can break the query', async () => {
			const get = vi.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ get });

			await getFollowedUsersPosts({ cursor: 'a&b=c#d' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\?cursor=a%26b%3Dc%23d$/));
		});
	});

	describe('getPopularPosts', () => {
		const page = { posts: [{ _id: 'post1' }], snapshotTime: '2026-10-24T10:00:00.000Z', hasMore: true };

		let get;

		beforeEach(() => {
			get = vi.fn().mockResolvedValue(page);
			requestFactory.mockReturnValue({ get });
		});

		it('gets the popular endpoint', async () => {
			await getPopularPosts();

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts\/popular$/));
		});

		it('adds no query string when no first post is given', async () => {
			await getPopularPosts({});

			expect(get.mock.calls[0][0]).not.toContain('?');
		});

		it('adds no query string for an empty first post id', async () => {
			await getPopularPosts({ firstPostId: '' });

			expect(get.mock.calls[0][0]).not.toContain('?');
		});

		it('names the first post in the firstPostId query parameter', async () => {
			await getPopularPosts({ firstPostId: '64b7f0a1c2d3e4f5a6b7c8e1' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts\/popular\?firstPostId=64b7f0a1c2d3e4f5a6b7c8e1$/));
		});

		it('encodes a first post id that is not URL safe, so it cannot add parameters', async () => {
			await getPopularPosts({ firstPostId: 'a&b=c#d' });

			expect(get.mock.calls[0][0]).toMatch(/\?firstPostId=a%26b%3Dc%23d$/);
		});

		it('resolves with the page the server sent', async () => {
			await expect(getPopularPosts()).resolves.toEqual(page);
		});

		it('rejects with the error the requester raised', async () => {
			get.mockRejectedValue({ code: 'POST_NOT_FOUND', status: 404 });

			await expect(getPopularPosts({ firstPostId: 'gone' })).rejects.toEqual({ code: 'POST_NOT_FOUND', status: 404 });
		});
	});

	describe('getNextPopularPosts', () => {
		const page = { posts: [{ _id: 'post2' }], snapshotTime: '2026-10-24T10:00:00.000Z', hasMore: false };

		let post;

		beforeEach(() => {
			post = vi.fn().mockResolvedValue(page);
			requestFactory.mockReturnValue({ post });
		});

		it('posts to the popular endpoint', async () => {
			await getNextPopularPosts({ snapshotTime: '2026-10-24T10:00:00.000Z', shownPostIds: ['post1'] });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts\/popular$/), expect.any(Object));
		});

		it('sends the snapshot time and the shown ids in the body', async () => {
			await getNextPopularPosts({ snapshotTime: '2026-10-24T10:00:00.000Z', shownPostIds: ['post1', 'post2'] });

			expect(post.mock.calls[0][1]).toEqual({ snapshotTime: '2026-10-24T10:00:00.000Z', shownPostIds: ['post1', 'post2'] });
		});

		it('resolves with the page the server sent', async () => {
			await expect(getNextPopularPosts({ snapshotTime: '2026-10-24T10:00:00.000Z', shownPostIds: [] })).resolves.toEqual(page);
		});

		it('rejects with the error the requester raised', async () => {
			post.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			await expect(getNextPopularPosts({ snapshotTime: '2026-10-24T10:00:00.000Z', shownPostIds: [] })).rejects.toEqual({
				code: 'INTERNAL_ERROR',
				status: 500,
			});
		});
	});

	describe('likeUserPost', () => {
		it('posts to the like endpoint of that post', async () => {
			const post = vi.fn().mockResolvedValue({ _id: 'post1', likes: ['user1'] });

			requestFactory.mockReturnValue({ post });

			await likeUserPost({ userPostToLikeId: 'post1' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts\/like\/post1$/));
		});
	});

	describe('unlikeUserPost', () => {
		it('posts to the unlike endpoint of that post', async () => {
			const post = vi.fn().mockResolvedValue({ _id: 'post1', likes: [] });

			requestFactory.mockReturnValue({ post });

			await unlikeUserPost({ userPostToUnlikeId: 'post1' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/user-posts\/unlike\/post1$/));
		});
	});
});
