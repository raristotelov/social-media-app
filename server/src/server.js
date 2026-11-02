require('dotenv').config();
const config = require('./config/config');
const connectDb = require('./config/database');

const app = require('./app');
const { startExpiredStoriesJob } = require('./jobs/expiredStoriesJob');
const { triggerDemoActivity } = require('./jobs/demoActivityJob');

connectDb().then(() => {
	startExpiredStoriesJob();
	triggerDemoActivity();
});

app.listen(config.port, console.log(`Server is running on port ${config.port}`));
