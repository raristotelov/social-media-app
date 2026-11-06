import { requestFactory } from './requester';
import { getNotifications, getUnreadNotificationCount, markAllNotificationsRead } from './notificationService';

vi.mock('./requester');

describe('notificationService', () => {
	describe('getUnreadNotificationCount', () => {
		it('gets the unread count endpoint without a token', async () => {
			const get = vi.fn().mockResolvedValue({ count: 3 });

			requestFactory.mockReturnValue({ get });

			await expect(getUnreadNotificationCount()).resolves.toEqual({ count: 3 });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/notifications\/unread-count$/));
		});
	});

	describe('getNotifications', () => {
		let get;

		beforeEach(() => {
			get = vi.fn().mockResolvedValue({ notifications: [], hasMore: false, nextCursor: null });
			requestFactory.mockReturnValue({ get });
		});

		it('gets the first page without a query string', async () => {
			await getNotifications();

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/notifications$/));
		});

		it('sends the cursor, URL-encoded, to get a later page', async () => {
			await getNotifications({ cursor: '1700000000000_64b7f0a1c2d3e4f5a6b7c8ff' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/notifications\?cursor=1700000000000_64b7f0a1c2d3e4f5a6b7c8ff$/));
		});

		it('encodes characters that would break the query string', async () => {
			await getNotifications({ cursor: 'a&b=c' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\?cursor=a%26b%3Dc$/));
		});

		it('resolves with the page', async () => {
			await expect(getNotifications()).resolves.toEqual({ notifications: [], hasMore: false, nextCursor: null });
		});
	});

	describe('markAllNotificationsRead', () => {
		it('posts the cutoff to the mark-all-read endpoint', async () => {
			const post = vi.fn().mockResolvedValue(undefined);

			requestFactory.mockReturnValue({ post });

			await markAllNotificationsRead({ cutoff: '2026-11-05T10:00:00.000Z' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/notifications\/mark-all-read$/), { cutoff: '2026-11-05T10:00:00.000Z' });
		});
	});
});
