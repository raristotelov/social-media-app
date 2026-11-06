import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';

export const getComments = ({ userPostId }) => {
	const request = requestFactory();

	return request.get(`${serverUrl}/comments/post/${userPostId}`);
};

export const addComment = ({ userPostId, text, parentCommentId, mentionedUserId }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/comments`, { userPostId, text, parentCommentId, mentionedUserId });
};

export const likeComment = ({ commentId }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/comments/${commentId}/like`);
};

export const getCommentLikes = ({ commentId }) => {
	const request = requestFactory();

	return request.get(`${serverUrl}/comments/${commentId}/likes`);
};

export const unlikeComment = ({ commentId }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/comments/${commentId}/unlike`);
};
