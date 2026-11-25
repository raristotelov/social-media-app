import { APP_NAME } from '../constants/app';
import { SUGGESTION_GROUPS } from '../constants/suggestions';

export const getSuggestionReason = (suggestion) => {
	if (suggestion.group === SUGGESTION_GROUPS.MUTUAL && suggestion.followedBy) {
		const moreCount = suggestion.moreMutualCount ?? 0;

		return moreCount > 0 ? `Followed by ${suggestion.followedBy.username} + ${moreCount} more` : `Followed by ${suggestion.followedBy.username}`;
	}

	if (suggestion.group === SUGGESTION_GROUPS.NEW) {
		return `New to ${APP_NAME}`;
	}

	return `Popular on ${APP_NAME}`;
};
