import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';
import { UPLOAD_FIELDS } from '../constants/validation';
import { buildFormData } from '../utils/formData';

export const getAllUserPosts = (jwtToken) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/user-posts`);
};

export const addUserPost = ({ image, caption }, jwtToken) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/user-posts`, buildFormData({ [UPLOAD_FIELDS.POST_IMAGE]: image, caption }));
};

export const updateUserPostCaption = ({ userPostId, caption, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.patch(`${serverUrl}/user-posts/${userPostId}`, { caption });
};

export const deleteUserPost = ({ userPostId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.delete(`${serverUrl}/user-posts/${userPostId}`);
};

export const getFollowedUsersPosts = ({ jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/user-posts/followed-users-posts`);
};

export const likeUserPost = ({ userPostToLikeId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/user-posts/like/${userPostToLikeId}`);
};

export const unlikeUserPost = ({ userPostToUnlikeId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/user-posts/unlike/${userPostToUnlikeId}`);
};
