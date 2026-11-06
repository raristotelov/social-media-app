// Mirrors client/src/constants/serverUrl.js so specs talk to the same API the app does.
export const serverUrl = Cypress.expose('apiUrl') || 'http://localhost:5000';

export const AUTH_COOKIE_NAME = 'sessionToken';

export const cookieHeader = (value) => ({ Cookie: `${AUTH_COOKIE_NAME}=${value}` });

export const authHeaders = (session) => cookieHeader(session.value);

const guestHeaders = cookieHeader('');

const optionalAuthHeaders = (session) => (session ? authHeaders(session) : guestHeaders);

export const setSessionCookie = (value) => cy.setCookie(AUTH_COOKIE_NAME, value, { httpOnly: true, sameSite: 'lax' });

const apiRequest = (options) =>
	cy.getCookie(AUTH_COOKIE_NAME).then((pageSession) =>
		cy.request(options).then((response) => {
			const restoreBrowserSession = pageSession ? setSessionCookie(pageSession.value) : cy.clearCookie(AUTH_COOKIE_NAME);

			return restoreBrowserSession.then(() => response);
		}),
	);

const readSessionCookieValue = (response) => {
	const sessionCookie = (response.headers['set-cookie'] || []).find((cookie) => cookie.startsWith(`${AUTH_COOKIE_NAME}=`));

	return sessionCookie.split(';')[0].slice(AUTH_COOKIE_NAME.length + 1);
};

// Creates an account straight through the API, for specs that need a user to
// already exist rather than testing the sign-up screen itself.
export const createUserViaApi = (user) =>
	apiRequest({
		method: 'POST',
		url: `${serverUrl}/users/sign-up`,
		body: {
			email: user.email,
			username: user.username,
			password: user.password,
		},
	});

export const loginViaApi = (user) =>
	apiRequest({ method: 'POST', url: `${serverUrl}/users/login`, body: { email: user.email, password: user.password } }).then((response) => ({
		userId: response.body._id,
		value: readSessionCookieValue(response),
	}));

export const getCurrentUserViaApi = (session, failOnStatusCode = true) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/users/me`, headers: optionalAuthHeaders(session), failOnStatusCode });

export const visitAsUser = (path, session) => {
	setSessionCookie(session.value);

	return cy.visit(path);
};

export const userIdFromSession = (session) => session.userId;

const FIXTURE_IMAGE = 'test-image.png';

const loadFixtureImage = () =>
	cy
		.fixture(FIXTURE_IMAGE, 'binary')
		.then((binary) => new File([Cypress.Blob.binaryStringToBlob(binary, 'image/png')], FIXTURE_IMAGE, { type: 'image/png' }));

const decodeJsonBody = (body) => JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body));

const uploadImageViaApi = ({ method, url, session, imageField, fields = {} }) =>
	loadFixtureImage()
		.then((image) => {
			const body = new FormData();

			body.append(imageField, image);
			Object.entries(fields).forEach(([name, value]) => body.append(name, value));

			return apiRequest({ method, url, headers: authHeaders(session), body });
		})
		.then((response) => decodeJsonBody(response.body));

export const uploadPostViaApi = (session, caption) =>
	uploadImageViaApi({ method: 'POST', url: `${serverUrl}/user-posts`, session, imageField: 'image', fields: { caption } });

export const uploadProfilePictureViaApi = (session) =>
	uploadImageViaApi({
		method: 'PATCH',
		url: `${serverUrl}/users/update/${userIdFromSession(session)}`,
		session,
		imageField: 'profilePicture',
	}).then((response) => response.user.profilePicture);

export const getProfileViaApi = (userId, session) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/users?userIds=${userId}`, headers: optionalAuthHeaders(session) }).then(
		(response) => response.body[0],
	);

const getFollowListViaApi = (listPath, userId, session) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/users/${userId}/${listPath}`, headers: optionalAuthHeaders(session) }).then(
		(response) => response.body,
	);

export const getFollowersViaApi = (userId, session) => getFollowListViaApi('followers', userId, session);

export const getFollowingViaApi = (userId, session) => getFollowListViaApi('following', userId, session);

export const searchUsersViaApi = (searchWord) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/users`, qs: { searchWord }, headers: guestHeaders }).then((response) => response.body);

export const followUserViaApi = (session, userIdToFollow, { actingUserId = userIdFromSession(session), failOnStatusCode = true } = {}) =>
	apiRequest({
		method: 'POST',
		url: `${serverUrl}/users/${actingUserId}/follow/${userIdToFollow}`,
		headers: authHeaders(session),
		failOnStatusCode,
	});

