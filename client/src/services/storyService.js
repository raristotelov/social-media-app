import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';
import { UPLOAD_FIELDS } from '../constants/validation';
import { buildFormData } from '../utils/formData';

export const addStory = ({ image }, jwtToken) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/stories`, buildFormData({ [UPLOAD_FIELDS.STORY_IMAGE]: image }));
};

export const getStoryTray = ({ jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/stories/tray`);
};

export const getUserStories = ({ userId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/stories/user/${userId}`);
};

export const markStoryViewed = ({ storyId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/stories/${storyId}/view`);
};

export const getStoryViewers = ({ storyId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/stories/${storyId}/viewers`);
};

export const deleteStory = ({ storyId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.delete(`${serverUrl}/stories/${storyId}`);
};
