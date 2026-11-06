const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const routes = require('./router.js');
const config = require('./config/config');
const errorHandler = require('./middlewares/errorHandler');
const { POPULAR_BODY_LIMIT_BYTES } = require('./config/popularPosts');
const constants = require('./config/constants');

const app = express();

app.set('trust proxy', constants.PROXY_HOPS);

app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(cookieParser());
app.post('/user-posts/popular', express.json({ limit: POPULAR_BODY_LIMIT_BYTES }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(routes);

app.use(errorHandler);

module.exports = app;