export const unfollowUserViaApi = (session, userIdToUnfollow, { actingUserId = userIdFromSession(session), failOnStatusCode = true } = {}) =>
	apiRequest({
		method: 'POST',
		url: `${serverUrl}/users/${actingUserId}/unfollow/${userIdToUnfollow}`,
		headers: authHeaders(session),
		failOnStatusCode,
	});

export const updateProfileViaApi = (session, userId, body, failOnStatusCode = true) =>
	apiRequest({ method: 'PATCH', url: `${serverUrl}/users/update/${userId}`, headers: authHeaders(session), body, failOnStatusCode });

export const deletePostViaApi = (session, userPostId, failOnStatusCode = true) =>
	apiRequest({ method: 'DELETE', url: `${serverUrl}/user-posts/${userPostId}`, headers: authHeaders(session), failOnStatusCode });

export const editCaptionViaApi = (session, userPostId, caption, failOnStatusCode = true) =>
	apiRequest({
		method: 'PATCH',
		url: `${serverUrl}/user-posts/${userPostId}`,
		headers: authHeaders(session),
		body: { caption },
		failOnStatusCode,
	});

export const likePostViaApi = (session, userPostId) =>
	apiRequest({ method: 'POST', url: `${serverUrl}/user-posts/like/${userPostId}`, headers: authHeaders(session) }).then(
		(response) => response.body,
	);

export const unlikePostViaApi = (session, userPostId) =>
	apiRequest({ method: 'POST', url: `${serverUrl}/user-posts/unlike/${userPostId}`, headers: authHeaders(session) }).then(
		(response) => response.body,
	);

export const likeCommentViaApi = (session, commentId) =>
	apiRequest({ method: 'POST', url: `${serverUrl}/comments/${commentId}/like`, headers: authHeaders(session) }).then((response) => response.body);

export const addCommentViaApi = (session, userPostId, text, { parentCommentId, mentionedUserId } = {}) =>
	apiRequest({
		method: 'POST',
		url: `${serverUrl}/comments`,
		headers: authHeaders(session),
		body: { userPostId, text, parentCommentId, mentionedUserId },
	}).then((response) => response.body);

export const getCommentsViaApi = (userPostId) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/comments/post/${userPostId}`, headers: guestHeaders }).then((response) => response.body);

export const getFollowedUsersPostsViaApi = (session) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/user-posts/followed-users-posts`, headers: authHeaders(session) }).then(
		(response) => response.body.posts,
	);

export const uploadStoryViaApi = (session) => uploadImageViaApi({ method: 'POST', url: `${serverUrl}/stories`, session, imageField: 'image' });

export const publicIdFromImageUrl = (imageUrl) => new URL(imageUrl).pathname.replace(/^.*\/upload\/(v\d+\/)?/, '').replace(/\.[^./]+$/, '');

export const getStoryTrayViaApi = (session) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/stories/tray`, headers: authHeaders(session) }).then((response) => response.body);

export const getUserStoriesViaApi = (session, userId) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/stories/user/${userId}`, headers: authHeaders(session) }).then((response) => response.body);

export const recordStoryViewViaApi = (session, storyId) =>
	apiRequest({ method: 'POST', url: `${serverUrl}/stories/${storyId}/view`, headers: authHeaders(session) });

export const getStoryViewersViaApi = (session, storyId, failOnStatusCode = true) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/stories/${storyId}/viewers`, headers: authHeaders(session), failOnStatusCode });

export const deleteStoryViaApi = (session, storyId, failOnStatusCode = true) =>
	apiRequest({ method: 'DELETE', url: `${serverUrl}/stories/${storyId}`, headers: authHeaders(session), failOnStatusCode });

export const getSuggestionsViaApi = (session, placement) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/suggestions`, qs: { placement }, headers: authHeaders(session) }).then(
		(response) => response.body,
	);

export const dismissSuggestionsCarouselViaApi = (session) =>
	apiRequest({ method: 'POST', url: `${serverUrl}/suggestions/carousel/dismiss`, headers: authHeaders(session) });

export const getUnreadNotificationCountViaApi = (session) =>
	apiRequest({ method: 'GET', url: `${serverUrl}/notifications/unread-count`, headers: authHeaders(session) }).then(
		(response) => response.body.count,
	);

export const setThemeViaApi = (session, theme) =>
	apiRequest({
		method: 'PATCH',
		url: `${serverUrl}/users/update/${userIdFromSession(session)}`,
		headers: authHeaders(session),
		body: { theme },
	});
