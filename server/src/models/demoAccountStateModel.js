const mongoose = require('mongoose');

const DemoAccountStateSchema = new mongoose.Schema({
	userId: {
		type: 'ObjectId',
		ref: 'User',
		required: true,
		unique: true,
	},
	username: {
		type: String,
		required: true,
	},
	tier: {
		type: String,
		enum: ['creator', 'casualPoster', 'lurker'],
		required: true,
	},
	folder: {
		type: String,
	},
	ownPhotos: [String],
	queue: [String],
	posted: [
		new mongoose.Schema(
			{
				postId: { type: 'ObjectId', ref: 'UserImage', required: true },
				source: { type: String, required: true },
				caption: { type: String },
				permanent: { type: Boolean, default: false },
			},
			{ _id: false },
		),
	],
	previousCaptions: [
		new mongoose.Schema(
			{
				source: { type: String, required: true },
				caption: { type: String },
			},
			{ _id: false },
		),
	],
});

const model = mongoose.model('DemoAccountState', DemoAccountStateSchema);
module.exports = model;
