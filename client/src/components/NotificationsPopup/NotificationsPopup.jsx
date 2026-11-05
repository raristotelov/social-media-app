import { useRef } from 'react';

import useLoadMoreOnScroll from '../../hooks/useLoadMoreOnScroll';
import useNotifications from '../../hooks/useNotifications';
import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';
import { NOTIFICATIONS_EMPTY_STATE, NOTIFICATIONS_TITLE } from '../../constants/notifications';
import { isNotificationUnread } from '../../utils/notifications';

import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import LoadMoreFooter from '../LoadMoreFooter/LoadMoreFooter';
import NotificationRow from '../NotificationRow/NotificationRow';
import Popup from '../Popup/Popup';

import './NotificationsPopup.css';

const NotificationsPopup = ({ onClose }) => {
	const listRef = useRef(null);

	const { notifications, unreadSince, hasMore, isLoading, hasLoadFailed, isLoadingMore, hasLoadMoreFailed, canLoadMore, reload, loadMore } =
		useNotifications();

	useLoadMoreOnScroll({ elementRef: listRef, onLoadMore: loadMore, isEnabled: canLoadMore });

	const isEmpty = !isLoading && !hasMore && !notifications.length;

	const renderContent = () => {
		if (isLoading) {
			return <LoadingSpinner />;
		}

		if (isEmpty) {
			return (
				<div className='notifications-empty'>
					<p className='notifications-empty-heading'>{NOTIFICATIONS_EMPTY_STATE.HEADING}</p>

					<p className='notifications-empty-description'>{NOTIFICATIONS_EMPTY_STATE.DESCRIPTION}</p>
				</div>
			);
		}

		return (
			<>
				<ul className='notifications-rows'>
					{notifications.map((notification) => (
						<NotificationRow
							key={notification._id}
							notification={notification}
							isUnread={isNotificationUnread(notification, unreadSince)}
							onClick={onClose}
						/>
					))}
				</ul>

				<LoadMoreFooter
					isLoadingMore={isLoadingMore}
					hasLoadMoreFailed={hasLoadMoreFailed}
					onRetryClick={loadMore}
					messages={LOAD_ERROR_MESSAGES.NOTIFICATIONS_NEXT_BATCH}
				/>
			</>
		);
	};

	return (
		<Popup title={NOTIFICATIONS_TITLE} className='user-list-popup notifications-popup' onClosePopupClick={onClose}>
			{hasLoadFailed && !isLoading ? (
				<p className='user-list-error' role='alert'>
					<span>{LOAD_ERROR_MESSAGES.USER_LIST.MESSAGE}</span>

					<span aria-hidden='true'>·</span>

					<button type='button' className='user-list-retry' onClick={reload}>
						{LOAD_ERROR_MESSAGES.USER_LIST.RETRY_LABEL}
					</button>
				</p>
			) : (
				<div className='notifications-list' ref={listRef}>
					{renderContent()}
				</div>
			)}
		</Popup>
	);
};

export default NotificationsPopup;
