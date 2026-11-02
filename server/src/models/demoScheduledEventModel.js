const mongoose = require('mongoose');

const DemoScheduledEventSchema = new mongoose.Schema({
	dueAt: {
		type: Date,
		required: true,
	},
	type: {
		type: String,
		enum: ['postLike', 'comment', 'commentLike'],
		required: true,
	},
	userPostId: {
		type: 'ObjectId',
		ref: 'UserImage',
		required: true,
	},
	userId: {
		type: 'ObjectId',
		ref: 'User',
		required: true,
	},
	commentId: {
		type: 'ObjectId',
		ref: 'Comment',
	},
	text: {
		type: String,
	},
	parentCommentId: {
		type: 'ObjectId',
		ref: 'Comment',
	},
	mentionedUserId: {
		type: 'ObjectId',
		ref: 'User',
	},
});

DemoScheduledEventSchema.index({ dueAt: 1 });
DemoScheduledEventSchema.index({ userPostId: 1 });

const model = mongoose.model('DemoScheduledEvent', DemoScheduledEventSchema);
module.exports = model;
