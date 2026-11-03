const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const UserModel = require('../models/userModel');
const { applyEvent } = require('./scheduledEvents');

const applyFollow = async (event) => {
	const { matchedCount } = await UserModel.updateOne({ _id: event.targetUserId }, { $addToSet: { followers: event.userId } });

	if (matchedCount) {
		await UserModel.updateOne({ _id: event.userId }, { $addToSet: { following: event.targetUserId } });
	}
};

const applyReaction = (event) => (event.type === 'follow' ? applyFollow(event) : applyEvent(event));

const runReaction = async (event) => {
	try {
		await applyReaction(event);
	} catch (error) {
		console.error('Could not apply a demo reaction', error);
	}
};

const scheduleReactions = (events) => {
	for (const event of events) {
		const timer = setTimeout(() => runReaction(event), Math.max(event.dueAt.getTime() - Date.now(), 0));

		timer.unref();
	}
};

const storeScheduledEvents = async (events) => {
	if (events.length) {
		await DemoScheduledEventModel.insertMany(events);
	}
};

module.exports = {
	applyFollow,
	runReaction,
	scheduleReactions,
	storeScheduledEvents,
};
