require('dotenv').config();

module.exports = {
	mongodb: {
		url: process.env.MONGODB_URI,
	},
	migrationsDir: 'src/migrations',
	changelogCollectionName: 'changelog',
	migrationFileExtension: '.js',
	moduleSystem: 'commonjs',
};
