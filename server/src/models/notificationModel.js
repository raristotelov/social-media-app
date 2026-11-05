const mongoose = require('mongoose');

const constants = require('../config/constants');

const NotificationSchema = new mongoose.Schema({
	recipientId: {
		type: 'ObjectId',
		ref: 'User',
		required: true,
	},
	actorId: {
		type: 'ObjectId',
		ref: 'User',
		required: true,
	},
	type: {
		type: String,
		enum: Object.values(constants.NOTIFICATION_TYPES),
		required: true,
	},
	userPostId: {
		type: 'ObjectId',
		ref: 'UserImage',
	},
	commentId: {
		type: 'ObjectId',
		ref: 'Comment',
	},
	isRead: {
		type: Boolean,
		default: false,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
});

NotificationSchema.index({ recipientId: 1, createdAt: -1, _id: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: 1, _id: 1 });
NotificationSchema.index({ recipientId: 1, actorId: 1, type: 1, userPostId: 1, commentId: 1 }, { unique: true });
NotificationSchema.index({ actorId: 1 });
NotificationSchema.index({ userPostId: 1 });
NotificationSchema.index({ commentId: 1 });

const model = mongoose.model('Notification', NotificationSchema);
module.exports = model;
