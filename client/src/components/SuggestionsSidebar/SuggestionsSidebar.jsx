import useSuggestions from '../../hooks/useSuggestions';
import { SUGGESTED_USER_ACTION_STYLES, SUGGESTION_PLACEMENTS, SUGGESTIONS_HEADING } from '../../constants/suggestions';

import SuggestedUser from '../SuggestedUser/SuggestedUser';

import './SuggestionsSidebar.css';

const SuggestionsSidebar = () => {
	const { suggestions, isLoaded, followSuggestion } = useSuggestions(SUGGESTION_PLACEMENTS.SIDEBAR);

	if (!isLoaded || !suggestions.length) {
		return null;
	}

	return (
		<aside className='suggestions-sidebar' aria-label={SUGGESTIONS_HEADING}>
			<h2 className='suggestions-sidebar-heading'>{SUGGESTIONS_HEADING}</h2>

			{suggestions.map((suggestion) => (
				<SuggestedUser
					key={suggestion._id}
					suggestion={suggestion}
					actionStyle={SUGGESTED_USER_ACTION_STYLES.LINK}
					onFollowClick={followSuggestion}
				/>
			))}
		</aside>
	);
};

export default SuggestionsSidebar;
