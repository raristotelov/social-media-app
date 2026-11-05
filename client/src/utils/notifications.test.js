import { NOTIFICATION_TARGET_STATE_KEY, NOTIFICATION_TYPES } from '../constants/notifications';
import {
	formatNotificationAge,
	getNotificationMessage,
	getNotificationProfilePath,
	getNotificationTarget,
	isNotificationUnread,
} from './notifications';

const NOW = new Date('2026-11-05T12:00:00.000Z').getTime();
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const buildNotification = (overrides = {}) => ({
	_id: 'n1',
	type: NOTIFICATION_TYPES.POST_LIKE,
	createdAt: new Date(NOW).toISOString(),
	actor: { _id: 'user2', username: 'janedoe' },
	post: { _id: 'post1', imageUrl: 'https://example.com/post1.jpg', userId: 'user1' },
	excerpt: null,
	...overrides,
});

describe('notifications utils', () => {
	describe('formatNotificationAge', () => {
		it.each([
			['just now (never 0m)', 0, '1m'],
			['30 seconds ago', 30 * SECOND_MS, '1m'],
			['5 minutes ago', 5 * MINUTE_MS, '5m'],
			['59 minutes ago', 59 * MINUTE_MS, '59m'],
			['exactly an hour ago', HOUR_MS, '1h'],
			['23 hours ago', 23 * HOUR_MS, '23h'],
			['exactly a day ago', DAY_MS, '1d'],
			['6 days ago', 6 * DAY_MS, '6d'],
			['exactly a week ago', 7 * DAY_MS, '1w'],
			['13 days ago', 13 * DAY_MS, '1w'],
			['14 days ago', 14 * DAY_MS, '2w'],
			['a year ago', 365 * DAY_MS, '52w'],
		])('shows %s as %s', (_name, ageMs, expected) => {
			expect(formatNotificationAge(new Date(NOW - ageMs).toISOString(), NOW)).toBe(expected);
		});

		it('defaults to the current time', () => {
			expect(formatNotificationAge(new Date(Date.now() - 2 * HOUR_MS).toISOString())).toBe('2h');
		});
	});

	describe('getNotificationMessage', () => {
		it.each([
			[NOTIFICATION_TYPES.FOLLOW, null, 'started following you.'],
			[NOTIFICATION_TYPES.POST_LIKE, null, 'liked your post.'],
			[NOTIFICATION_TYPES.COMMENT_LIKE, 'great shot', 'liked your comment: great shot'],
			[NOTIFICATION_TYPES.COMMENT, 'great shot', 'commented: great shot'],
			[NOTIFICATION_TYPES.REPLY, 'great shot', 'replied to your comment: great shot'],
			[NOTIFICATION_TYPES.REPLY_ON_POST, 'great shot', 'replied to a comment on your post: great shot'],
		])('words a %s notification as the spec says', (type, excerpt, expected) => {
			expect(getNotificationMessage({ type, excerpt })).toBe(expected);
		});
	});

	describe('getNotificationProfilePath', () => {
		it('points at the profile of the actor', () => {
			expect(getNotificationProfilePath(buildNotification())).toBe('/user/user2');
		});
	});

	describe('getNotificationTarget', () => {
		it('opens the actor profile for a follow, with no navigation state', () => {
			expect(getNotificationTarget(buildNotification({ type: NOTIFICATION_TYPES.FOLLOW, post: null }))).toEqual({ to: '/user/user2' });
		});

		it('opens the posts view of the post owner at the post for a post like, without opening comments', () => {
			expect(getNotificationTarget(buildNotification())).toEqual({
				to: '/user/user1/posts#post1',
				state: { [NOTIFICATION_TARGET_STATE_KEY]: { postId: 'post1', shouldOpenComments: false } },
			});
		});

		it.each([[NOTIFICATION_TYPES.COMMENT_LIKE], [NOTIFICATION_TYPES.COMMENT], [NOTIFICATION_TYPES.REPLY], [NOTIFICATION_TYPES.REPLY_ON_POST]])(
			'asks to open the comments for a %s notification',
			(type) => {
				expect(getNotificationTarget(buildNotification({ type, excerpt: 'hi' }))).toEqual({
					to: '/user/user1/posts#post1',
					state: { [NOTIFICATION_TARGET_STATE_KEY]: { postId: 'post1', shouldOpenComments: true } },
				});
			},
		);
	});

	describe('isNotificationUnread', () => {
		const unreadSince = '2026-11-05T10:00:00.000Z';

		it('is false for everything when nothing was unread', () => {
			expect(isNotificationUnread(buildNotification(), null)).toBe(false);
		});

		it('is false when unreadSince is missing', () => {
			expect(isNotificationUnread(buildNotification(), undefined)).toBe(false);
		});

		it('is true at exactly the oldest unread time', () => {
			expect(isNotificationUnread(buildNotification({ createdAt: unreadSince }), unreadSince)).toBe(true);
		});

		it('is true for anything newer than the oldest unread time', () => {
			expect(isNotificationUnread(buildNotification({ createdAt: '2026-11-05T11:00:00.000Z' }), unreadSince)).toBe(true);
		});

		it('is false for anything older', () => {
			expect(isNotificationUnread(buildNotification({ createdAt: '2026-11-05T09:59:59.000Z' }), unreadSince)).toBe(false);
		});
	});
});
