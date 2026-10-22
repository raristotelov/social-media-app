const mongoose = require('mongoose');

const StoryViewSchema = new mongoose.Schema({
	storyId: {
		type: 'ObjectId',
		ref: 'Story',
		required: true,
	},
	viewerId: {
		type: 'ObjectId',
		ref: 'User',
		required: true,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
});

StoryViewSchema.index({ storyId: 1, viewerId: 1 }, { unique: true });
StoryViewSchema.index({ viewerId: 1, storyId: 1 });

const model = mongoose.model('StoryView', StoryViewSchema);
module.exports = model;
