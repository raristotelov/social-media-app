require('dotenv').config({ quiet: true });
const config = require('./config/config');
const connectDb = require('./config/database');
const { getMissingSettings: getMissingCloudinarySettings } = require('./config/cloudinary');

const missingCloudinarySettings = getMissingCloudinarySettings();

if (missingCloudinarySettings.length) {
	console.error(`Server not started: missing Cloudinary settings ${missingCloudinarySettings.join(', ')}`);
	process.exit(1);
}

const app = require('./app');
const { startExpiredStoriesJob } = require('./jobs/expiredStoriesJob');
const { triggerDemoActivity } = require('./jobs/demoActivityJob');

connectDb().then(() => {
	startExpiredStoriesJob();
	triggerDemoActivity();
});

app.listen(config.port, console.log(`Server is running on port ${config.port}`));
