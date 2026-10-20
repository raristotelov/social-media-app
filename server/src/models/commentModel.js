const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
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
	text: {
		type: String,
		required: true,
	},
	likes: [
		{
			type: 'ObjectId',
			ref: 'User',
		},
	],
	// When set, this comment is a reply to the referenced comment (one level only).
	parentCommentId: {
		type: 'ObjectId',
		ref: 'Comment',
		default: null,
	},
	mentionedUserId: {
		type: 'ObjectId',
		ref: 'User',
		default: null,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
});

const model = mongoose.model('Comment', CommentSchema);
module.exports = model;
