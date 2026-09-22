module.exports = [
	{
		files: ['**/*.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'commonjs',
			globals: {
				require: 'readonly',
				module: 'readonly',
				process: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				console: 'readonly',
			},
		},
		rules: {
			semi: ['error', 'always'],
			quotes: ['error', 'single', { avoidEscape: true }],
			'comma-dangle': ['error', 'always-multiline'],
			'max-len': ['error', { code: 150, ignoreStrings: true, ignoreTemplateLiterals: true }],
			// args: 'none' because Express error middleware must declare `next` without using it.
			'no-unused-vars': ['error', { args: 'none' }],
			'arrow-parens': ['error', 'always'],
			'no-multiple-empty-lines': ['error', { max: 1 }],
		},
	},
];
