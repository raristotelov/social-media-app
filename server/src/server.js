require('dotenv').config();
const config = require('./config/config');
const connectDb = require('./config/database');

const routes = require('./router.js');
const errorHandler = require('./middlewares/errorHandler');
const { startExpiredStoriesJob } = require('./jobs/expiredStoriesJob');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();

connectDb().then(startExpiredStoriesJob);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(routes);

app.use(errorHandler);

app.listen(config.port, console.log(`Server is running on port ${config.port}`));
