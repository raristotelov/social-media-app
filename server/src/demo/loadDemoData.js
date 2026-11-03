const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'seed', 'data');
const PHOTOS_FILE = path.join(DATA_DIRECTORY, 'photos.json');
const VISITOR_POSTS_POOL = 'visitor-posts';
const VISITOR_AVATARS_POOL = 'visitor-avatars';
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

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

const readPhotosManifest = async () => {
	try {
		return await readJson(PHOTOS_FILE);
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error('photos.json is missing; run npm run seed:upload first');
		}

		throw error;
	}
};

const readCaptionBanks = async () => {
	const fileNames = (await fs.readdir(DATA_DIRECTORY)).filter((fileName) => fileName.endsWith('.json') && !NON_BANK_FILES.includes(fileName));
	const banks = await Promise.all(
		fileNames.map(async (fileName) => [path.parse(fileName).name, await readJson(path.join(DATA_DIRECTORY, fileName))]),
	);

	return new Map(banks);
};

const readGenericComments = async () => (await readJson(path.join(DATA_DIRECTORY, 'genericComments.json'))).comments;

const loadDemoData = async () => ({
	users: await readJson(path.join(DATA_DIRECTORY, 'users.json')),
	assignments: await readJson(path.join(DATA_DIRECTORY, 'assignments.json')),
	photosManifest: await readPhotosManifest(),
	captionBanks: await readCaptionBanks(),
	replies: (await readJson(path.join(DATA_DIRECTORY, 'replies.json'))).replies,
	genericComments: await readGenericComments(),
});

const loadVisitorData = async () => {
	const photosManifest = await readPhotosManifest();

	return {
		postPhotos: Object.values(photosManifest[VISITOR_POSTS_POOL] || {}).flat(),
		avatarPhotos: Object.values(photosManifest[VISITOR_AVATARS_POOL] || {}).flat(),
		genericComments: await readGenericComments(),
	};
};

module.exports = {
	loadDemoData,
	loadVisitorData,
	loadGenericComments: readGenericComments,
};
