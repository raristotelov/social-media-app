const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
	secure: true,
});

const CREDENTIAL_SETTINGS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

const REQUIRED_SETTINGS = [...CREDENTIAL_SETTINGS, 'CLOUDINARY_FOLDER'];

const isConfigured = () => CREDENTIAL_SETTINGS.every((name) => Boolean(process.env[name]));

const getMissingSettings = () => REQUIRED_SETTINGS.filter((name) => !process.env[name]);

const getUploadFolder = () => process.env.CLOUDINARY_FOLDER;

module.exports = {
	cloudinary,
	isConfigured,
	getMissingSettings,
	getUploadFolder,
};
