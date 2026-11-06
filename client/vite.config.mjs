import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const DEV_SERVER_PORT = 3000;

export default defineConfig({
	plugins: [react()],
	server: {
		port: DEV_SERVER_PORT,
		strictPort: true,
	},
	test: {
		environment: 'jsdom',
		globals: true,
		mockReset: true,
		setupFiles: ['./src/setupTests.js'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{js,jsx}'],
			exclude: ['src/**/*.test.{js,jsx}', 'src/setupTests.js'],
		},
	},
});
