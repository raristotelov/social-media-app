const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'seed', 'data');
const PHOTOS_FILE = path.join(DATA_DIRECTORY, 'photos.json');
const NON_BANK_FILES = [
	'users.json',
	'creatorSwaps.json',
	'assignments.json',
	'avatarChoices.json',
	'avatarExclusions.json',
	'photos.json',
	'replies.json',
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

const loadDemoData = async () => ({
	users: await readJson(path.join(DATA_DIRECTORY, 'users.json')),
	assignments: await readJson(path.join(DATA_DIRECTORY, 'assignments.json')),
	photosManifest: await readPhotosManifest(),
	captionBanks: await readCaptionBanks(),
	replies: (await readJson(path.join(DATA_DIRECTORY, 'replies.json'))).replies,
});

module.exports = {
	loadDemoData,
};
