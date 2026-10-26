// Mirrors client/src/constants/serverUrl.js so specs talk to the same API the app does.
export const serverUrl = Cypress.env('apiUrl') || 'http://localhost:5000';

// Creates an account straight through the API, for specs that need a user to
// already exist rather than testing the sign-up screen itself.
export const createUserViaApi = (user) =>
	cy.request('POST', `${serverUrl}/users/sign-up`, {
		email: user.email,
		username: user.username,
		password: user.password,
	});

export const loginViaApi = (user) =>
	cy.request('POST', `${serverUrl}/users/login`, { email: user.email, password: user.password }).then((response) => response.body);

export const visitAsUser = (path, jwtToken) =>
	cy.visit(path, {
		onBeforeLoad: (win) => {
			win.localStorage.setItem('jwt-token', JSON.stringify(jwtToken));
		},
	});

export const userIdFromToken = (jwtToken) => JSON.parse(atob(jwtToken.split('.')[1])).userId;

const authHeaders = (jwtToken) => ({ 'X-Authorization': jwtToken });

const FIXTURE_IMAGE = 'test-image.png';

const loadFixtureImage = () =>
	cy
		.fixture(FIXTURE_IMAGE, 'binary')
		.then((binary) => new File([Cypress.Blob.binaryStringToBlob(binary, 'image/png')], FIXTURE_IMAGE, { type: 'image/png' }));

const decodeJsonBody = (body) => JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body));

const uploadImageViaApi = ({ method, url, jwtToken, imageField, fields = {} }) =>
	loadFixtureImage()
		.then((image) => {
			const body = new FormData();

			body.append(imageField, image);
			Object.entries(fields).forEach(([name, value]) => body.append(name, value));

			return cy.request({ method, url, headers: authHeaders(jwtToken), body });
		})
		.then((response) => decodeJsonBody(response.body));

export const uploadPostViaApi = (jwtToken, caption) =>
	uploadImageViaApi({ method: 'POST', url: `${serverUrl}/user-posts`, jwtToken, imageField: 'image', fields: { caption } });

export const uploadProfilePictureViaApi = (jwtToken) =>
	uploadImageViaApi({
		method: 'PATCH',
		url: `${serverUrl}/users/update/${userIdFromToken(jwtToken)}`,
		jwtToken,
		imageField: 'profilePicture',
	}).then((response) => response.user.profilePicture);

export const getProfileViaApi = (userId, jwtToken) =>
	cy
		.request({ method: 'GET', url: `${serverUrl}/users?userIds=${userId}`, headers: jwtToken ? authHeaders(jwtToken) : {} })
		.then((response) => response.body[0]);

const getFollowListViaApi = (listPath, userId, jwtToken) =>
	cy
		.request({ method: 'GET', url: `${serverUrl}/users/${userId}/${listPath}`, headers: jwtToken ? authHeaders(jwtToken) : {} })
		.then((response) => response.body);

export const getFollowersViaApi = (userId, jwtToken) => getFollowListViaApi('followers', userId, jwtToken);

export const getFollowingViaApi = (userId, jwtToken) => getFollowListViaApi('following', userId, jwtToken);

export const searchUsersViaApi = (searchWord) =>
	cy.request({ method: 'GET', url: `${serverUrl}/users`, qs: { searchWord } }).then((response) => response.body);

export const followUserViaApi = (jwtToken, userIdToFollow, { actingUserId = userIdFromToken(jwtToken), failOnStatusCode = true } = {}) =>
	cy.request({
		method: 'POST',
		url: `${serverUrl}/users/${actingUserId}/follow/${userIdToFollow}`,
		headers: authHeaders(jwtToken),
		failOnStatusCode,
	});

export const unfollowUserViaApi = (jwtToken, userIdToUnfollow, { actingUserId = userIdFromToken(jwtToken), failOnStatusCode = true } = {}) =>
	cy.request({
		method: 'POST',
		url: `${serverUrl}/users/${actingUserId}/unfollow/${userIdToUnfollow}`,
		headers: authHeaders(jwtToken),
		failOnStatusCode,
	});

