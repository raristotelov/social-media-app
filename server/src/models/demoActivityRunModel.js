const mongoose = require('mongoose');

const DemoActivityRunSchema = new mongoose.Schema({
	lastCompletedHour: {
		type: Date,
		required: true,
	},
	followDay: {
		type: Date,
	},
	followCount: {
		type: Number,
		default: 0,
	},
});

const model = mongoose.model('DemoActivityRun', DemoActivityRunSchema);
module.exports = model;
