jest.mock('../services/storyService', () => ({
	deleteExpiredStories: jest.fn(),
}));

const storyService = require('../services/storyService');
const constants = require('../config/constants');
const { startExpiredStoriesJob } = require('./expiredStoriesJob');

const flushPromises = async () => {
	for (let turn = 0; turn < 5; turn += 1) {
		await Promise.resolve();
	}
};

describe('expiredStoriesJob', () => {
	let consoleLogSpy;
	let consoleErrorSpy;
	let timer;

	beforeEach(() => {
		jest.resetAllMocks();
		jest.useFakeTimers();
		consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		storyService.deleteExpiredStories.mockResolvedValue(0);
	});

	afterEach(() => {
		clearInterval(timer);
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		jest.useRealTimers();
	});

	it('runs a cleanup straight away on start', async () => {
		timer = startExpiredStoriesJob();
		await flushPromises();

		expect(storyService.deleteExpiredStories).toHaveBeenCalledTimes(1);
	});

	it('repeats the cleanup every hour', async () => {
		timer = startExpiredStoriesJob();
		await flushPromises();

		jest.advanceTimersByTime(constants.EXPIRED_STORIES_JOB_INTERVAL_MS);
		await flushPromises();
		jest.advanceTimersByTime(constants.EXPIRED_STORIES_JOB_INTERVAL_MS);
		await flushPromises();

		expect(storyService.deleteExpiredStories).toHaveBeenCalledTimes(3);
	});

	it('does not run again before the hour is up', async () => {
		timer = startExpiredStoriesJob();
		await flushPromises();

		jest.advanceTimersByTime(constants.EXPIRED_STORIES_JOB_INTERVAL_MS - 1);
		await flushPromises();

		expect(storyService.deleteExpiredStories).toHaveBeenCalledTimes(1);
	});

	it('logs how many stories it deleted when there were any', async () => {
		storyService.deleteExpiredStories.mockResolvedValue(4);

		timer = startExpiredStoriesJob();
		await flushPromises();

		expect(consoleLogSpy).toHaveBeenCalledWith('Deleted 4 expired stories.');
	});

	it('does not keep the process alive just for the hourly timer', async () => {
		timer = startExpiredStoriesJob();
		await flushPromises();

		expect(timer.hasRef()).toBe(false);
	});

	it('skips a tick while the previous run is still in flight', async () => {
		let finishRun;

		storyService.deleteExpiredStories.mockReturnValueOnce(
			new Promise((resolve) => {
				finishRun = resolve;
			}),
		);

		timer = startExpiredStoriesJob();
		await flushPromises();

		jest.advanceTimersByTime(constants.EXPIRED_STORIES_JOB_INTERVAL_MS);
		await flushPromises();

		expect(storyService.deleteExpiredStories).toHaveBeenCalledTimes(1);

		finishRun(0);
		await flushPromises();
	});

	it('runs again on the next tick once the slow run has finished', async () => {
		let finishRun;

		storyService.deleteExpiredStories.mockReturnValueOnce(
			new Promise((resolve) => {
				finishRun = resolve;
			}),
		);

		timer = startExpiredStoriesJob();
		await flushPromises();
		finishRun(0);
		await flushPromises();

		jest.advanceTimersByTime(constants.EXPIRED_STORIES_JOB_INTERVAL_MS);
		await flushPromises();

		expect(storyService.deleteExpiredStories).toHaveBeenCalledTimes(2);
	});

	it('runs again on the next tick after a run that failed', async () => {
		storyService.deleteExpiredStories.mockRejectedValueOnce(new Error('db down'));

		timer = startExpiredStoriesJob();
		await flushPromises();
		jest.advanceTimersByTime(constants.EXPIRED_STORIES_JOB_INTERVAL_MS);
		await flushPromises();

		expect(storyService.deleteExpiredStories).toHaveBeenCalledTimes(2);
	});

	it('stays quiet when nothing expired', async () => {
		timer = startExpiredStoriesJob();
		await flushPromises();

		expect(consoleLogSpy).not.toHaveBeenCalled();
	});

	it('logs a failed cleanup without throwing', async () => {
		storyService.deleteExpiredStories.mockRejectedValue(new Error('db down'));

		timer = startExpiredStoriesJob();
		await flushPromises();

		expect(consoleErrorSpy).toHaveBeenCalledWith('Could not clean up expired stories', expect.any(Error));
	});

	it('retries on the next run after a failed cleanup', async () => {
		storyService.deleteExpiredStories.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(2);

		timer = startExpiredStoriesJob();
		await flushPromises();
		jest.advanceTimersByTime(constants.EXPIRED_STORIES_JOB_INTERVAL_MS);
		await flushPromises();

		expect(storyService.deleteExpiredStories).toHaveBeenCalledTimes(2);
		expect(consoleLogSpy).toHaveBeenCalledWith('Deleted 2 expired stories.');
	});
});
