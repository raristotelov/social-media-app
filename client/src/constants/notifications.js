export const NOTIFICATIONS_POLL_INTERVAL_MS = 60 * 1000;

export const NOTIFICATIONS_BADGE_MAX_COUNT = 99;

export const NOTIFICATIONS_TITLE = 'Notifications';

export const NOTIFICATIONS_UNREAD_LABEL = 'Unread notifications';

export const NOTIFICATIONS_EMPTY_STATE = Object.freeze({
	HEADING: 'No notifications yet',
	DESCRIPTION: "When people follow you, like or comment on your posts, you'll see it here.",
});

export const NOTIFICATION_TYPES = Object.freeze({
	FOLLOW: 'follow',
	POST_LIKE: 'post-like',
	COMMENT_LIKE: 'comment-like',
	COMMENT: 'comment',
	REPLY: 'reply',
	REPLY_ON_POST: 'reply-on-post',
});

export const NOTIFICATION_MESSAGES = Object.freeze({
	[NOTIFICATION_TYPES.FOLLOW]: 'started following you.',
	[NOTIFICATION_TYPES.POST_LIKE]: 'liked your post.',
	[NOTIFICATION_TYPES.COMMENT_LIKE]: 'liked your comment:',
	[NOTIFICATION_TYPES.COMMENT]: 'commented:',
	[NOTIFICATION_TYPES.REPLY]: 'replied to your comment:',
	[NOTIFICATION_TYPES.REPLY_ON_POST]: 'replied to a comment on your post:',
});

export const COMMENT_NOTIFICATION_TYPES = Object.freeze([
	NOTIFICATION_TYPES.COMMENT_LIKE,
	NOTIFICATION_TYPES.COMMENT,
	NOTIFICATION_TYPES.REPLY,
	NOTIFICATION_TYPES.REPLY_ON_POST,
]);

export const NOTIFICATION_TARGET_STATE_KEY = 'notificationTarget';

export const HOURS_PER_DAY = 24;

export const DAYS_PER_WEEK = 7;
