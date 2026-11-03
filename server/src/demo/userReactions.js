const DemoAccountStateModel = require('../models/demoAccountStateModel');
const UserModel = require('../models/userModel');
const { loadGenericComments } = require('./loadDemoData');
const { planSignUpFollows, planUploadReactions } = require('./reactionPlanning');
const { scheduleReactions, storeScheduledEvents } = require('./reactionDelivery');

const loadPersonas = () => DemoAccountStateModel.find().select({ userId: 1, tier: 1 }).lean();

const reactToSignUp = async (userId, { now = new Date(), random = Math.random } = {}) => {
	try {
		const personas = await loadPersonas();

		scheduleReactions(planSignUpFollows({ userId, now, followerIds: [], personas, random }));
	} catch (error) {
		console.error('Could not plan the reactions to a sign-up', error);
	}
};

const reactToUpload = async (userPost, { now = new Date(), random = Math.random } = {}) => {
	try {
		const owner = await UserModel.findById(userPost.userId).select({ followers: 1, accountType: 1 }).lean();
		const personas = await loadPersonas();

		if (!personas.length || owner?.accountType === 'persona') {
			return;
		}

		const personaIds = personas.map((persona) => persona.userId);
		const personaIdSet = new Set(personaIds.map(String));
		const followerIds = (owner?.followers || []).filter((followerId) => personaIdSet.has(String(followerId)));
		const { immediate, later } = planUploadReactions({
			postId: userPost._id,
			ownerId: userPost.userId,
			now,
			followerIds,
			personaIds,
			genericComments: await loadGenericComments(),
			random,
		});

		scheduleReactions(immediate);
		await storeScheduledEvents(later);
	} catch (error) {
		console.error('Could not plan the reactions to an upload', error);
	}
};

module.exports = {
	reactToSignUp,
	reactToUpload,
};
