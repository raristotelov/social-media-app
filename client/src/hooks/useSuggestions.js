import { useCallback, useContext, useEffect, useReducer, useRef } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import useFollowActions from './useFollowActions';
import { dismissSuggestionsCarousel, getSuggestions } from '../services/suggestionService';
import { PLACEMENTS_KEEPING_FOLLOWED } from '../constants/suggestions';
import { isUnauthenticatedError } from '../utils/errors';
import { insertInGroupOrder } from '../utils/suggestions';

const ACTIONS = Object.freeze({
	LOAD_STARTED: 'load-started',
	LOADED: 'loaded',
	REMOVED: 'removed',
	RESTORED: 'restored',
	CONFIRMED: 'confirmed',
	FOLLOWED_SET: 'followed-set',
	CAROUSEL_DISMISSED: 'carousel-dismissed',
});

const INITIAL_STATE = Object.freeze({
	suggestions: [],
	reserve: [],
	removals: {},
	followedIds: [],
	isLoaded: false,
	isCarouselDismissed: false,
});

const withoutKey = (object, key) => Object.fromEntries(Object.entries(object).filter(([entryKey]) => entryKey !== key));

const removeSuggestion = (state, userId) => {
	const index = state.suggestions.findIndex((suggestion) => suggestion._id === userId);

	if (index === -1) {
		return state;
	}

	const [replacement, ...remainingReserve] = state.reserve;
	const remainingSuggestions = state.suggestions.filter((suggestion) => suggestion._id !== userId);

	return {
		...state,
		suggestions: replacement ? insertInGroupOrder(remainingSuggestions, replacement) : remainingSuggestions,
		reserve: remainingReserve,
		removals: { ...state.removals, [userId]: { suggestion: state.suggestions[index], index, replacement } },
	};
};

const restoreSuggestion = (state, userId) => {
	const removal = state.removals[userId];

	if (!removal) {
		return state;
	}

	const { suggestion, index, replacement } = removal;
	const isReplacementListed = Boolean(replacement) && state.suggestions.some((listed) => listed._id === replacement._id);
	const suggestionsWithoutReplacement = isReplacementListed
		? state.suggestions.filter((listed) => listed._id !== replacement._id)
		: state.suggestions;
	const restoreIndex = Math.min(index, suggestionsWithoutReplacement.length);

	return {
		...state,
		suggestions: [...suggestionsWithoutReplacement.slice(0, restoreIndex), suggestion, ...suggestionsWithoutReplacement.slice(restoreIndex)],
		reserve: isReplacementListed ? [replacement, ...state.reserve] : state.reserve,
		removals: withoutKey(state.removals, userId),
	};
};

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
				reserve: action.reserve,
				isCarouselDismissed: action.isCarouselDismissed,
				isLoaded: true,
			};
		case ACTIONS.REMOVED:
			return removeSuggestion(state, action.userId);
		case ACTIONS.RESTORED:
			return restoreSuggestion(state, action.userId);
		case ACTIONS.CONFIRMED:
			return { ...state, removals: withoutKey(state.removals, action.userId) };
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

	const { jwtToken, endSession } = useContext(LoggedInUserContext);
	const { follow, unfollow } = useFollowActions();

	const jwtTokenRef = useRef(jwtToken);
	const pendingUserIdsRef = useRef(new Set());

	const keepsFollowed = PLACEMENTS_KEEPING_FOLLOWED.includes(placement);

	useEffect(() => {
		jwtTokenRef.current = jwtToken;
	}, [jwtToken]);

	useEffect(() => {
		let isCurrentRequest = true;

		dispatch({ type: ACTIONS.LOAD_STARTED });

		getSuggestions({ placement, jwtToken: jwtTokenRef.current })
			.then((result) => {
				if (isCurrentRequest) {
					dispatch({
						type: ACTIONS.LOADED,
						suggestions: result.suggestions,
						reserve: result.reserve,
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
				dispatch(keepsFollowed ? { type: ACTIONS.FOLLOWED_SET, userId, isFollowed: true } : { type: ACTIONS.REMOVED, userId });

				const isFollowed = await follow(userId);

				if (keepsFollowed) {
					dispatch({ type: ACTIONS.FOLLOWED_SET, userId, isFollowed });
				} else {
					dispatch({ type: isFollowed ? ACTIONS.CONFIRMED : ACTIONS.RESTORED, userId });
				}

				if (isFollowed) {
					onFollowChange?.();
				}
			}),
		[runOncePerUser, keepsFollowed, follow, onFollowChange],
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
			await dismissSuggestionsCarousel({ jwtToken });
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				endSession();
			}
		}
	}, [jwtToken, endSession]);

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
