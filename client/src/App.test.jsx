import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { APP_NAME } from './constants/app';

import App from './App';

const mockSeenEndSessions = [];

jest.mock('./components/Header/MainHeader', () => () => <header>Main header</header>);
jest.mock('./components/Header/MobileTopBar', () => () => <header>Mobile top bar</header>);
jest.mock('./components/TabBar/TabBar', () => () => <nav>Tab bar</nav>);
jest.mock('./Router', () => {
	const { useContext } = require('react');
	const { useNavigate } = require('react-router-dom');
	const LoggedInUserContext = require('./contexts/LoggedInUserContext').default;

	return function MockRouter() {
		const { endSession } = useContext(LoggedInUserContext);
		const navigate = useNavigate();

		mockSeenEndSessions.push(endSession);

		return (
			<main>
				<button type='button' onClick={() => navigate('/popular-posts')}>
					Go to popular
				</button>

				<button type='button' onClick={() => navigate('/popular-posts/posts')}>
					Go to posts view
				</button>

				<button type='button' onClick={endSession}>
					End session
				</button>
			</main>
		);
	};
});
jest.mock('./services/userService');

const LocationProbe = () => <p data-testid='path'>{useLocation().pathname}</p>;

describe('App', () => {
	beforeEach(() => {
		mockSeenEndSessions.length = 0;
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

	describe('endSession', () => {
		const renderApp = () =>
			render(
				<MemoryRouter initialEntries={['/']}>
					<App />

					<LocationProbe />
				</MemoryRouter>,
			);

		it('keeps the same identity across route changes', async () => {
			renderApp();

			userEvent.click(await screen.findByRole('button', { name: 'Go to popular' }));
			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts'));

			userEvent.click(screen.getByRole('button', { name: 'Go to posts view' }));
			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts/posts'));

			expect(new Set(mockSeenEndSessions).size).toBe(1);
		});

		it('still sends the user to /log-in after the route has changed', async () => {
			renderApp();

			userEvent.click(await screen.findByRole('button', { name: 'Go to popular' }));
			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/popular-posts'));

			act(() => {
				userEvent.click(screen.getByRole('button', { name: 'End session' }));
			});

			await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/log-in'));
		});
	});
});
