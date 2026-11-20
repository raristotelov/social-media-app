const SETTINGS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_FOLDER'];

const loadGetMissingSettings = () => {
	let getMissingSettings;

	jest.isolateModules(() => {
		({ getMissingSettings } = require('./cloudinary'));
	});

	return getMissingSettings;
};

describe('getMissingSettings', () => {
	let originalEnv;

	beforeEach(() => {
		originalEnv = process.env;
		process.env = { ...originalEnv };
		SETTINGS.forEach((name) => {
			process.env[name] = `test-${name.toLowerCase()}`;
		});
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('returns an empty list when all four settings are set', () => {
		expect(loadGetMissingSettings()()).toEqual([]);
	});

	it.each(SETTINGS)('returns only %s when it is the one missing', (name) => {
		delete process.env[name];

		expect(loadGetMissingSettings()()).toEqual([name]);
	});

	it('returns several missing settings in their declared order', () => {
		delete process.env.CLOUDINARY_FOLDER;
		delete process.env.CLOUDINARY_CLOUD_NAME;

		expect(loadGetMissingSettings()()).toEqual(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_FOLDER']);
	});

	it('returns all four settings when none are set', () => {
		SETTINGS.forEach((name) => {
			delete process.env[name];
		});

		expect(loadGetMissingSettings()()).toEqual(SETTINGS);
	});

	it('treats an empty string as missing', () => {
		process.env.CLOUDINARY_API_KEY = '';

		expect(loadGetMissingSettings()()).toEqual(['CLOUDINARY_API_KEY']);
	});
});

const CREDENTIALS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

const loadIsConfigured = () => {
	let isConfigured;

	jest.isolateModules(() => {
		({ isConfigured } = require('./cloudinary'));
	});

	return isConfigured;
};

describe('isConfigured', () => {
	let originalEnv;

	beforeEach(() => {
		originalEnv = process.env;
		process.env = { ...originalEnv };
		SETTINGS.forEach((name) => {
			process.env[name] = `test-${name.toLowerCase()}`;
		});
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('is true when the cloud name, API key and API secret are all set', () => {
		expect(loadIsConfigured()()).toBe(true);
	});

	it.each(CREDENTIALS)('is false when %s is missing', (name) => {
		delete process.env[name];

		expect(loadIsConfigured()()).toBe(false);
	});

	it.each(CREDENTIALS)('is false when %s is an empty string', (name) => {
		process.env[name] = '';

		expect(loadIsConfigured()()).toBe(false);
	});

	it('is false when none of the credentials are set', () => {
		CREDENTIALS.forEach((name) => {
			delete process.env[name];
		});

		expect(loadIsConfigured()()).toBe(false);
	});

	it('is still true when CLOUDINARY_FOLDER is missing', () => {
		delete process.env.CLOUDINARY_FOLDER;

		expect(loadIsConfigured()()).toBe(true);
	});
});
