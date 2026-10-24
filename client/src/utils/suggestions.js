import { APP_NAME } from '../constants/app';
import { SUGGESTION_GROUPS, SUGGESTION_GROUP_ORDER } from '../constants/suggestions';

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

const getGroupRank = (suggestion) => SUGGESTION_GROUP_ORDER.indexOf(suggestion.group);

export const insertInGroupOrder = (suggestions, suggestion) => {
	const insertIndex = suggestions.findLastIndex((existing) => getGroupRank(existing) <= getGroupRank(suggestion)) + 1;

	return [...suggestions.slice(0, insertIndex), suggestion, ...suggestions.slice(insertIndex)];
};
