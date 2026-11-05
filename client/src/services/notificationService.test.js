import { requestFactory } from './requester';
import { getNotifications, getUnreadNotificationCount, markAllNotificationsRead } from './notificationService';

jest.mock('./requester');

describe('notificationService', () => {
	describe('getUnreadNotificationCount', () => {
		it('gets the unread count endpoint with the token', async () => {
			const get = jest.fn().mockResolvedValue({ count: 3 });

			requestFactory.mockReturnValue({ get });

			await expect(getUnreadNotificationCount({ jwtToken: 'token123' })).resolves.toEqual({ count: 3 });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/notifications\/unread-count$/));
		});
	});

	describe('getNotifications', () => {
		let get;

		beforeEach(() => {
			get = jest.fn().mockResolvedValue({ notifications: [], hasMore: false, nextCursor: null });
			requestFactory.mockReturnValue({ get });
		});

		it('gets the first page without a query string', async () => {
			await getNotifications({ jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/notifications$/));
		});

		it('sends the cursor, URL-encoded, to get a later page', async () => {
			await getNotifications({ jwtToken: 'token123', cursor: '1700000000000_64b7f0a1c2d3e4f5a6b7c8ff' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/notifications\?cursor=1700000000000_64b7f0a1c2d3e4f5a6b7c8ff$/));
		});

		it('encodes characters that would break the query string', async () => {
			await getNotifications({ jwtToken: 'token123', cursor: 'a&b=c' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\?cursor=a%26b%3Dc$/));
		});

		it('resolves with the page', async () => {
			await expect(getNotifications({ jwtToken: 'token123' })).resolves.toEqual({ notifications: [], hasMore: false, nextCursor: null });
		});
	});

	describe('markAllNotificationsRead', () => {
		it('posts to the mark-all-read endpoint with the token', async () => {
			const post = jest.fn().mockResolvedValue(undefined);

			requestFactory.mockReturnValue({ post });

			await markAllNotificationsRead({ jwtToken: 'token123', cutoff: '2026-11-05T10:00:00.000Z' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/notifications\/mark-all-read$/), { cutoff: '2026-11-05T10:00:00.000Z' });
		});
	});
});
