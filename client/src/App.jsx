import { useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';

import useLocalStorage from './hooks/useLocalStorage';
import LoggedInUserContext from './contexts/LoggedInUserContext';
import { getUsersProfileData } from './services/userService';
import { ERROR_CODES } from './constants/errorCodes';
import { getErrorCode } from './utils/errors';

import MainHeader from './components/Header/MainHeader';
import MobileTopBar from './components/Header/MobileTopBar';
import TabBar from './components/TabBar/TabBar';
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner';
import Router from './Router';

import './App.css';

const getOperatingSystemTheme = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const readUserIdFromToken = (token) => {
	try {
		const { userId, exp } = jwtDecode(token);

		if (typeof exp !== 'number' || exp * 1000 <= Date.now()) {
			return null;
		}

		return userId || null;
	} catch {
		return null;
	}
};

function App() {
	const [jwtToken, setJwtToken] = useLocalStorage('jwt-token', null);
	const [loggedInUser, setLoggedInUser] = useState(null);
	const [isRestoringSession, setIsRestoringSession] = useState(Boolean(jwtToken));
	const [storedTheme, setStoredTheme] = useLocalStorage('theme', null);

	const navigate = useNavigate();

	const endSession = useCallback(() => {
		setJwtToken(null);
		navigate('/log-in');
	}, [setJwtToken, navigate]);

	useEffect(() => {
		const theme = loggedInUser?.theme || storedTheme || getOperatingSystemTheme();

		document.documentElement.setAttribute('data-theme', theme);

		if (loggedInUser?.theme && loggedInUser.theme !== storedTheme) {
			setStoredTheme(loggedInUser.theme);
		}
	}, [loggedInUser, storedTheme, setStoredTheme]);

	useEffect(() => {
		if (loggedInUser?.theme || storedTheme) {
			return;
		}

		const query = window.matchMedia('(prefers-color-scheme: dark)');
		const applyOperatingSystemTheme = () => document.documentElement.setAttribute('data-theme', getOperatingSystemTheme());

		query.addEventListener('change', applyOperatingSystemTheme);

		return () => query.removeEventListener('change', applyOperatingSystemTheme);
	}, [loggedInUser, storedTheme]);

	useEffect(() => {
		if (!jwtToken) {
			setLoggedInUser(null);
			setIsRestoringSession(false);

			return;
		}

		if (loggedInUser) {
			return;
		}

		const userId = readUserIdFromToken(jwtToken);

		if (!userId) {
			endSession();

			return;
		}

		setIsRestoringSession(true);

		getUsersProfileData({ userIds: [userId], jwtToken })
			.then((result) => {
				if (result[0]) {
					setLoggedInUser(result[0]);
				} else {
					endSession();
				}
			})
			.catch((error) => {
				const errorCode = getErrorCode(error);

				if (errorCode === ERROR_CODES.UNAUTHENTICATED || errorCode === ERROR_CODES.USER_NOT_FOUND) {
					endSession();
				}
			})
			.finally(() => {
				setIsRestoringSession(false);
			});
	}, [jwtToken, loggedInUser, endSession]);

	const updateLoggedInUser = (updatedUser) => {
		setLoggedInUser(updatedUser.user);
		setJwtToken(updatedUser.jwt);
	};

	const logoutHandler = (e) => {
		e.preventDefault();

		endSession();
	};

	const loggedInUserContextValues = {
		jwtToken,
		setJwtToken,
		loggedInUser,
		updateLoggedInUser,
		setLoggedInUser,
		isRestoringSession,
		endSession,
	};

	if (isRestoringSession) {
		return <LoadingSpinner isFullPage />;
	}

	return (
		<LoggedInUserContext.Provider value={loggedInUserContextValues}>
			<MainHeader logoutHandler={logoutHandler} />

			<MobileTopBar logoutHandler={logoutHandler} />

			<Router />

			<TabBar />
		</LoggedInUserContext.Provider>
	);
}

export default App;
