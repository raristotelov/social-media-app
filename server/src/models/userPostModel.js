const mongoose = require('mongoose');

const constants = require('../config/constants');

const UserPostSchema = new mongoose.Schema({
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
	caption: {
		type: String,
		maxlength: [constants.MAX_CAPTION_LENGTH, `Caption must be at most ${constants.MAX_CAPTION_LENGTH} characters`],
	},
	userId: {
		type: 'ObjectId',
		ref: 'User',
	},
	likes: [
		{
			type: 'ObjectId',
			ref: 'User',
		},
	],
	createdAt: {
		type: Date,
		default: Date.now,
	},
	updatedAt: {
		type: Date,
		default: Date.now,
	},
});

const model = mongoose.model('UserImage', UserPostSchema);
module.exports = model;
