import { useState, useEffect, useContext } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import useSessionGuard from '../../hooks/useSessionGuard';
import { getFollowers, getFollowing } from '../../services/userService';
import { getStoryViewers } from '../../services/storyService';
import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';
import { FOLLOW_LIST_TYPES, FOLLOW_LIST_TITLES } from '../../constants/followLists';

import Popup from '../Popup/Popup';
import SearchResults from '../SearchResults/SearchResults';

import './FollowListPopup.css';

const FOLLOW_LIST_LOADERS = Object.freeze({
	[FOLLOW_LIST_TYPES.FOLLOWERS]: getFollowers,
	[FOLLOW_LIST_TYPES.FOLLOWING]: getFollowing,
	[FOLLOW_LIST_TYPES.VIEWERS]: getStoryViewers,
});

const FollowListPopup = ({ userId, storyId, listType, onClose }) => {
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

		FOLLOW_LIST_LOADERS[listType]({ userId, storyId, jwtToken })
			.then((result) => {
				if (isCurrentRequest) {
					setUsers(result);
				}
			})
			.catch((error) => {
				if (!isCurrentRequest) {
					return;
				}

				if (listType === FOLLOW_LIST_TYPES.VIEWERS) {
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
	}, [userId, storyId, listType, jwtToken, reloadCount, endSessionIfUnauthenticated]);

	const retryLoad = () => {
		setReloadCount((count) => count + 1);
	};

	const isViewersList = listType === FOLLOW_LIST_TYPES.VIEWERS;

	return (
		<Popup
			title={FOLLOW_LIST_TITLES[listType]}
			className={isViewersList ? 'follow-list-popup story-viewers-popup' : 'follow-list-popup'}
			bodyClassName={isViewersList ? 'bottom-sheet' : undefined}
			onClosePopupClick={onClose}
		>
			{hasLoadFailed && !isLoading ? (
				<p className='follow-list-error' role='alert'>
					<span>{LOAD_ERROR_MESSAGES.FOLLOW_LIST.MESSAGE}</span>

					<span aria-hidden='true'>·</span>

					<button type='button' className='follow-list-retry' onClick={retryLoad}>
						{LOAD_ERROR_MESSAGES.FOLLOW_LIST.RETRY_LABEL}
					</button>
				</p>
			) : (
				<SearchResults
					results={users}
					isLoading={isLoading}
					onResultClick={onClose}
					className='follow-list-results'
					showFollowersCount={false}
					emptyMessage={isViewersList ? 'No viewers yet' : undefined}
				/>
			)}
		</Popup>
	);
};

export default FollowListPopup;
