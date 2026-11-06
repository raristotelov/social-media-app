require('dotenv').config({ quiet: true });

module.exports = {
	mongodb: {
		url: process.env.MONGODB_URI,
	},
	migrationsDir: 'src/migrations',
	changelogCollectionName: 'changelog',
	migrationFileExtension: '.js',
	moduleSystem: 'commonjs',
};
