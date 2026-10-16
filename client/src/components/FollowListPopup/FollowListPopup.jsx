import { useState, useEffect, useContext } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getFollowers, getFollowing } from '../../services/userService';
import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';
import { FOLLOW_LIST_TYPES, FOLLOW_LIST_TITLES } from '../../constants/followLists';

import Popup from '../Popup/Popup';
import SearchResults from '../SearchResults/SearchResults';

import './FollowListPopup.css';

const FOLLOW_LIST_LOADERS = Object.freeze({
	[FOLLOW_LIST_TYPES.FOLLOWERS]: getFollowers,
	[FOLLOW_LIST_TYPES.FOLLOWING]: getFollowing,
});

const FollowListPopup = ({ userId, listType, onClose }) => {
	const [users, setUsers] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [hasLoadFailed, setHasLoadFailed] = useState(false);
	const [reloadCount, setReloadCount] = useState(0);

	const { jwtToken } = useContext(LoggedInUserContext);

	useEffect(() => {
		let isCurrentRequest = true;

		setIsLoading(true);
		setHasLoadFailed(false);

		FOLLOW_LIST_LOADERS[listType]({ userId, jwtToken })
			.then((result) => {
				if (isCurrentRequest) {
					setUsers(result);
				}
			})
			.catch(() => {
				if (isCurrentRequest) {
					setHasLoadFailed(true);
				}
			})
			.finally(() => {
				if (isCurrentRequest) {
					setIsLoading(false);
				}
			});

		return () => {
			isCurrentRequest = false;
		};
	}, [userId, listType, jwtToken, reloadCount]);

	const retryLoad = () => {
		setReloadCount((count) => count + 1);
	};

	return (
		<Popup title={FOLLOW_LIST_TITLES[listType]} className='follow-list-popup' onClosePopupClick={onClose}>
			{hasLoadFailed && !isLoading ? (
				<p className='follow-list-error' role='alert'>
					<span>{LOAD_ERROR_MESSAGES.FOLLOW_LIST.MESSAGE}</span>

					<span aria-hidden='true'>·</span>

					<button type='button' className='follow-list-retry' onClick={retryLoad}>
						{LOAD_ERROR_MESSAGES.FOLLOW_LIST.RETRY_LABEL}
					</button>
				</p>
			) : (
				<SearchResults results={users} isLoading={isLoading} onResultClick={onClose} className='follow-list-results' />
			)}
		</Popup>
	);
};

export default FollowListPopup;
