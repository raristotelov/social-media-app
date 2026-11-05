const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const CommentModel = require('../models/commentModel');
const DemoAccountStateModel = require('../models/demoAccountStateModel');
const DemoActivityRunModel = require('../models/demoActivityRunModel');
const DemoScheduledEventModel = require('../models/demoScheduledEventModel');
const NotificationModel = require('../models/notificationModel');
const StoryModel = require('../models/storyModel');
const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { buildDemoData } = require('../seed/buildDemoData');
const config = require('./demoConfig');

const DATA_DIRECTORY = path.join(__dirname, '..', 'seed', 'data');
const NON_BANK_FILES = [
	'users.json',
	'creatorSwaps.json',
	'assignments.json',
	'avatarChoices.json',
	'avatarExclusions.json',
	'photos.json',
	'replies.json',
	'genericComments.json',
];

const readJson = (fileName) => JSON.parse(fs.readFileSync(path.join(DATA_DIRECTORY, fileName), 'utf8'));

const collectSources = (value) => {
	if (typeof value === 'string') {
		return [value];
	}

	if (Array.isArray(value)) {
		return value.flatMap(collectSources);
	}

	if (value && typeof value === 'object') {
		return Object.entries(value)
			.filter(([key]) => key !== 'username' && key !== 'avatarSource')
			.flatMap(([, child]) => collectSources(child));
	}

	return [];
};

const buildFakePhotosManifest = (assignments) => {
	const manifest = { pool: {} };

	for (const source of new Set(collectSources(assignments))) {
		const [pool, group] = source.split('/');
		const groupKey = `${pool}/${group}`;

		manifest.pool[groupKey] = manifest.pool[groupKey] || [];
		manifest.pool[groupKey].push({
			source,
			imageIdentifier: `demo-users/${source}`,
			imageUrl: `https://cdn.example.com/demo-users/${source}`,
			imageWidth: 800,
			imageHeight: 600,
		});
	}

	return manifest;
};

const readCaptionBanks = () => {
	const fileNames = fs.readdirSync(DATA_DIRECTORY).filter((fileName) => fileName.endsWith('.json') && !NON_BANK_FILES.includes(fileName));

	return new Map(fileNames.map((fileName) => [path.parse(fileName).name, readJson(fileName)]));
};

const loadFixture = () => {
	const assignments = readJson('assignments.json');

	return {
		users: readJson('users.json'),
		assignments,
		photosManifest: buildFakePhotosManifest(assignments),
		captionBanks: readCaptionBanks(),
		replies: readJson('replies.json').replies,
	};
};

const seedCache = new Map();

const getSeedData = (fixture, seedNow) => {
	const key = seedNow.getTime();

	if (!seedCache.has(key)) {
		seedCache.set(key, buildDemoData({ ...fixture, now: seedNow }));
	}

	return seedCache.get(key);
};

const startDatabase = async () => {
	const server = await MongoMemoryServer.create();

	await mongoose.connect(server.getUri());
	await Promise.all([
		UserModel.init(),
		UserPostModel.init(),
		CommentModel.init(),
		StoryModel.init(),
		DemoAccountStateModel.init(),
		DemoScheduledEventModel.init(),
		NotificationModel.init(),
	]);

	return server;
};

const stopDatabase = async (server) => {
	await mongoose.disconnect();
	await server?.stop();
};

const clearDatabase = () =>
	Promise.all([
		UserModel.deleteMany({}),
		UserPostModel.deleteMany({}),
		CommentModel.deleteMany({}),
		StoryModel.deleteMany({}),
		DemoAccountStateModel.deleteMany({}),
		DemoScheduledEventModel.deleteMany({}),
		DemoActivityRunModel.deleteMany({}),
		NotificationModel.deleteMany({}),
	]);

const seedDatabase = async (fixture, seedNow) => {
	const data = getSeedData(fixture, seedNow);

	await clearDatabase();
	await UserModel.insertMany(data.users.map((user) => ({ ...user, password: 'unusable-password' })));
	await UserPostModel.insertMany(data.posts);
	await CommentModel.insertMany(data.comments);
	await DemoAccountStateModel.insertMany(data.accountStates);
	await DemoActivityRunModel.create({
		lastCompletedHour: new Date(Math.floor(seedNow.getTime() / config.HOUR_MS) * config.HOUR_MS - config.HOUR_MS),
	});

	return data;
};

const installStoryUploadMock = (uploadMock) => {
	let uploads = 0;

	uploadMock.mockReset();
	uploadMock.mockImplementation(async () => {
		uploads += 1;

		return {
			public_id: `demo-users/story-copies/copy-${uploads}`,
			secure_url: `https://cdn.example.com/demo-users/story-copies/copy-${uploads}.jpg`,
			width: 800,
			height: 600,
		};
	});
};

const sourceOfPost = (post) => post.imageIdentifier.replace('demo-users/', '');

module.exports = {
	loadFixture,
	startDatabase,
	stopDatabase,
	seedDatabase,
	installStoryUploadMock,
	sourceOfPost,
};
