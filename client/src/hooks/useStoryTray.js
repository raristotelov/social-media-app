import { useCallback, useContext, useEffect, useState } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { getStoryTray } from '../services/storyService';
import { isUnauthenticatedError } from '../utils/errors';

const useStoryTray = () => {
	const [entries, setEntries] = useState([]);
	const [isLoaded, setIsLoaded] = useState(false);
	const [reloadCount, setReloadCount] = useState(0);

	const { loggedInUser, endSession } = useContext(LoggedInUserContext);

	const loggedInUserId = loggedInUser?._id;

	useEffect(() => {
		let isCurrentRequest = true;

		getStoryTray()
			.then((result) => {
				if (isCurrentRequest) {
					setEntries(result);
					setIsLoaded(true);
				}
			})
			.catch((error) => {
				if (isCurrentRequest && isUnauthenticatedError(error)) {
					endSession();
				}
			});

		return () => {
			isCurrentRequest = false;
		};
	}, [loggedInUserId, endSession, reloadCount]);

	const reload = useCallback(() => {
		setReloadCount((count) => count + 1);
	}, []);

	return { entries, isLoaded, reload };
};

export default useStoryTray;
