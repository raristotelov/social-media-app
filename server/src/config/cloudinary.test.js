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
