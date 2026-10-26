require('dotenv').config();
const config = require('./config/config');
const connectDb = require('./config/database');

const app = require('./app');
const { startExpiredStoriesJob } = require('./jobs/expiredStoriesJob');

connectDb().then(startExpiredStoriesJob);

app.listen(config.port, console.log(`Server is running on port ${config.port}`));
