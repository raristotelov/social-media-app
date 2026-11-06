import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';
import { UPLOAD_FIELDS } from '../constants/validation';
import { buildFormData } from '../utils/formData';

export const signUp = (data) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/users/sign-up`, data);
};

export const login = (data) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/users/login`, data);
};

export const demoLogin = () => {
	const request = requestFactory();

	return request.post(`${serverUrl}/users/demo-login`);
};

export const logout = () => {
	const request = requestFactory();

	return request.post(`${serverUrl}/users/logout`);
};

export const getCurrentUser = () => {
	const request = requestFactory();

	return request.get(`${serverUrl}/users/me`);
};

export const changePassword = ({ currentPassword, newPassword }) => {
	const request = requestFactory();

	return request.patch(`${serverUrl}/users/password`, { currentPassword, newPassword });
};

export const getUsersProfileData = ({ userIds, searchWord }) => {
	const request = requestFactory();

	let requestUrl = `${serverUrl}/users?`;

	if (userIds?.length) {
		requestUrl = requestUrl.concat('userIds=', userIds.join(','));
	}

	if (searchWord) {
		requestUrl = requestUrl.concat('searchWord=', encodeURIComponent(searchWord));
	}

	return request.get(requestUrl);
};

export const getFollowers = ({ userId }) => {
	const request = requestFactory();

	return request.get(`${serverUrl}/users/${userId}/followers`);
};

export const getFollowing = ({ userId }) => {
	const request = requestFactory();

	return request.get(`${serverUrl}/users/${userId}/following`);
};

export const updateUserProfileData = ({ userId, updatedProfileData }) => {
	const request = requestFactory();

	const isUploadingProfilePicture = updatedProfileData[UPLOAD_FIELDS.PROFILE_PICTURE] instanceof Blob;

	return request.patch(`${serverUrl}/users/update/${userId}`, isUploadingProfilePicture ? buildFormData(updatedProfileData) : updatedProfileData);
};

export const followUser = ({ userId, userIdToFollow }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/users/${userId}/follow/${userIdToFollow}`);
};

export const unfollowUser = ({ userId, userIdToUnfollow }) => {
	const request = requestFactory();

	return request.post(`${serverUrl}/users/${userId}/unfollow/${userIdToUnfollow}`);
};
