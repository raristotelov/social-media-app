import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';
import { UPLOAD_FIELDS } from '../constants/validation';
import { buildFormData } from '../utils/formData';

export const getAllUserPosts = () => {
	const request = requestFactory();

	return request.get(`${serverUrl}/user-posts`);
};

export const addUserPost = ({ image, caption }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/user-posts`, buildFormData({ [UPLOAD_FIELDS.POST_IMAGE]: image, caption }));
};

export const updateUserPostCaption = ({ userPostId, caption }) => {
	const request = requestFactory();

	return request.patch(`${serverUrl}/user-posts/${userPostId}`, { caption });
};

export const deleteUserPost = ({ userPostId }) => {
	const request = requestFactory();

	return request.delete(`${serverUrl}/user-posts/${userPostId}`);
};

export const getFollowedUsersPosts = ({ cursor } = {}) => {
	const request = requestFactory();

	const queryString = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';

	return request.get(`${serverUrl}/user-posts/followed-users-posts${queryString}`);
};

export const getPopularPosts = ({ firstPostId } = {}) => {
	const request = requestFactory();

	const queryString = firstPostId ? `?firstPostId=${encodeURIComponent(firstPostId)}` : '';

	return request.get(`${serverUrl}/user-posts/popular${queryString}`);
};

export const getNextPopularPosts = ({ snapshotTime, shownPostIds }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/user-posts/popular`, { snapshotTime, shownPostIds });
};

export const likeUserPost = ({ userPostToLikeId }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/user-posts/like/${userPostToLikeId}`);
};

export const getUserPostLikes = ({ userPostId }) => {
	const request = requestFactory();

	return request.get(`${serverUrl}/user-posts/${userPostId}/likes`);
};

export const unlikeUserPost = ({ userPostToUnlikeId }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/user-posts/unlike/${userPostToUnlikeId}`);
};
