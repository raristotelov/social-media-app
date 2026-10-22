export const STORY_DURATION_MS = 5000;

export const STORY_HOLD_THRESHOLD_MS = 200;

export const STORY_ASPECT_RATIO = 9 / 16;

export const STORY_ASPECT_RATIO_TOLERANCE = 0.02;

export const MS_PER_MINUTE = 60 * 1000;

export const MINUTES_PER_HOUR = 60;

export const CREATE_MODES = Object.freeze({
	POST: 'post',
	STORY: 'story',
});

export const CREATE_MODE_LABELS = Object.freeze({
	[CREATE_MODES.POST]: 'Post',
	[CREATE_MODES.STORY]: 'Story',
});

export const STORY_VIEWER_OVERLAYS = Object.freeze({
	VIEWERS: 'viewers',
	DELETE: 'delete',
});

export const STORY_START_TARGETS = Object.freeze({
	FIRST_UNWATCHED: 'first-unwatched',
	FIRST: 'first',
	LAST: 'last',
});

export const OWN_STORY_LABEL = 'Your story';

export const DELETE_STORY_MESSAGE = 'This story will be permanently deleted. This cannot be undone.';
