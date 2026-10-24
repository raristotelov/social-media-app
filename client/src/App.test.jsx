import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { APP_NAME } from './constants/app';

import App from './App';

jest.mock('./components/Header/MainHeader', () => () => <header>Main header</header>);
jest.mock('./components/Header/MobileTopBar', () => () => <header>Mobile top bar</header>);
jest.mock('./components/TabBar/TabBar', () => () => <nav>Tab bar</nav>);
jest.mock('./Router', () => () => <main>Router</main>);
jest.mock('./services/userService');

describe('App', () => {
	beforeEach(() => {
		window.localStorage.clear();
		document.title = '';
		window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });
	});

	it('sets the tab title from the app name constant', async () => {
		render(
			<MemoryRouter>
				<App />
			</MemoryRouter>,
		);

		await waitFor(() => expect(document.title).toBe(APP_NAME));
	});
});
