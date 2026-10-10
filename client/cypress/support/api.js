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

const buildFakeImage = () => {
	const unique = `${Date.now()}${Math.floor(Math.random() * 100000)}`;

	return {
		imageIdentifier: `cypress_image_${unique}`,
		imageUrl: `data:image/gif;base64,R0lGODlhAQABAAAAACw=#${unique}`,
	};
};

export const createPostViaApi = (jwtToken, caption) =>
	cy
		.request({ method: 'POST', url: `${serverUrl}/user-posts`, headers: authHeaders(jwtToken), body: { ...buildFakeImage(), caption } })
		.then((response) => response.body);

export const setProfilePictureViaApi = (jwtToken) =>
	cy
		.request({
			method: 'PATCH',
			url: `${serverUrl}/users/update/${userIdFromToken(jwtToken)}`,
			headers: authHeaders(jwtToken),
			body: { profilePicture: buildFakeImage() },
		})
		.then((response) => response.body);

export const getProfileViaApi = (userId) => cy.request(`${serverUrl}/users?userIds=${userId}`).then((response) => response.body[0]);

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
