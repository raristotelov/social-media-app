const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema({
	imageIdentifier: {
		type: String,
		required: true,
		unique: true,
	},
	imageUrl: {
		type: String,
		required: true,
		unique: true,
	},
	imageWidth: {
		type: Number,
		required: true,
		min: 1,
	},
	imageHeight: {
		type: Number,
		required: true,
		min: 1,
	},
	userId: {
		type: 'ObjectId',
		ref: 'User',
		required: true,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
});

StorySchema.index({ userId: 1, createdAt: 1 });
StorySchema.index({ createdAt: 1 });

const model = mongoose.model('Story', StorySchema);
module.exports = model;
