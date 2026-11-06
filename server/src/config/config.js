const env = process.env.NODE_ENV || 'development';

const DEVELOPMENT_CLIENT_ORIGIN = 'http://localhost:3000';

const config = {
	development: {
		port: process.env.PORT || 5000,
		dbUrl: process.env.MONGODB_URI,
	},
	production: {
		port: process.env.PORT || 5000,
		dbUrl: process.env.MONGODB_URI,
	},
};

const isProduction = env === 'production';

const clientOrigin = process.env.CLIENT_ORIGIN || (isProduction ? undefined : DEVELOPMENT_CLIENT_ORIGIN);

if (!clientOrigin) {
	throw new Error('CLIENT_ORIGIN must be set in production');
}

module.exports = { ...config[env], isProduction, clientOrigin };
