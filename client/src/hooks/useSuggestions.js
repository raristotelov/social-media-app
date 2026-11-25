import { useCallback, useContext, useEffect, useReducer, useRef } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import useFollowActions from './useFollowActions';
import { dismissSuggestionsCarousel, getSuggestions } from '../services/suggestionService';
import { isUnauthenticatedError } from '../utils/errors';

const ACTIONS = Object.freeze({
	LOAD_STARTED: 'load-started',
	LOADED: 'loaded',
	FOLLOWED_SET: 'followed-set',
	CAROUSEL_DISMISSED: 'carousel-dismissed',
});

const INITIAL_STATE = Object.freeze({
	suggestions: [],
	followedIds: [],
	isLoaded: false,
	isCarouselDismissed: false,
});

const setFollowed = (state, { userId, isFollowed }) => {
	const otherFollowedIds = state.followedIds.filter((followedId) => followedId !== userId);

	return { ...state, followedIds: isFollowed ? [...otherFollowedIds, userId] : otherFollowedIds };
};

const suggestionsReducer = (state, action) => {
	switch (action.type) {
		case ACTIONS.LOAD_STARTED:
			return INITIAL_STATE;
		case ACTIONS.LOADED:
			return {
				...INITIAL_STATE,
				suggestions: action.suggestions,
				isCarouselDismissed: action.isCarouselDismissed,
				isLoaded: true,
			};
		case ACTIONS.FOLLOWED_SET:
			return setFollowed(state, action);
		case ACTIONS.CAROUSEL_DISMISSED:
			return { ...state, isCarouselDismissed: true };
		default:
			return state;
	}
};

const useSuggestions = (placement, { onFollowChange } = {}) => {
	const [state, dispatch] = useReducer(suggestionsReducer, INITIAL_STATE);

	const { endSession } = useContext(LoggedInUserContext);
	const { follow, unfollow } = useFollowActions();

	const pendingUserIdsRef = useRef(new Set());

	useEffect(() => {
		let isCurrentRequest = true;

		dispatch({ type: ACTIONS.LOAD_STARTED });

		getSuggestions({ placement })
			.then((result) => {
				if (isCurrentRequest) {
					dispatch({
						type: ACTIONS.LOADED,
						suggestions: result.suggestions,
						isCarouselDismissed: result.isCarouselDismissed,
					});
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
	}, [placement, endSession]);

	const runOncePerUser = useCallback(async (userId, action) => {
		if (pendingUserIdsRef.current.has(userId)) {
			return;
		}

		pendingUserIdsRef.current.add(userId);

		try {
			await action();
		} finally {
			pendingUserIdsRef.current.delete(userId);
		}
	}, []);

	const followSuggestion = useCallback(
		(userId) =>
			runOncePerUser(userId, async () => {
				dispatch({ type: ACTIONS.FOLLOWED_SET, userId, isFollowed: true });

				const isFollowed = await follow(userId);

				if (!isFollowed) {
					dispatch({ type: ACTIONS.FOLLOWED_SET, userId, isFollowed: false });
				} else {
					onFollowChange?.();
				}
			}),
		[runOncePerUser, follow, onFollowChange],
	);

	const unfollowSuggestion = useCallback(
		(userId) =>
			runOncePerUser(userId, async () => {
				dispatch({ type: ACTIONS.FOLLOWED_SET, userId, isFollowed: false });

				const isUnfollowed = await unfollow(userId);

				if (!isUnfollowed) {
					dispatch({ type: ACTIONS.FOLLOWED_SET, userId, isFollowed: true });
				} else {
					onFollowChange?.();
				}
			}),
		[runOncePerUser, unfollow, onFollowChange],
	);

	const dismissCarousel = useCallback(async () => {
		dispatch({ type: ACTIONS.CAROUSEL_DISMISSED });

		try {
			await dismissSuggestionsCarousel();
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				endSession();
			}
		}
	}, [endSession]);

	return {
		suggestions: state.suggestions,
		followedIds: state.followedIds,
		isLoaded: state.isLoaded,
		isCarouselDismissed: state.isCarouselDismissed,
		followSuggestion,
		unfollowSuggestion,
		dismissCarousel,
	};
};

export default useSuggestions;
