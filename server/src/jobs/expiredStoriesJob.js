const constants = require('../config/constants');
const storyService = require('../services/storyService');

let isCleanupRunning = false;

const runExpiredStoriesCleanup = async () => {
	if (isCleanupRunning) {
		return;
	}

	isCleanupRunning = true;

	try {
		const deletedCount = await storyService.deleteExpiredStories();

		if (deletedCount > 0) {
			console.log(`Deleted ${deletedCount} expired stories.`);
		}
	} catch (error) {
		console.error('Could not clean up expired stories', error);
	} finally {
		isCleanupRunning = false;
	}
};

const startExpiredStoriesJob = () => {
	runExpiredStoriesCleanup();

	const timer = setInterval(runExpiredStoriesCleanup, constants.EXPIRED_STORIES_JOB_INTERVAL_MS);

	timer.unref();

	return timer;
};

module.exports = {
	startExpiredStoriesJob,
};
