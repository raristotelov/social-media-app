const mongoose = require('mongoose');

const UserModel = require('../models/userModel');
const config = require('./demoConfig');
const { removeUsersWithContent } = require('./removeUsersWithContent');

const SECOND_MS = 1000;

const removeExpiredVisitors = async (now = new Date()) => {
	const createdBefore = mongoose.Types.ObjectId.createFromTime(Math.floor((now.getTime() - config.VISITOR_LIFETIME_MS) / SECOND_MS));
	const expiredVisitors = await UserModel.find({ accountType: 'demo', _id: { $lt: createdBefore } })
		.select({ _id: 1 })
		.lean();
	let removedCount = 0;

	for (const visitor of expiredVisitors) {
		try {
			removedCount += await removeUsersWithContent([visitor._id], { deleteUploadedImages: true });
		} catch (error) {
			console.error(`Could not remove demo visitor ${visitor._id}`, error);
		}
	}

	return removedCount;
};

module.exports = {
	removeExpiredVisitors,
};
