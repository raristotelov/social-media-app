import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotificationsContext from '../../contexts/NotificationsContext';
import { getUnreadNotificationCount } from '../../services/notificationService';
import { NOTIFICATIONS_POLL_INTERVAL_MS } from '../../constants/notifications';
import { isUnauthenticatedError } from '../../utils/errors';

const NotificationsProvider = ({ children }) => {
	const [unreadCount, setUnreadCount] = useState(0);

	const { loggedInUser, endSession } = useContext(LoggedInUserContext);

	const clearCountRef = useRef(0);

	const isLoggedIn = Boolean(loggedInUser);

	useEffect(() => {
		if (!isLoggedIn) {
			setUnreadCount(0);

			return undefined;
		}

		let isActive = true;
		let intervalId = null;

		const refreshUnreadCount = async () => {
			const clearCountAtRequestStart = clearCountRef.current;

			try {
				const { count } = await getUnreadNotificationCount();

				if (isActive && clearCountAtRequestStart === clearCountRef.current) {
					setUnreadCount(count);
				}
			} catch (error) {
				if (isActive && isUnauthenticatedError(error)) {
					endSession();
				}
			}
		};

		const startPolling = () => {
			if (intervalId !== null) {
				return;
			}

			refreshUnreadCount();

			intervalId = window.setInterval(refreshUnreadCount, NOTIFICATIONS_POLL_INTERVAL_MS);
		};

		const stopPolling = () => {
			window.clearInterval(intervalId);

			intervalId = null;
		};

		const syncPollingWithVisibility = () => {
			if (document.visibilityState === 'visible') {
				startPolling();
			} else {
				stopPolling();
			}
		};

		syncPollingWithVisibility();

		document.addEventListener('visibilitychange', syncPollingWithVisibility);

		return () => {
			isActive = false;

			stopPolling();

			document.removeEventListener('visibilitychange', syncPollingWithVisibility);
		};
	}, [isLoggedIn, endSession]);

	const clearUnreadCount = useCallback(() => {
		clearCountRef.current += 1;

		setUnreadCount(0);
	}, []);

	const notificationsContextValues = useMemo(() => ({ unreadCount, clearUnreadCount }), [unreadCount, clearUnreadCount]);

	return <NotificationsContext.Provider value={notificationsContextValues}>{children}</NotificationsContext.Provider>;
};

export default NotificationsProvider;
