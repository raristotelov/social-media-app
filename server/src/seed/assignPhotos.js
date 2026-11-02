const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const users = require('./data/users.json');
const creatorSwaps = require('./data/creatorSwaps.json');
const avatarExclusions = require('./data/avatarExclusions.json');
const avatarChoices = require('./data/avatarChoices.json');
const { createRandom, shuffle } = require('../demo/random');
const { writeFormattedJson } = require('./writeFormattedJson');

const ASSIGNMENTS_FILE = path.join(__dirname, 'data', 'assignments.json');
const RANDOM_SEED = 16;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const excludedAvatarSources = new Set(avatarExclusions.excludedAvatarSources);

const SWAPS_PER_CREATOR = 8;
const MAX_ANIMAL_SWAPS = 2;
const CASUAL_POSTER_PHOTOS = 8;
const MAX_REPEATED_SUBJECTS = 2;
const LURKER_BACKLOG_SIZES = [1, 2, 3, 4, 5];
const OCCASIONAL_LURKERS = 117;
const OCCASIONAL_LURKER_PHOTOS = 3;
const LURKERS_WITH_AVATAR = 175;
const AVATAR_SIZE = 512;
const AVATAR_QUALITY = 85;

const AVATAR_SUBJECTS = [
	'autumn-leaves',
	'bird',
	'cake',
	'candle',
	'cat',
	'cheese',
	'chocolate-cake',
	'clock',
	'coffee',
	'cows',
	'cupcakes',
	'dessert',
	'dog',
	'ducks',
	'flowers',
	'fruit',
	'guitar',
	'ice-cream',
	'kite',
	'lamp',
	'moon',
	'mug',
	'pancakes',
	'potted-plant',
	'pumpkins',
	'roses',
	'sheep',
	'spring-blossom',
	'strawberries',
	'sunflowers',
	'tea',
	'tulips',
	'typewriter',
	'vintage-camera',
	'waffles',
];

const isImage = (fileName) => IMAGE_EXTENSIONS.includes(path.extname(fileName).toLowerCase());

const loadPool = async (sourceRoot, poolName, random) => {
	const pool = new Map();
	const entries = await fs.readdir(path.join(sourceRoot, poolName), { withFileTypes: true });

	for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
		const fileNames = (await fs.readdir(path.join(sourceRoot, poolName, entry.name))).filter(isImage).sort();

		pool.set(
			entry.name,
			shuffle(
				fileNames.map((fileName) => `${poolName}/${entry.name}/${fileName}`),
				random,
			),
		);
	}

	return pool;
};

const takeFromLargest = (remaining, folders, count) => {
	const picks = [];

	for (let index = 0; index < count; index += 1) {
		const folder = folders.reduce((largest, candidate) =>
			remaining.get(candidate).length > remaining.get(largest).length ? candidate : largest,
		);

		if (!remaining.get(folder).length) {
			throw new Error(`Ran out of photos in ${folders.join(', ')}`);
		}

		picks.push(remaining.get(folder).pop());
	}

	return picks;
};

const assignCreatorPhotos = (creatorPool, random) => {
	const received = new Map();

	for (const receiver of shuffle(Object.keys(creatorSwaps.related), random)) {
		const { folders, animals = [] } = creatorSwaps.related[receiver];
		const animalCount = animals.length ? 1 + Math.floor(random() * MAX_ANIMAL_SWAPS) : 0;

		received.set(receiver, [
			...takeFromLargest(creatorPool, animals, animalCount),
			...takeFromLargest(creatorPool, folders, SWAPS_PER_CREATOR - animalCount),
		]);
	}

	return users.creators.map(({ folder, username }) => ({
		username,
		avatar: `creator-avatars/${folder}.jpg`,
		photos: shuffle([...creatorPool.get(folder), ...(received.get(folder) || [])], random),
	}));
};

const pickWeightedSubject = (pool, random, subjects, excluded) => {
	const candidates = subjects.filter((subject) => pool.get(subject).length && !excluded.has(subject));
	const total = candidates.reduce((sum, subject) => sum + pool.get(subject).length, 0);

	if (!total) {
		throw new Error('Ran out of everyday photos');
	}

	let target = random() * total;

	for (const subject of candidates) {
		target -= pool.get(subject).length;

		if (target < 0) {
			return subject;
		}
	}

	return candidates[candidates.length - 1];
};

