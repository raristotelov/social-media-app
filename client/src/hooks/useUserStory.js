import { useCallback, useContext, useEffect, useState } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { getUserStory } from '../services/storyService';
import { STORY_START_TARGETS } from '../constants/stories';
import { getStartStoryIndex } from '../utils/stories';

const useUserStory = (userId) => {
	const [loadedUserStory, setLoadedUserStory] = useState(null);

	const { loggedInUser } = useContext(LoggedInUserContext);

	const loggedInUserId = loggedInUser?._id;

	useEffect(() => {
		let isCurrentRequest = true;

		getUserStory({ userId })
			.then((result) => {
				if (isCurrentRequest) {
					setLoadedUserStory({ userId, ...result });
				}
			})
			.catch(() => {
				if (isCurrentRequest) {
					setLoadedUserStory(null);
				}
			});

		return () => {
			isCurrentRequest = false;
		};
	}, [userId, loggedInUserId]);

	const replaceStories = useCallback(
		(stories) => {
			setLoadedUserStory({ userId, story: stories[getStartStoryIndex(stories, STORY_START_TARGETS.FIRST_UNWATCHED)] ?? null, stories });
		},
		[userId],
	);

	const userStory = loadedUserStory?.userId === userId ? loadedUserStory : null;

	return { userStory, replaceStories };
};

export default useUserStory;
