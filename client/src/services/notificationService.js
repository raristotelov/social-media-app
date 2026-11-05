import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';

export const getUnreadNotificationCount = ({ jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/notifications/unread-count`);
};

export const getNotifications = ({ jwtToken, cursor }) => {
	const request = requestFactory(jwtToken);

	const queryString = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';

	return request.get(`${serverUrl}/notifications${queryString}`);
};

export const markAllNotificationsRead = ({ jwtToken, cutoff }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/notifications/mark-all-read`, { cutoff });
};
