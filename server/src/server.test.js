const SETTINGS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_FOLDER'];
const EXIT_SENTINEL = 'process.exit called';

describe('server start-up Cloudinary check', () => {
	let originalEnv;
	let exitSpy;
	let errorSpy;
	let logSpy;
	let connectDb;
	let app;
	let startExpiredStoriesJob;
	let triggerDemoActivity;

	const startServer = () => {
		jest.isolateModules(() => {
			jest.doMock('dotenv', () => ({ config: jest.fn() }));
			jest.doMock('./config/config', () => ({ port: 5000 }));
			jest.doMock('./config/database', () => connectDb);
			jest.doMock('./app', () => app);
			jest.doMock('./jobs/expiredStoriesJob', () => ({ startExpiredStoriesJob }));
			jest.doMock('./jobs/demoActivityJob', () => ({ triggerDemoActivity }));

			try {
				require('./server');
			} catch (error) {
				if (error.message !== EXIT_SENTINEL) {
					throw error;
				}
			}
		});
	};

	beforeEach(() => {
		originalEnv = process.env;
		process.env = { ...originalEnv };
		SETTINGS.forEach((name) => {
			process.env[name] = `test-${name.toLowerCase()}`;
		});

		connectDb = jest.fn().mockResolvedValue();
		app = { listen: jest.fn() };
		startExpiredStoriesJob = jest.fn();
		triggerDemoActivity = jest.fn();

		exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error(EXIT_SENTINEL);
		});
		errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		process.env = originalEnv;
		jest.restoreAllMocks();
		jest.resetModules();
	});

	it('exits with code 1 and names the missing setting when one is missing', () => {
		delete process.env.CLOUDINARY_FOLDER;

		startServer();

		expect(errorSpy).toHaveBeenCalledWith('Server not started: missing Cloudinary settings CLOUDINARY_FOLDER');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('names every missing setting when several are missing', () => {
		delete process.env.CLOUDINARY_CLOUD_NAME;
		delete process.env.CLOUDINARY_API_SECRET;

		startServer();

		expect(errorSpy).toHaveBeenCalledWith('Server not started: missing Cloudinary settings CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_SECRET');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('treats an empty setting as missing', () => {
		process.env.CLOUDINARY_API_KEY = '';

		startServer();

		expect(errorSpy).toHaveBeenCalledWith('Server not started: missing Cloudinary settings CLOUDINARY_API_KEY');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('does not connect to the database, start jobs or listen when a setting is missing', () => {
		delete process.env.CLOUDINARY_API_KEY;

		startServer();

		expect(connectDb).not.toHaveBeenCalled();
		expect(startExpiredStoriesJob).not.toHaveBeenCalled();
		expect(triggerDemoActivity).not.toHaveBeenCalled();
		expect(app.listen).not.toHaveBeenCalled();
	});

	it('starts as before when all settings are set', async () => {
		startServer();
		await Promise.resolve();

		expect(exitSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
		expect(connectDb).toHaveBeenCalledTimes(1);
		expect(app.listen).toHaveBeenCalledWith(5000, undefined);
		expect(logSpy).toHaveBeenCalledWith('Server is running on port 5000');
		expect(startExpiredStoriesJob).toHaveBeenCalledTimes(1);
		expect(triggerDemoActivity).toHaveBeenCalledTimes(1);
	});
});
