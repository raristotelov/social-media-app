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

export const getProfileViaApi = (userId) => cy.request(`${serverUrl}/users?userIds=${userId}`).then((response) => response.body[0]);

export const searchUsersViaApi = (searchWord) =>
	cy.request({ method: 'GET', url: `${serverUrl}/users`, qs: { searchWord } }).then((response) => response.body);

export const followUserViaApi = (jwtToken, userIdToFollow) =>
	cy.request({
		method: 'POST',
		url: `${serverUrl}/users/${userIdFromToken(jwtToken)}/follow/${userIdToFollow}`,
		headers: authHeaders(jwtToken),
	});

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

export const setThemeViaApi = (jwtToken, theme) =>
	cy.request({
		method: 'PATCH',
		url: `${serverUrl}/users/update/${userIdFromToken(jwtToken)}`,
		headers: authHeaders(jwtToken),
		body: { theme },
	});
