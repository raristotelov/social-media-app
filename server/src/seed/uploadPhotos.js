require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const { isConfigured } = require('../config/cloudinary');
const { uploadBuffer } = require('../services/imageStorageService');
const { writeFormattedJson } = require('./writeFormattedJson');

const CLOUDINARY_ROOT = 'demo-users';
const MAX_DIMENSION = 1080;
const JPEG_QUALITY = 85;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MANIFEST_FILE = path.join(__dirname, 'data', 'photos.json');

const POOLS = [
	{ key: 'creator-posts', layout: 'folders' },
	{ key: 'regular-user-posts', layout: 'folders' },
	{ key: 'visitor-posts', layout: 'folders' },
	{ key: 'creator-avatars', layout: 'files' },
	{ key: 'regular-user-avatars', layout: 'files' },
	{ key: 'visitor-avatars', layout: 'files' },
];

const isImage = (fileName) => IMAGE_EXTENSIONS.includes(path.extname(fileName).toLowerCase());

const listImages = async (directory) => {
	const entries = await fs.readdir(directory, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile() && isImage(entry.name))
		.map((entry) => entry.name)
		.sort();
};

const listFolders = async (directory) => {
	const entries = await fs.readdir(directory, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
};

const collectPoolFiles = async (sourceRoot, pool) => {
	const poolRoot = path.join(sourceRoot, pool.key);

	if (pool.layout === 'files') {
		const fileNames = await listImages(poolRoot);

		return fileNames.map((fileName) => {
			const group = path.parse(fileName).name;

			return { group, name: group, file: path.join(poolRoot, fileName) };
		});
	}

	const files = [];

	for (const group of await listFolders(poolRoot)) {
		for (const fileName of await listImages(path.join(poolRoot, group))) {
			files.push({ group, name: path.parse(fileName).name, file: path.join(poolRoot, group, fileName) });
		}
	}

	return files;
};

const readManifest = async () => {
	try {
		return JSON.parse(await fs.readFile(MANIFEST_FILE, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') {
			return {};
		}

		throw error;
	}
};

const writeManifest = (manifest) => writeFormattedJson(MANIFEST_FILE, manifest);

const resizeImage = (file) =>
	sharp(file)
		.rotate()
		.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: JPEG_QUALITY })
		.toBuffer();

const hashFile = async (file) =>
	crypto
		.createHash('sha256')
		.update(await fs.readFile(file))
		.digest('hex');

const uploadPool = async (sourceRoot, pool, manifest, seenHashes) => {
	const poolManifest = manifest[pool.key] || {};
	manifest[pool.key] = poolManifest;

	for (const { group, name, file } of await collectPoolFiles(sourceRoot, pool)) {
		const publicId = pool.layout === 'files' ? `${CLOUDINARY_ROOT}/${pool.key}/${name}` : `${CLOUDINARY_ROOT}/${pool.key}/${group}/${name}`;
		const hash = await hashFile(file);
		const duplicateOf = seenHashes.get(hash);

		if (duplicateOf) {
			console.log(`Skipping ${file}: same file as ${duplicateOf}`);
			continue;
		}

		seenHashes.set(hash, file);

		const photos = poolManifest[group] || [];
		poolManifest[group] = photos;

		if (photos.some((photo) => photo.imageIdentifier === publicId)) {
			continue;
		}

		const result = await uploadBuffer(await resizeImage(file), {
			public_id: publicId,
			asset_folder: path.posix.dirname(publicId),
			overwrite: false,
		});

		photos.push({
			source: path.relative(sourceRoot, file).split(path.sep).join('/'),
			imageIdentifier: result.public_id,
			imageUrl: result.secure_url,
			imageWidth: result.width,
			imageHeight: result.height,
		});
		await writeManifest(manifest);
		console.log(`Uploaded ${publicId}`);
	}
};

const run = async () => {
	const sourceRoot = process.argv[2];

	if (!sourceRoot) {
		throw new Error(`Usage: npm run seed:upload -- <folder that holds ${POOLS.map((pool) => pool.key).join(', ')}>`);
	}

	if (!isConfigured()) {
		throw new Error('Cloudinary is not configured; set the CLOUDINARY_* variables in .env');
	}

	const manifest = await readManifest();
	const seenHashes = new Map();

	for (const pool of POOLS) {
		await uploadPool(sourceRoot, pool, manifest, seenHashes);
	}

	await writeManifest(manifest);
	console.log('Done.');
};

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
