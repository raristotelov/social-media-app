import { MINUTES_PER_HOUR, MS_PER_MINUTE, STORY_ASPECT_RATIO, STORY_ASPECT_RATIO_TOLERANCE, STORY_START_TARGETS } from '../constants/stories';

const MIN_DISPLAYED_MINUTES = 1;

export const formatStoryAge = (createdAt, now = Date.now()) => {
	const minutes = Math.max(MIN_DISPLAYED_MINUTES, Math.floor((now - new Date(createdAt).getTime()) / MS_PER_MINUTE));

	if (minutes < MINUTES_PER_HOUR) {
		return `${minutes}m`;
	}

	return `${Math.floor(minutes / MINUTES_PER_HOUR)}h`;
};

export const getStartStoryIndex = (stories, target) => {
	if (target === STORY_START_TARGETS.LAST) {
		return Math.max(0, stories.length - 1);
	}

	if (target === STORY_START_TARGETS.FIRST_UNWATCHED) {
		return Math.max(
			0,
			stories.findIndex((story) => story.isWatched === false),
		);
	}

	return 0;
};

export const isStoryAspectRatio = ({ imageWidth, imageHeight }) =>
	Math.abs(imageWidth / imageHeight - STORY_ASPECT_RATIO) <= STORY_ASPECT_RATIO_TOLERANCE;
