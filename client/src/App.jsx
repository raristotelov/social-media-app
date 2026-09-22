import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';

import useLocalStorage from './hooks/useLocalStorage';
import LoggedInUserContext from './contexts/LoggedInUserContext';
import { getUsersProfileData } from './services/userService';

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

		const abandonSession = () => {
			setJwtToken(null);
			navigate('/log-in');
		};

		const userId = readUserIdFromToken(jwtToken);

		if (!userId) {
			abandonSession();

			return;
		}

		setIsRestoringSession(true);

		getUsersProfileData({ userIds: [userId], jwtToken })
			.then((result) => {
				if (result[0]) {
					setLoggedInUser(result[0]);
				} else {
					abandonSession();
				}
			})
			.catch((error) => {
				if (error?.status === 401 || error?.status === 403) {
					abandonSession();
				}
			})
			.finally(() => {
				setIsRestoringSession(false);
			});
	}, [jwtToken, loggedInUser, setJwtToken, navigate]);

	const updateLoggedInUser = (updatedUser) => {
		setLoggedInUser(updatedUser.user);
		setJwtToken(updatedUser.jwt);
	};

	const logoutHandler = (e) => {
		e.preventDefault();

		setJwtToken(null);
		navigate('/log-in');
	};

	const loggedInUserContextValues = {
		jwtToken,
		setJwtToken,
		loggedInUser,
		updateLoggedInUser,
		setLoggedInUser,
		isRestoringSession,
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
