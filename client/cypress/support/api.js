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
