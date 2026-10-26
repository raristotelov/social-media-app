import { useState, useEffect, useContext } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import useSessionGuard from '../../hooks/useSessionGuard';
import { getFollowers, getFollowing } from '../../services/userService';
import { getStoryViewers } from '../../services/storyService';
import { getUserPostLikes } from '../../services/userPostService';
import { getCommentLikes } from '../../services/commentService';
import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';
import { USER_LIST_TYPES, USER_LIST_TITLES, USER_LIST_EMPTY_MESSAGES } from '../../constants/userLists';

import Popup from '../Popup/Popup';
import SearchResults from '../SearchResults/SearchResults';

import './UserListPopup.css';

const USER_LIST_LOADERS = Object.freeze({
	[USER_LIST_TYPES.FOLLOWERS]: getFollowers,
	[USER_LIST_TYPES.FOLLOWING]: getFollowing,
	[USER_LIST_TYPES.VIEWERS]: getStoryViewers,
	[USER_LIST_TYPES.POST_LIKES]: getUserPostLikes,
	[USER_LIST_TYPES.COMMENT_LIKES]: getCommentLikes,
});

const UserListPopup = ({ userId, storyId, userPostId, commentId, listType, onClose, onAccountClick }) => {
	const [users, setUsers] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [hasLoadFailed, setHasLoadFailed] = useState(false);
	const [reloadCount, setReloadCount] = useState(0);

	const { jwtToken } = useContext(LoggedInUserContext);
	const { endSessionIfUnauthenticated } = useSessionGuard();

	useEffect(() => {
		let isCurrentRequest = true;

		setIsLoading(true);
		setHasLoadFailed(false);

		USER_LIST_LOADERS[listType]({ userId, storyId, userPostId, commentId, jwtToken })
			.then((result) => {
				if (isCurrentRequest) {
					setUsers(result);
				}
			})
			.catch((error) => {
				if (!isCurrentRequest) {
					return;
				}

				if (listType === USER_LIST_TYPES.VIEWERS) {
					endSessionIfUnauthenticated(error);
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
	}, [userId, storyId, userPostId, commentId, listType, jwtToken, reloadCount, endSessionIfUnauthenticated]);

	const retryLoad = () => {
		setReloadCount((count) => count + 1);
	};

	const isViewersList = listType === USER_LIST_TYPES.VIEWERS;

	return (
		<Popup
			title={USER_LIST_TITLES[listType]}
			className={isViewersList ? 'user-list-popup story-viewers-popup' : 'user-list-popup'}
			isBottomSheet={isViewersList}
			onClosePopupClick={onClose}
		>
			{hasLoadFailed && !isLoading ? (
				<p className='user-list-error' role='alert'>
					<span>{LOAD_ERROR_MESSAGES.USER_LIST.MESSAGE}</span>

					<span aria-hidden='true'>·</span>

					<button type='button' className='user-list-retry' onClick={retryLoad}>
						{LOAD_ERROR_MESSAGES.USER_LIST.RETRY_LABEL}
					</button>
				</p>
			) : (
				<SearchResults
					results={users}
					isLoading={isLoading}
					onResultClick={onAccountClick || onClose}
					className='user-list-results'
					showFollowersCount={false}
					emptyMessage={USER_LIST_EMPTY_MESSAGES[listType]}
				/>
			)}
		</Popup>
	);
};

export default UserListPopup;
