const DemoAccountStateModel = require('../models/demoAccountStateModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const UserModel = require('../models/userModel');
const { removeUsersWithContent } = require('../demo/removeUsersWithContent');

const clearDemoContent = async () => {
	await DemoActivityRunModel.deleteMany({});
	await DemoScheduledEventModel.deleteMany({});
	await DemoAccountStateModel.deleteMany({});

	const demoUserIds = (await UserModel.find({ accountType: 'persona' }).select({ _id: 1 }).lean()).map((user) => user._id);

	return removeUsersWithContent(demoUserIds);
};

module.exports = {
	clearDemoContent,
};
