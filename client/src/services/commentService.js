import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';

export const getComments = ({ userPostId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/comments/post/${userPostId}`);
};

export const addComment = ({ userPostId, text, parentCommentId, mentionedUserId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/comments`, { userPostId, text, parentCommentId, mentionedUserId });
};

export const likeComment = ({ commentId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/comments/${commentId}/like`);
};

export const getCommentLikes = ({ commentId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/comments/${commentId}/likes`);
};

export const unlikeComment = ({ commentId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/comments/${commentId}/unlike`);
};