export const updateProfileViaApi = (jwtToken, userId, body, failOnStatusCode = true) =>
	cy.request({ method: 'PATCH', url: `${serverUrl}/users/update/${userId}`, headers: authHeaders(jwtToken), body, failOnStatusCode });

export const deletePostViaApi = (jwtToken, userPostId, failOnStatusCode = true) =>
	cy.request({ method: 'DELETE', url: `${serverUrl}/user-posts/${userPostId}`, headers: authHeaders(jwtToken), failOnStatusCode });

export const editCaptionViaApi = (jwtToken, userPostId, caption, failOnStatusCode = true) =>
	cy.request({
		method: 'PATCH',
		url: `${serverUrl}/user-posts/${userPostId}`,
		headers: authHeaders(jwtToken),
		body: { caption },
		failOnStatusCode,
	});

export const likePostViaApi = (jwtToken, userPostId) =>
	cy
		.request({ method: 'POST', url: `${serverUrl}/user-posts/like/${userPostId}`, headers: authHeaders(jwtToken) })
		.then((response) => response.body);

export const likeCommentViaApi = (jwtToken, commentId) =>
	cy.request({ method: 'POST', url: `${serverUrl}/comments/${commentId}/like`, headers: authHeaders(jwtToken) }).then((response) => response.body);

export const addCommentViaApi = (jwtToken, userPostId, text, { parentCommentId, mentionedUserId } = {}) =>
	cy
		.request({
			method: 'POST',
			url: `${serverUrl}/comments`,
			headers: authHeaders(jwtToken),
			body: { userPostId, text, parentCommentId, mentionedUserId },
		})
		.then((response) => response.body);

export const getCommentsViaApi = (userPostId) =>
	cy.request({ method: 'GET', url: `${serverUrl}/comments/post/${userPostId}` }).then((response) => response.body);

export const getFollowedUsersPostsViaApi = (jwtToken) =>
	cy
		.request({ method: 'GET', url: `${serverUrl}/user-posts/followed-users-posts`, headers: authHeaders(jwtToken) })
		.then((response) => response.body);

export const uploadStoryViaApi = (jwtToken) => uploadImageViaApi({ method: 'POST', url: `${serverUrl}/stories`, jwtToken, imageField: 'image' });

export const publicIdFromImageUrl = (imageUrl) => new URL(imageUrl).pathname.replace(/^.*\/upload\/(v\d+\/)?/, '').replace(/\.[^./]+$/, '');

export const getStoryTrayViaApi = (jwtToken) =>
	cy.request({ method: 'GET', url: `${serverUrl}/stories/tray`, headers: authHeaders(jwtToken) }).then((response) => response.body);

export const getUserStoriesViaApi = (jwtToken, userId) =>
	cy.request({ method: 'GET', url: `${serverUrl}/stories/user/${userId}`, headers: authHeaders(jwtToken) }).then((response) => response.body);

export const recordStoryViewViaApi = (jwtToken, storyId) =>
	cy.request({ method: 'POST', url: `${serverUrl}/stories/${storyId}/view`, headers: authHeaders(jwtToken) });

export const getStoryViewersViaApi = (jwtToken, storyId, failOnStatusCode = true) =>
	cy.request({ method: 'GET', url: `${serverUrl}/stories/${storyId}/viewers`, headers: authHeaders(jwtToken), failOnStatusCode });

export const deleteStoryViaApi = (jwtToken, storyId, failOnStatusCode = true) =>
	cy.request({ method: 'DELETE', url: `${serverUrl}/stories/${storyId}`, headers: authHeaders(jwtToken), failOnStatusCode });

export const getSuggestionsViaApi = (jwtToken, placement) =>
	cy
		.request({ method: 'GET', url: `${serverUrl}/suggestions`, qs: { placement }, headers: authHeaders(jwtToken) })
		.then((response) => response.body);

export const dismissSuggestionsCarouselViaApi = (jwtToken) =>
	cy.request({ method: 'POST', url: `${serverUrl}/suggestions/carousel/dismiss`, headers: authHeaders(jwtToken) });

export const setThemeViaApi = (jwtToken, theme) =>
	cy.request({
		method: 'PATCH',
		url: `${serverUrl}/users/update/${userIdFromToken(jwtToken)}`,
		headers: authHeaders(jwtToken),
		body: { theme },
	});