const takeDistinctSubjects = (pool, random, count, usedSubjects) => {
	const photos = [];

	for (let index = 0; index < count; index += 1) {
		const subject = pickWeightedSubject(pool, random, [...pool.keys()], usedSubjects);

		usedSubjects.add(subject);
		photos.push(pool.get(subject).pop());
	}

	return photos;
};

const takeAvatarSource = (pool, random) => {
	const usableSubjects = AVATAR_SUBJECTS.filter((candidate) => pool.get(candidate).some((photo) => !excludedAvatarSources.has(photo)));
	const subject = pickWeightedSubject(pool, random, usableSubjects, new Set());
	const photos = pool.get(subject);
	const index = photos.findLastIndex((photo) => !excludedAvatarSources.has(photo));

	if (index === -1) {
		throw new Error(`Every remaining ${subject} photo is excluded as an avatar`);
	}

	return photos.splice(index, 1)[0];
};

const planLurkers = (random) => {
	const lurkersPerSize = users.lurkers.length / LURKER_BACKLOG_SIZES.length;

	if (!Number.isInteger(lurkersPerSize)) {
		throw new Error(`${users.lurkers.length} lurkers cannot be split evenly across backlog sizes ${LURKER_BACKLOG_SIZES.join(', ')}`);
	}

	const order = shuffle(
		users.lurkers.map((lurker, index) => index),
		random,
	);
	const isPinned = (index) => Object.hasOwn(avatarChoices, users.lurkers[index].username);
	const pinnedLurkers = order.filter(isPinned);

	if (pinnedLurkers.length > LURKERS_WITH_AVATAR) {
		throw new Error(`${pinnedLurkers.length} lurkers have a pinned avatar, but only ${LURKERS_WITH_AVATAR} get one`);
	}

	return {
		backlogSizes: shuffle(
			LURKER_BACKLOG_SIZES.flatMap((size) => Array(lurkersPerSize).fill(size)),
			random,
		),
		occasional: new Set(order.slice(0, OCCASIONAL_LURKERS)),
		withAvatar: new Set(
			[
				...pinnedLurkers,
				...shuffle(
					order.filter((index) => !isPinned(index)),
					random,
				),
			].slice(0, LURKERS_WITH_AVATAR),
		),
	};
};

const assignAvatarSources = (everydayPool, random, lurkerPlan) => {
	const avatarHolders = [
		...users.casualPosters.map(({ username }) => username),
		...users.lurkers.filter((lurker, index) => lurkerPlan.withAvatar.has(index)).map(({ username }) => username),
	];

	const holderSet = new Set(avatarHolders);

	for (const [username, source] of Object.entries(avatarChoices)) {
		const subjectPhotos = everydayPool.get(source.split('/')[1]) || [];
		const index = subjectPhotos.indexOf(source);

		if (!holderSet.has(username) || index === -1) {
			throw new Error(`Pinned avatar ${source} for ${username} is not available`);
		}

		subjectPhotos.splice(index, 1);
	}

	return new Map(avatarHolders.map((username) => [username, avatarChoices[username] || takeAvatarSource(everydayPool, random)]));
};

const assignCasualPosterPhotos = (everydayPool, random, avatarSources) =>
	users.casualPosters.map(({ username }) => {
		const avatarSource = avatarSources.get(username);
		const repeatedCount = 1 + Math.floor(random() * MAX_REPEATED_SUBJECTS);
		const usedSubjects = new Set();
		const photos = takeDistinctSubjects(everydayPool, random, CASUAL_POSTER_PHOTOS - repeatedCount, usedSubjects);

		for (let index = 0; index < repeatedCount; index += 1) {
			photos.push(everydayPool.get(pickWeightedSubject(everydayPool, random, [...usedSubjects], new Set())).pop());
		}

		return { username, avatar: `regular-user-avatars/${username}.jpg`, avatarSource, photos: shuffle(photos, random) };
	});

