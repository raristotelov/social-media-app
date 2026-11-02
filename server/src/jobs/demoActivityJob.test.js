jest.mock('../demo/demoActivity', () => ({
	runDemoActivity: jest.fn(),
}));

const { runDemoActivity } = require('../demo/demoActivity');
const { triggerDemoActivity } = require('./demoActivityJob');

describe('demoActivityJob', () => {
	let consoleLogSpy;
	let consoleErrorSpy;

	beforeEach(() => {
		jest.resetAllMocks();
		consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		runDemoActivity.mockResolvedValue({ hoursRun: 0 });
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	it('runs the demo activity once per trigger', async () => {
		await triggerDemoActivity();

		expect(runDemoActivity).toHaveBeenCalledTimes(1);
	});

	it('logs how many hours it caught up when it ran any', async () => {
		runDemoActivity.mockResolvedValue({ hoursRun: 3 });

		await triggerDemoActivity();

		expect(consoleLogSpy).toHaveBeenCalledWith('Demo activity caught up 3 hours.');
	});

	it('stays quiet when no hour was due', async () => {
		await triggerDemoActivity();

		expect(consoleLogSpy).not.toHaveBeenCalled();
	});

	it('does not start a second run while one is still in progress', async () => {
		let finishRun;

		runDemoActivity.mockReturnValueOnce(
			new Promise((resolve) => {
				finishRun = resolve;
			}),
		);

		const firstRun = triggerDemoActivity();

		await triggerDemoActivity();
		await triggerDemoActivity();

		expect(runDemoActivity).toHaveBeenCalledTimes(1);

		finishRun({ hoursRun: 0 });
		await firstRun;
	});

	it('runs again once the previous run has finished', async () => {
		await triggerDemoActivity();
		await triggerDemoActivity();

		expect(runDemoActivity).toHaveBeenCalledTimes(2);
	});

	it('catches an error, logs it and does not throw', async () => {
		const error = new Error('db down');

		runDemoActivity.mockRejectedValue(error);

		await expect(triggerDemoActivity()).resolves.toBeUndefined();
		expect(consoleErrorSpy).toHaveBeenCalledWith('Could not run demo activity', error);
	});

	it('can run again after a run that failed', async () => {
		runDemoActivity.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce({ hoursRun: 1 });

		await triggerDemoActivity();
		await triggerDemoActivity();

		expect(runDemoActivity).toHaveBeenCalledTimes(2);
		expect(consoleLogSpy).toHaveBeenCalledWith('Demo activity caught up 1 hours.');
	});

	it('answers a trigger made during a failing run without starting another', async () => {
		let failRun;

		runDemoActivity.mockReturnValueOnce(
			new Promise((resolve, reject) => {
				failRun = reject;
			}),
		);

		const firstRun = triggerDemoActivity();

		await triggerDemoActivity();
		failRun(new Error('boom'));
		await firstRun;

		expect(runDemoActivity).toHaveBeenCalledTimes(1);
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
	});
});
