import { requestFactory } from './requester';
import { addStory, deleteStory, getStoryTray, getStoryViewers, getUserStories, markStoryViewed } from './storyService';

vi.mock('./requester');

describe('storyService', () => {
	describe('addStory', () => {
		const image = new File(['(image)'], 'photo.png', { type: 'image/png' });
		let post;

		beforeEach(() => {
			post = vi.fn().mockResolvedValue({ _id: 'story1' });
			requestFactory.mockReturnValue({ post });
		});

		it('posts to the stories endpoint', async () => {
			await addStory({ image });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/stories$/), expect.any(FormData));
		});

		it('sends the picture under the "image" field and nothing else, as multipart form data', async () => {
			await addStory({ image });

			const formData = post.mock.calls[0][1];

			expect(formData.get('image')).toBeInstanceOf(File);
			expect(formData.get('image').name).toBe('photo.png');
			expect([...formData.keys()]).toEqual(['image']);
		});

		it('resolves with the saved story', async () => {
			await expect(addStory({ image })).resolves.toEqual({ _id: 'story1' });
		});
	});

	describe('getStoryTray', () => {
		it('gets the tray endpoint', async () => {
			const get = vi.fn().mockResolvedValue([{ isOwn: true }]);

			requestFactory.mockReturnValue({ get });

			await expect(getStoryTray()).resolves.toEqual([{ isOwn: true }]);

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/tray$/));
		});
	});

	describe('getUserStories', () => {
		it("gets that user's stories endpoint", async () => {
			const get = vi.fn().mockResolvedValue({ user: {}, stories: [] });

			requestFactory.mockReturnValue({ get });

			await expect(getUserStories({ userId: 'user7' })).resolves.toEqual({ user: {}, stories: [] });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/user\/user7$/));
		});
	});

	describe('markStoryViewed', () => {
		it('posts to the view endpoint of that story with no body', async () => {
			const post = vi.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ post });

			await markStoryViewed({ storyId: 'story1' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/story1\/view$/));
		});
	});

	describe('getStoryViewers', () => {
		it('gets the viewers endpoint of that story', async () => {
			const get = vi.fn().mockResolvedValue([{ _id: 'viewer1' }]);

			requestFactory.mockReturnValue({ get });

			await expect(getStoryViewers({ storyId: 'story1' })).resolves.toEqual([{ _id: 'viewer1' }]);

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/story1\/viewers$/));
		});
	});

	describe('deleteStory', () => {
		it('sends a DELETE to that story', async () => {
			const del = vi.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ delete: del });

			await deleteStory({ storyId: 'story1' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(del).toHaveBeenCalledWith(expect.stringMatching(/\/stories\/story1$/));
		});
	});
});
