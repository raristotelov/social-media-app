import { requestFactory } from './requester';
import { addStory, deleteStory, getStoryTray, getStoryViewers, getUserStories, markStoryViewed } from './storyService';

jest.mock('./requester');

describe('storyService', () => {
	describe('addStory', () => {
		const image = new File(['(image)'], 'photo.png', { type: 'image/png' });
		let post;

		beforeEach(() => {
			post = jest.fn().mockResolvedValue({ _id: 'story1' });
			requestFactory.mockReturnValue({ post });
		});

		it('posts to the stories endpoint with the token', async () => {
			await addStory({ image }, 'token123');

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/stories$/), expect.any(FormData));
		});

		it('sends the picture under the "image" field and nothing else, as multipart form data', async () => {
			await addStory({ image }, 'token123');

			const formData = post.mock.calls[0][1];

			expect(formData.get('image')).toBeInstanceOf(File);
			expect(formData.get('image').name).toBe('photo.png');
			expect([...formData.keys()]).toEqual(['image']);
		});

		it('resolves with the saved story', async () => {
			await expect(addStory({ image }, 'token123')).resolves.toEqual({ _id: 'story1' });
		});
	});

	describe('getStoryTray', () => {
		it('gets the tray endpoint with the token', async () => {
			const get = jest.fn().mockResolvedValue([{ isOwn: true }]);

			requestFactory.mockReturnValue({ get });

			await expect(getStoryTray({ jwtToken: 'token123' })).resolves.toEqual([{ isOwn: true }]);

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/tray$/));
		});
	});

	describe('getUserStories', () => {
		it("gets that user's stories endpoint with the token", async () => {
			const get = jest.fn().mockResolvedValue({ user: {}, stories: [] });

			requestFactory.mockReturnValue({ get });

			await expect(getUserStories({ userId: 'user7', jwtToken: 'token123' })).resolves.toEqual({ user: {}, stories: [] });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/user\/user7$/));
		});
	});

	describe('markStoryViewed', () => {
		it('posts to the view endpoint of that story with the token and no body', async () => {
			const post = jest.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ post });

			await markStoryViewed({ storyId: 'story1', jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/story1\/view$/));
		});
	});

	describe('getStoryViewers', () => {
		it('gets the viewers endpoint of that story with the token', async () => {
			const get = jest.fn().mockResolvedValue([{ _id: 'viewer1' }]);

			requestFactory.mockReturnValue({ get });

			await expect(getStoryViewers({ storyId: 'story1', jwtToken: 'token123' })).resolves.toEqual([{ _id: 'viewer1' }]);

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/story1\/viewers$/));
		});
	});

	describe('deleteStory', () => {
		it('sends a DELETE to that story with the token', async () => {
			const del = jest.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ delete: del });

			await deleteStory({ storyId: 'story1', jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(del).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/story1$/));
		});
	});
});
