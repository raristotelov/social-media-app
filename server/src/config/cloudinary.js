const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
	secure: true,
});

const REQUIRED_SETTINGS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_FOLDER'];

const isConfigured = () => Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const getMissingSettings = () => REQUIRED_SETTINGS.filter((name) => !process.env[name]);

const getUploadFolder = () => process.env.CLOUDINARY_FOLDER;

module.exports = {
	cloudinary,
	isConfigured,
	getMissingSettings,
	getUploadFolder,
};
