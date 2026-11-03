const UserModel = require('../models/userModel');
const objectIdFromDate = require('../utils/objectIdFromDate');
const config = require('./demoConfig');
const { removeUsersWithContent } = require('./removeUsersWithContent');

const removeOneByOne = async (visitorIds) => {
	let removedCount = 0;

	for (const visitorId of visitorIds) {
		try {
			removedCount += await removeUsersWithContent([visitorId], { deleteUploadedImages: true });
		} catch (error) {
			console.error(`Could not remove demo visitor ${visitorId}`, error);
		}
	}

	return removedCount;
};

const removeExpiredVisitors = async (now = new Date()) => {
	const createdBefore = objectIdFromDate(new Date(now.getTime() - config.VISITOR_LIFETIME_MS));
	const expiredVisitorIds = (
		await UserModel.find({ accountType: 'demo', _id: { $lt: createdBefore } })
			.select({ _id: 1 })
			.lean()
	).map((visitor) => visitor._id);

	if (!expiredVisitorIds.length) {
		return 0;
	}

	try {
		return await removeUsersWithContent(expiredVisitorIds, { deleteUploadedImages: true });
	} catch (error) {
		console.error('Could not remove the expired demo visitors in one go; retrying one by one', error);

		return removeOneByOne(expiredVisitorIds);
	}
};

module.exports = {
	removeExpiredVisitors,
};
