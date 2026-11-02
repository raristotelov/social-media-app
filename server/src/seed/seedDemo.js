require('dotenv').config();

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const connectDb = require('../config/database');
const constants = require('../config/constants');
const { cloudinary, isConfigured } = require('../config/cloudinary');
const CommentModel = require('../models/commentModel');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
const StoryModel = require('../models/storyModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const config = require('../demo/demoConfig');
const { floorToHour } = require('../demo/demoActivity');
const { loadDemoData } = require('../demo/loadDemoData');
const { buildDemoData } = require('./buildDemoData');
const { clearDemoContent } = require('./clearDemoContent');

const hashUnusablePassword = () => bcrypt.hash(crypto.randomBytes(32).toString('hex'), constants.SALT_ROUNDS);

const createStoryCopies = async (storyPlans) => {
	const stories = [];

	for (const plan of storyPlans) {
		const copy = await cloudinary.uploader.upload(plan.photo.imageUrl, { resource_type: 'image', folder: config.STORY_COPY_FOLDER });

		stories.push({
			imageIdentifier: copy.public_id,
			imageUrl: copy.secure_url,
			imageWidth: copy.width,
			imageHeight: copy.height,
			userId: plan.userId,
			createdAt: plan.createdAt,
		});
	}

	return stories;
};

const run = async () => {
	if (!isConfigured()) {
		throw new Error('Cloudinary is not configured; set the CLOUDINARY_* variables in .env');
	}

	const now = new Date();
	const data = buildDemoData({ ...(await loadDemoData()), now });

	await connectDb();

	const removedCount = await clearDemoContent();
	console.log(`Removed ${removedCount} existing demo accounts.`);

	const users = [];

	for (const user of data.users) {
		users.push({ ...user, password: await hashUnusablePassword() });
	}

	await UserModel.insertMany(users);
	await UserPostModel.insertMany(data.posts);
	await CommentModel.insertMany(data.comments);
	await StoryModel.insertMany(await createStoryCopies(data.storyPlans));
	await DemoAccountStateModel.insertMany(data.accountStates);
	await DemoActivityRunModel.create({ lastCompletedHour: new Date(floorToHour(now).getTime() - config.HOUR_MS) });

	console.log(
		`Created ${users.length} accounts, ${data.posts.length} posts, ${data.comments.length} comments and ${data.storyPlans.length} stories.`,
	);
};

run()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => mongoose.disconnect());
