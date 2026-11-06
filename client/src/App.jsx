import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { useNavigate } from 'react-router';

import useLocalStorage from './hooks/useLocalStorage';
import LoggedInUserContext from './contexts/LoggedInUserContext';
import ToastContext from './contexts/ToastContext';
import { getCurrentUser, logout } from './services/userService';
import { APP_NAME } from './constants/app';
import { ACTION_FALLBACK_MESSAGES } from './constants/errorMessages';
import { getErrorMessage } from './utils/errors';

import DemoStrip from './components/DemoStrip/DemoStrip';
import MainHeader from './components/Header/MainHeader';
import MobileTopBar from './components/Header/MobileTopBar';
import TabBar from './components/TabBar/TabBar';
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner';
import NotFoundProvider from './components/NotFoundProvider/NotFoundProvider';
import NotificationsProvider from './components/NotificationsProvider/NotificationsProvider';
import Router from './Router';

import './App.css';

const getOperatingSystemTheme = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function App() {
	const { showToast } = useContext(ToastContext);

	const [loggedInUser, setLoggedInUser] = useState(null);
	const [isRestoringSession, setIsRestoringSession] = useState(true);
	const [storedTheme, setStoredTheme] = useLocalStorage('theme', null);

	const navigate = useNavigate();
	const navigateRef = useRef(navigate);

	useEffect(() => {
		navigateRef.current = navigate;
	}, [navigate]);

	const endSession = useCallback(() => {
		setLoggedInUser(null);
		navigateRef.current('/log-in');
	}, []);

	useEffect(() => {
		document.title = APP_NAME;
	}, []);

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
		let isCancelled = false;

		getCurrentUser()
			.then((currentUser) => {
				if (!isCancelled) {
					setLoggedInUser(currentUser);
				}
			})
			.catch(() => {
				if (!isCancelled) {
					setLoggedInUser(null);
				}
			})
			.finally(() => {
				if (!isCancelled) {
					setIsRestoringSession(false);
				}
			});

		return () => {
			isCancelled = true;
		};
	}, []);

	const updateLoggedInUser = (updatedUser) => {
		setLoggedInUser(updatedUser.user);
	};

	const logoutHandler = async (e) => {
		e.preventDefault();

		try {
			await logout();
		} catch (error) {
			showToast(getErrorMessage(error, ACTION_FALLBACK_MESSAGES.LOG_OUT));

			return;
		}

		endSession();
	};

	const loggedInUserContextValues = {
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
			<NotFoundProvider>
				<NotificationsProvider>
					<DemoStrip />

					<MainHeader logoutHandler={logoutHandler} />

					<MobileTopBar logoutHandler={logoutHandler} />

					<Router />

					<TabBar />
				</NotificationsProvider>
			</NotFoundProvider>
		</LoggedInUserContext.Provider>
	);
}

export default App;