const assignLurkerPhotos = (everydayPool, random, lurkerPlan, avatarSources) =>
	users.lurkers.map(({ username }, index) => {
		const assignment = { username };

		if (avatarSources.has(username)) {
			assignment.avatar = `regular-user-avatars/${username}.jpg`;
			assignment.avatarSource = avatarSources.get(username);
		}

		const usedSubjects = new Set();
		assignment.backlog = takeDistinctSubjects(everydayPool, random, lurkerPlan.backlogSizes[index], usedSubjects);

		if (lurkerPlan.occasional.has(index)) {
			assignment.laterPhotos = takeDistinctSubjects(everydayPool, random, OCCASIONAL_LURKER_PHOTOS, usedSubjects);
		}

		return assignment;
	});

const assertNoDuplicates = (assignments) => {
	const seen = new Set();
	const accounts = [...assignments.creators, ...assignments.casualPosters, ...assignments.lurkers];

	for (const account of accounts) {
		for (const photo of [account.avatarSource, ...(account.photos || []), ...(account.backlog || []), ...(account.laterPhotos || [])]) {
			if (!photo) {
				continue;
			}

			if (seen.has(photo)) {
				throw new Error(`${photo} is assigned twice`);
			}

			seen.add(photo);
		}
	}

	return seen.size;
};

const assertFilesExist = async (sourceRoot, assignments) => {
	for (const { avatar } of assignments.creators) {
		await fs.access(path.join(sourceRoot, avatar));
	}
};

const assertNoStaleAvatars = async (sourceRoot, accounts) => {
	const expected = new Set(accounts.filter((account) => account.avatar).map((account) => path.basename(account.avatar)));
	let existing = [];

	try {
		existing = await fs.readdir(path.join(sourceRoot, 'regular-user-avatars'));
	} catch (error) {
		if (error.code !== 'ENOENT') {
			throw error;
		}
	}

	const stale = existing.filter((fileName) => isImage(fileName) && !expected.has(fileName));

	if (stale.length) {
		throw new Error(`regular-user-avatars holds ${stale.length} crops that are not in this assignment; move the folder out and run again`);
	}
};

const cropAvatars = async (sourceRoot, accounts) => {
	await fs.mkdir(path.join(sourceRoot, 'regular-user-avatars'), { recursive: true });

	for (const { avatar, avatarSource } of accounts.filter((account) => account.avatarSource)) {
		await sharp(path.join(sourceRoot, avatarSource))
			.rotate()
			.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'attention' })
			.jpeg({ quality: AVATAR_QUALITY })
			.toFile(path.join(sourceRoot, avatar));
	}
};

const run = async () => {
	const sourceRoot = process.argv[2];

	if (!sourceRoot) {
		throw new Error('Usage: npm run seed:assign -- <folder that holds creator-posts, regular-user-posts and creator-avatars>');
	}

	const random = createRandom(RANDOM_SEED);
	const creatorPool = await loadPool(sourceRoot, 'creator-posts', random);
	const everydayPool = await loadPool(sourceRoot, 'regular-user-posts', random);

	const lurkerPlan = planLurkers(random);
	const avatarSources = assignAvatarSources(everydayPool, random, lurkerPlan);

	const assignments = {
		creators: assignCreatorPhotos(creatorPool, random),
		casualPosters: assignCasualPosterPhotos(everydayPool, random, avatarSources),
		lurkers: assignLurkerPhotos(everydayPool, random, lurkerPlan, avatarSources),
	};

	const assignedCount = assertNoDuplicates(assignments);
	await assertFilesExist(sourceRoot, assignments);
	await assertNoStaleAvatars(sourceRoot, [...assignments.casualPosters, ...assignments.lurkers]);
	await cropAvatars(sourceRoot, [...assignments.casualPosters, ...assignments.lurkers]);
	await writeFormattedJson(ASSIGNMENTS_FILE, assignments);

	const unusedCount = [...everydayPool.values()].reduce((sum, photos) => sum + photos.length, 0);
	console.log(`Assigned ${assignedCount} photos; ${unusedCount} everyday photos left unused.`);
};

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
