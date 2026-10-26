const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const routes = require('./router.js');
const errorHandler = require('./middlewares/errorHandler');
const { POPULAR_BODY_LIMIT_BYTES } = require('./config/popularPosts');

const app = express();

app.use(cors());
app.post('/user-posts/popular', bodyParser.json({ limit: POPULAR_BODY_LIMIT_BYTES }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(routes);

app.use(errorHandler);

module.exports = app;
