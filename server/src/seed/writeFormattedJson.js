const fs = require('node:fs/promises');
const prettier = require('prettier');

const writeFormattedJson = async (file, data) => {
	const options = await prettier.resolveConfig(file);
	const formatted = await prettier.format(JSON.stringify(data), { ...options, filepath: file });

	await fs.writeFile(file, formatted);
};

module.exports = {
	writeFormattedJson,
};
