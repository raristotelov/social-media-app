import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import NotificationsContext from '../contexts/NotificationsContext';
import { getNotifications, markAllNotificationsRead } from '../services/notificationService';
import { isUnauthenticatedError } from '../utils/errors';

const useNotifications = () => {
	const [notifications, setNotifications] = useState([]);
	const [unreadSince, setUnreadSince] = useState(null);
	const [hasMore, setHasMore] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [hasLoadFailed, setHasLoadFailed] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasLoadMoreFailed, setHasLoadMoreFailed] = useState(false);
	const [reloadCount, setReloadCount] = useState(0);

	const { endSession } = useContext(LoggedInUserContext);
	const { clearUnreadCount } = useContext(NotificationsContext);

	const nextCursorRef = useRef(null);
	const isLoadingMoreRef = useRef(false);
	const loadGenerationRef = useRef(0);

	useEffect(() => {
		let isCurrentRequest = true;

		loadGenerationRef.current += 1;

		setIsLoading(true);
		setHasLoadFailed(false);

		const markAllRead = (cutoff) =>
			markAllNotificationsRead({ cutoff })
				.then(clearUnreadCount)
				.catch((error) => {
					if (isUnauthenticatedError(error)) {
						endSession();
					}
				});

		getNotifications()
			.then((result) => {
				if (!isCurrentRequest) {
					return;
				}

				nextCursorRef.current = result.nextCursor;

				setNotifications(result.notifications);
				setUnreadSince(result.unreadSince);
				setHasMore(result.hasMore);
				setHasLoadMoreFailed(false);

				markAllRead(result.fetchedAt);
			})
			.catch((error) => {
				if (!isCurrentRequest) {
					return;
				}

				if (isUnauthenticatedError(error)) {
					endSession();

					return;
				}

				setHasLoadFailed(true);
			})
			.finally(() => {
				if (isCurrentRequest) {
					setIsLoading(false);
				}
			});

		return () => {
			isCurrentRequest = false;
		};
	}, [reloadCount, endSession, clearUnreadCount]);

	const reload = useCallback(() => {
		setReloadCount((count) => count + 1);
	}, []);

	const loadMore = useCallback(async () => {
		if (!hasMore || isLoadingMoreRef.current) {
			return;
		}

		const loadGeneration = loadGenerationRef.current;

		isLoadingMoreRef.current = true;

		setIsLoadingMore(true);
		setHasLoadMoreFailed(false);

		try {
			const result = await getNotifications({ cursor: nextCursorRef.current });

			if (loadGeneration !== loadGenerationRef.current) {
				return;
			}

			nextCursorRef.current = result.nextCursor;

			setNotifications((state) => [
				...state,
				...result.notifications.filter((item) => !state.some((loadedItem) => loadedItem._id === item._id)),
			]);
			setHasMore(result.hasMore);
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				endSession();
			} else if (loadGeneration === loadGenerationRef.current) {
				setHasLoadMoreFailed(true);
			}
		} finally {
			isLoadingMoreRef.current = false;

			setIsLoadingMore(false);
		}
	}, [hasMore, endSession]);

	const canLoadMore = hasMore && !isLoading && !hasLoadFailed && !isLoadingMore && !hasLoadMoreFailed;

	return { notifications, unreadSince, hasMore, isLoading, hasLoadFailed, isLoadingMore, hasLoadMoreFailed, canLoadMore, reload, loadMore };
};

export default useNotifications;
