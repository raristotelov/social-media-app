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

	return Math.max(
		0,
		stories.findIndex((story) => story.isWatched === false),
	);
};

export const getUpcomingStories = ({ queue, storiesByUserId, userIndex, storyIndex }) => {
	const nextStoryOfUser = storiesByUserId[queue[userIndex].user._id][storyIndex + 1];
	const nextUser = queue[userIndex + 1];
	const nextUserStories = nextUser ? storiesByUserId[nextUser.user._id] : [];
	const nextUserStartStory = nextUserStories[getStartStoryIndex(nextUserStories, STORY_START_TARGETS.FIRST_UNWATCHED)];

	return [nextStoryOfUser, nextUserStartStory].filter(Boolean);
};

export const getTrayStartStories = (entries, userCount) =>
	entries
		.slice(0, userCount)
		.map((entry) => entry.stories[getStartStoryIndex(entry.stories, STORY_START_TARGETS.FIRST_UNWATCHED)])
		.filter(Boolean);

export const isStoryAspectRatio = ({ imageWidth, imageHeight }) =>
	Math.abs(imageWidth / imageHeight - STORY_ASPECT_RATIO) <= STORY_ASPECT_RATIO_TOLERANCE;
