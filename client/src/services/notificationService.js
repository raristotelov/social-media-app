import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';

export const getUnreadNotificationCount = () => {
	const request = requestFactory();

	return request.get(`${serverUrl}/notifications/unread-count`);
};

export const getNotifications = ({ cursor } = {}) => {
	const request = requestFactory();

	const queryString = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';

	return request.get(`${serverUrl}/notifications${queryString}`);
};

export const markAllNotificationsRead = ({ cutoff }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/notifications/mark-all-read`, { cutoff });
};
