import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';
import { UPLOAD_FIELDS } from '../constants/validation';
import { buildFormData } from '../utils/formData';

export const addStory = ({ image }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/stories`, buildFormData({ [UPLOAD_FIELDS.STORY_IMAGE]: image }));
};

export const getStoryTray = () => {
	const request = requestFactory();

	return request.get(`${serverUrl}/stories/tray`);
};

export const getUserStories = ({ userId }) => {
	const request = requestFactory();

	return request.get(`${serverUrl}/stories/user/${userId}`);
};

export const markStoryViewed = ({ storyId }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/stories/${storyId}/view`);
};

export const getStoryViewers = ({ storyId }) => {
	const request = requestFactory();

	return request.get(`${serverUrl}/stories/${storyId}/viewers`);
};

export const deleteStory = ({ storyId }) => {
	const request = requestFactory();

	return request.delete(`${serverUrl}/stories/${storyId}`);
};
