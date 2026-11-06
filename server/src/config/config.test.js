const loadConfig = ({ nodeEnv, clientOrigin }) => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalClientOrigin = process.env.CLIENT_ORIGIN;

	process.env.NODE_ENV = nodeEnv;

	if (clientOrigin === undefined) {
		delete process.env.CLIENT_ORIGIN;
	} else {
		process.env.CLIENT_ORIGIN = clientOrigin;
	}

	try {
		let config;

		jest.isolateModules(() => {
			config = require('./config');
		});

		return config;
	} finally {
		process.env.NODE_ENV = originalNodeEnv;

		if (originalClientOrigin === undefined) {
			delete process.env.CLIENT_ORIGIN;
		} else {
			process.env.CLIENT_ORIGIN = originalClientOrigin;
		}
	}
};

describe('config client origin', () => {
	it('uses CLIENT_ORIGIN when it is set', () => {
		const config = loadConfig({ nodeEnv: 'production', clientOrigin: 'https://sharesnap.app' });

		expect(config.clientOrigin).toBe('https://sharesnap.app');
	});

	it('falls back to the local client in development', () => {
		const config = loadConfig({ nodeEnv: 'development', clientOrigin: undefined });

		expect(config.clientOrigin).toBe('http://localhost:3000');
	});

	it('refuses to start in production without CLIENT_ORIGIN, so CORS is never open', () => {
		expect(() => loadConfig({ nodeEnv: 'production', clientOrigin: undefined })).toThrow('CLIENT_ORIGIN must be set in production');
	});

	it('flags production only when NODE_ENV is production', () => {
		expect(loadConfig({ nodeEnv: 'production', clientOrigin: 'https://sharesnap.app' }).isProduction).toBe(true);
		expect(loadConfig({ nodeEnv: 'development', clientOrigin: undefined }).isProduction).toBe(false);
	});
});
