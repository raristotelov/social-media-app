const constants = require('../config/constants');
const storyService = require('../services/storyService');

const runExpiredStoriesCleanup = async () => {
	try {
		const deletedCount = await storyService.deleteExpiredStories();

		if (deletedCount > 0) {
			console.log(`Deleted ${deletedCount} expired stories.`);
		}
	} catch (error) {
		console.error('Could not clean up expired stories', error);
	}
};

const startExpiredStoriesJob = () => {
	runExpiredStoriesCleanup();

	return setInterval(runExpiredStoriesCleanup, constants.EXPIRED_STORIES_JOB_INTERVAL_MS);
};

module.exports = {
	startExpiredStoriesJob,
};
