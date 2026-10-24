import { useCallback, useContext, useRef } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import ToastContext from '../contexts/ToastContext';
import { followUser, unfollowUser } from '../services/userService';
import { ACTION_FALLBACK_MESSAGES } from '../constants/errorMessages';
import { getErrorMessage, isUnauthenticatedError } from '../utils/errors';

const useFollowActions = () => {
	const { jwtToken, loggedInUser, updateLoggedInUser, endSession } = useContext(LoggedInUserContext);
	const { showToast } = useContext(ToastContext);

	const startedRequestCountRef = useRef(0);
	const lastAppliedRequestRef = useRef(0);

	const runRequest = useCallback(
		async (sendRequest, fallbackMessage) => {
			startedRequestCountRef.current += 1;

			const requestId = startedRequestCountRef.current;

			try {
				const updatedUserData = await sendRequest();

				if (requestId > lastAppliedRequestRef.current) {
					lastAppliedRequestRef.current = requestId;
					updateLoggedInUser(updatedUserData);
				}

				return true;
			} catch (error) {
				if (isUnauthenticatedError(error)) {
					endSession();
				} else {
					showToast(getErrorMessage(error, fallbackMessage));
				}

				return false;
			}
		},
		[updateLoggedInUser, endSession, showToast],
	);

	const follow = useCallback(
		(userIdToFollow) =>
			runRequest(() => followUser({ userId: loggedInUser?._id, jwtToken, userIdToFollow }), ACTION_FALLBACK_MESSAGES.FOLLOW_USER),
		[runRequest, loggedInUser, jwtToken],
	);

	const unfollow = useCallback(
		(userIdToUnfollow) =>
			runRequest(() => unfollowUser({ userId: loggedInUser?._id, jwtToken, userIdToUnfollow }), ACTION_FALLBACK_MESSAGES.UNFOLLOW_USER),
		[runRequest, loggedInUser, jwtToken],
	);

	return { follow, unfollow };
};

export default useFollowActions;
