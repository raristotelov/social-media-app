const fs = require('node:fs/promises');
const path = require('node:path');

const constants = require('../config/constants');
const config = require('./demoConfig');
const { loadDemoData, loadVisitorData, loadGenericComments } = require('./loadDemoData');

const DATA_DIRECTORY = path.join(__dirname, '..', 'seed', 'data');
const MIN_GENERIC_COMMENTS = 20;

describe('loadVisitorData', () => {
	let data;

	beforeAll(async () => {
		data = await loadVisitorData();
	});

	it('should load the 31 starter photos of the visitor-posts library', () => {
		expect(data.postPhotos).toHaveLength(31);
	});

	it('should load the 20 avatars of the visitor-avatars library', () => {
		expect(data.avatarPhotos).toHaveLength(20);
	});

	it('should load starter photos from the visitor-posts library only', () => {
		data.postPhotos.forEach((photo) => expect(photo.imageIdentifier.startsWith('demo-users/visitor-posts/')).toBe(true));
	});

	it('should load avatars from the visitor-avatars library only', () => {
		data.avatarPhotos.forEach((photo) => expect(photo.imageIdentifier.startsWith('demo-users/visitor-avatars/')).toBe(true));
	});

	it('should give every photo what a copy and a profile picture need', () => {
		[...data.postPhotos, ...data.avatarPhotos].forEach((photo) => {
			expect(photo.imageUrl).toMatch(/^https:\/\//);
			expect(photo.imageIdentifier).toEqual(expect.any(String));
			expect(photo.imageWidth).toBeGreaterThan(0);
			expect(photo.imageHeight).toBeGreaterThan(0);
		});
	});

	it('should not list the same starter photo twice', () => {
		const identifiers = data.postPhotos.map((photo) => photo.imageIdentifier);

		expect(new Set(identifiers).size).toBe(identifiers.length);
	});

	it('should load the generic comment bank', () => {
		expect(data.genericComments.length).toBeGreaterThanOrEqual(MIN_GENERIC_COMMENTS);
	});

	it('should have every avatar protected from deletion, because the pool is shared by all visitors', () => {
		data.avatarPhotos.forEach((photo) => {
			expect(constants.SHARED_IMAGE_PREFIXES.some((prefix) => photo.imageIdentifier.startsWith(prefix))).toBe(true);
		});
	});

	it('should have no starter photo protected from deletion: the visitor only ever owns copies of them', () => {
		data.postPhotos.forEach((photo) => {
			expect(constants.SHARED_IMAGE_PREFIXES.some((prefix) => photo.imageIdentifier.startsWith(prefix))).toBe(false);
		});
	});

	it('should keep the folder for the copies apart from the shared library', () => {
		expect(config.VISITOR_POST_COPY_FOLDER).toBe('demo-users/visitor-post-copies');
		expect(config.VISITOR_POST_COPY_FOLDER).not.toContain('visitor-posts');
	});
});

describe('the generic comment bank', () => {
	let comments;

	beforeAll(async () => {
		comments = await loadGenericComments();
	});

	it('should be a list of texts', () => {
		expect(Array.isArray(comments)).toBe(true);
		comments.forEach((comment) => expect(typeof comment).toBe('string'));
	});

	it('should hold enough comments for 5 reactions on one post without repeating', () => {
		expect(comments.length).toBeGreaterThanOrEqual(MIN_GENERIC_COMMENTS);
	});

	it('should have no empty or untrimmed comment', () => {
		comments.forEach((comment) => {
			expect(comment).not.toBe('');
			expect(comment).toBe(comment.trim());
		});
	});

	it('should have no duplicate comment', () => {
		expect(new Set(comments).size).toBe(comments.length);
	});

	it('should be the same bank the visitors use', async () => {
		const { genericComments } = await loadVisitorData();

		expect(genericComments).toEqual(comments);
	});

	it('should read the file genericComments.json', async () => {
		const file = JSON.parse(await fs.readFile(path.join(DATA_DIRECTORY, 'genericComments.json'), 'utf8'));

		expect(file.comments).toEqual(comments);
	});
});

describe('loadDemoData', () => {
	let data;

	beforeAll(async () => {
		data = await loadDemoData();
	});

	it('should not read genericComments.json as a caption bank', () => {
		expect(data.captionBanks.has('genericComments')).toBe(false);
	});

	it('should still read the real caption banks', () => {
		expect(data.captionBanks.size).toBeGreaterThan(50);
		expect(data.captionBanks.has('beach')).toBe(true);
	});

	it('should carry the generic comments next to the persona data', () => {
		expect(data.genericComments.length).toBeGreaterThanOrEqual(MIN_GENERIC_COMMENTS);
	});
});
