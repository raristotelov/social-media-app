export const SUGGESTION_PLACEMENTS = Object.freeze({
	SIDEBAR: 'sidebar',
	CAROUSEL: 'carousel',
	EMPTY_FEED: 'empty-feed',
});

export const PLACEMENTS_KEEPING_FOLLOWED = Object.freeze([SUGGESTION_PLACEMENTS.EMPTY_FEED]);

export const SUGGESTION_GROUPS = Object.freeze({
	MUTUAL: 'mutual',
	POPULAR: 'popular',
	NEW: 'new',
});

export const SUGGESTION_GROUP_ORDER = Object.freeze([SUGGESTION_GROUPS.MUTUAL, SUGGESTION_GROUPS.POPULAR, SUGGESTION_GROUPS.NEW]);

export const SUGGESTED_USER_ACTION_STYLES = Object.freeze({
	LINK: 'link',
	BUTTON: 'button',
});

export const SUGGESTIONS_HEADING = 'Suggested for you';

export const DISMISS_SUGGESTIONS_LABEL = 'Dismiss suggestions';

export const CAROUSEL_POSTS_BEFORE = 5;
