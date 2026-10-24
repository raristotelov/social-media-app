const mongoose = require('mongoose');

const constants = require('../config/constants');

const UserSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
		unique: true,
		trim: true,
		match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
	},
	username: {
		type: String,
		required: true,
		unique: true,
	},
	password: {
		type: String,
		required: true,
	},
	bio: {
		type: String,
		maxlength: [constants.MAX_BIO_LENGTH, `Bio must be at most ${constants.MAX_BIO_LENGTH} characters`],
	},
	// A string rather than a boolean so 'system' can be added without a migration.
	theme: {
		type: String,
		enum: ['light', 'dark'],
		default: 'light',
	},
	profilePicture: {
		type: new mongoose.Schema(
			{
				imageUrl: { type: String, required: true },
				imageIdentifier: { type: String, required: true },
			},
			{ _id: false },
		),
		default: undefined,
	},
	posts: [
		{
			type: 'ObjectId',
			ref: 'UserImage',
		},
	],
	following: [
		{
			type: 'ObjectId',
			ref: 'User',
		},
	],
	followers: [
		{
			type: 'ObjectId',
			ref: 'User',
		},
	],
	suggestionsCarouselDismissedUntil: {
		type: Date,
	},
});

const model = mongoose.model('User', UserSchema);
module.exports = model;
