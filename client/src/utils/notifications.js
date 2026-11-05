import { MINUTES_PER_HOUR, MS_PER_MINUTE } from '../constants/stories';
import {
	COMMENT_NOTIFICATION_TYPES,
	DAYS_PER_WEEK,
	HOURS_PER_DAY,
	NOTIFICATION_MESSAGES,
	NOTIFICATION_TARGET_STATE_KEY,
	NOTIFICATION_TYPES,
} from '../constants/notifications';
import { formatStoryAge } from './stories';

export const formatNotificationAge = (createdAt, now = Date.now()) => {
	const hours = Math.floor((now - new Date(createdAt).getTime()) / (MS_PER_MINUTE * MINUTES_PER_HOUR));

	if (hours < HOURS_PER_DAY) {
		return formatStoryAge(createdAt, now);
	}

	const days = Math.floor(hours / HOURS_PER_DAY);

	if (days < DAYS_PER_WEEK) {
		return `${days}d`;
	}

	return `${Math.floor(days / DAYS_PER_WEEK)}w`;
};

export const getNotificationMessage = ({ type, excerpt }) => {
	const message = NOTIFICATION_MESSAGES[type];

	return excerpt ? `${message} ${excerpt}` : message;
};

export const getNotificationProfilePath = ({ actor }) => `/user/${actor._id}`;

export const getNotificationTarget = (notification) => {
	if (notification.type === NOTIFICATION_TYPES.FOLLOW) {
		return { to: getNotificationProfilePath(notification) };
	}

	const { _id: postId, userId: postOwnerId } = notification.post;

	return {
		to: `/user/${postOwnerId}/posts#${postId}`,
		state: {
			[NOTIFICATION_TARGET_STATE_KEY]: {
				postId,
				shouldOpenComments: COMMENT_NOTIFICATION_TYPES.includes(notification.type),
			},
		},
	};
};

export const isNotificationUnread = ({ createdAt }, unreadSince) => Boolean(unreadSince) && new Date(createdAt) >= new Date(unreadSince);
