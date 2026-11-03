const PERSONA_EMAIL_PATTERN = /@demo\.invalid$/;
const VISITOR_EMAIL_PATTERN = /@visitor\.demo\.invalid$/;

module.exports = {
	async up(db) {
		const users = db.collection('users');

		await users.updateMany({ email: { $regex: PERSONA_EMAIL_PATTERN } }, { $set: { accountType: 'persona' } });
		await users.updateMany({ email: { $regex: VISITOR_EMAIL_PATTERN } }, { $set: { accountType: 'demo' } });
		await users.updateMany({ accountType: { $exists: false } }, { $set: { accountType: 'user' } });
	},

	async down(db) {
		await db.collection('users').updateMany({}, { $unset: { accountType: '' } });
	},
};
