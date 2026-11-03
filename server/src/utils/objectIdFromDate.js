const mongoose = require('mongoose');

const constants = require('../config/constants');

const objectIdFromDate = (date) => mongoose.Types.ObjectId.createFromTime(Math.floor(date.getTime() / constants.MS_PER_SECOND));

module.exports = objectIdFromDate;
