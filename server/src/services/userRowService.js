const UserModel = require('../models/userModel');

const USER_ROW_PROJECTION = {
	_id: 1,
	username: 1,
	'profilePicture.imageUrl': 1,
};

const getUserRowsInOrder = async (userIds) => {
	const rows = await UserModel.aggregate([{ $match: { _id: { $in: userIds } } }, { $project: USER_ROW_PROJECTION }]);

	const rowsById = new Map(rows.map((row) => [String(row._id), row]));

	return userIds.map((userId) => rowsById.get(String(userId))).filter(Boolean);
};

module.exports = {
	USER_ROW_PROJECTION,
	getUserRowsInOrder,
};
