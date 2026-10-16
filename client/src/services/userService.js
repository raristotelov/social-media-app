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

export const getUsersProfileData = ({ userIds, searchWord, jwtToken }) => {
	const request = requestFactory(jwtToken);

	let requestUrl = `${serverUrl}/users?`;

	if (userIds?.length) {
		requestUrl = requestUrl.concat('userIds=', userIds.join(','));
	}

	if (searchWord) {
		requestUrl = requestUrl.concat('searchWord=', encodeURIComponent(searchWord));
	}

	return request.get(requestUrl);
};

export const getFollowers = ({ userId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/users/${userId}/followers`);
};

export const getFollowing = ({ userId, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/users/${userId}/following`);
};

export const updateUserProfileData = ({ userId, jwtToken, updatedProfileData }) => {
	const request = requestFactory(jwtToken);

	const isUploadingProfilePicture = updatedProfileData[UPLOAD_FIELDS.PROFILE_PICTURE] instanceof Blob;

	return request.patch(`${serverUrl}/users/update/${userId}`, isUploadingProfilePicture ? buildFormData(updatedProfileData) : updatedProfileData);
};

export const followUser = ({ userId, userIdToFollow, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/users/${userId}/follow/${userIdToFollow}`);
};

export const unfollowUser = ({ userId, userIdToUnfollow, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/users/${userId}/unfollow/${userIdToUnfollow}`);
};
