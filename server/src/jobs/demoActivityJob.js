const { runDemoActivity } = require('../demo/demoActivity');

let isRunning = false;

const triggerDemoActivity = async () => {
	if (isRunning) {
		return;
	}

	isRunning = true;

	try {
		const { hoursRun } = await runDemoActivity();

		if (hoursRun > 0) {
			console.log(`Demo activity caught up ${hoursRun} hours.`);
		}
	} catch (error) {
		console.error('Could not run demo activity', error);
	} finally {
		isRunning = false;
	}
};

module.exports = {
	triggerDemoActivity,
};
