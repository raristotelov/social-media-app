import useSuggestions from '../../hooks/useSuggestions';
import { SUGGESTED_USER_ACTION_STYLES, SUGGESTION_PLACEMENTS, SUGGESTIONS_HEADING } from '../../constants/suggestions';

import SuggestedUser from '../SuggestedUser/SuggestedUser';

import './EmptyFeedSuggestions.css';

const EmptyFeedSuggestions = ({ onFollowChange }) => {
	const { suggestions, followedIds, isLoaded, followSuggestion, unfollowSuggestion } = useSuggestions(SUGGESTION_PLACEMENTS.EMPTY_FEED, {
		onFollowChange,
	});

	if (!isLoaded || !suggestions.length) {
		return null;
	}

	return (
		<section className='empty-feed-suggestions' aria-label={SUGGESTIONS_HEADING}>
			{suggestions.map((suggestion) => (
				<SuggestedUser
					key={suggestion._id}
					suggestion={suggestion}
					actionStyle={SUGGESTED_USER_ACTION_STYLES.BUTTON}
					isFollowed={followedIds.includes(suggestion._id)}
					onFollowClick={followSuggestion}
					onUnfollowClick={unfollowSuggestion}
				/>
			))}
		</section>
	);
};

export default EmptyFeedSuggestions;
