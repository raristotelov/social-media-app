import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';

import useGoBackOrTo from './useGoBackOrTo';

const FALLBACK_PATH = '/fallback';

const BackButton = ({ fallbackPath = FALLBACK_PATH }) => {
	const goBackOrTo = useGoBackOrTo(fallbackPath);

	return (
		<button type='button' onClick={goBackOrTo}>
			Go back
		</button>
	);
};

const LocationProbe = () => {
	const location = useLocation();
	const navigationType = useNavigationType();

	return (
		<div>
			<p data-testid='path'>{location.pathname}</p>

			<p data-testid='navigation-type'>{navigationType}</p>
		</div>
	);
};

const renderBackButton = ({ entries = ['/previous', '/current'], initialIndex = entries.length - 1, fallbackPath } = {}) =>
	render(
		<MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
			<Routes>
				<Route path='/current' element={<BackButton fallbackPath={fallbackPath} />} />

				<Route path='/previous' element={<p>Previous page</p>} />

				<Route path='/fallback' element={<p>Fallback page</p>} />

				<Route path='/other-fallback' element={<p>Other fallback page</p>} />
			</Routes>

			<LocationProbe />
		</MemoryRouter>,
	);

describe('useGoBackOrTo', () => {
	afterEach(() => {
		window.history.replaceState(null, '');
	});

	it('goes back in history when there is an earlier entry', async () => {
		renderBackButton();

		userEvent.click(screen.getByRole('button', { name: 'Go back' }));

		expect(await screen.findByText('Previous page')).toBeInTheDocument();
		expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP');
	});

	it('goes back when there is no stored history state', async () => {
		window.history.replaceState(null, '');
		renderBackButton();

		userEvent.click(screen.getByRole('button', { name: 'Go back' }));

		expect(await screen.findByText('Previous page')).toBeInTheDocument();
	});

	it('goes back when the stored history index is above 0', async () => {
		window.history.replaceState({ idx: 3 }, '');
		renderBackButton();

		userEvent.click(screen.getByRole('button', { name: 'Go back' }));

		expect(await screen.findByText('Previous page')).toBeInTheDocument();
	});

	it('goes to the fallback path when the stored history index is 0', async () => {
		renderBackButton({ entries: ['/current'] });

		window.history.replaceState({ idx: 0 }, '');
		userEvent.click(screen.getByRole('button', { name: 'Go back' }));

		expect(await screen.findByText('Fallback page')).toBeInTheDocument();
	});

	it('replaces the entry instead of adding one when it goes to the fallback path', async () => {
		renderBackButton({ entries: ['/current'] });

		window.history.replaceState({ idx: 0 }, '');
		userEvent.click(screen.getByRole('button', { name: 'Go back' }));

		await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/fallback$/));
		expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
	});

	it('goes to the fallback path it was given', async () => {
		renderBackButton({ entries: ['/current'], fallbackPath: '/other-fallback' });

		window.history.replaceState({ idx: 0 }, '');
		userEvent.click(screen.getByRole('button', { name: 'Go back' }));

		expect(await screen.findByText('Other fallback page')).toBeInTheDocument();
	});

	it('reads the history index when clicked, not when it rendered', async () => {
		window.history.replaceState({ idx: 4 }, '');
		renderBackButton({ entries: ['/current'] });

		window.history.replaceState({ idx: 0 }, '');
		userEvent.click(screen.getByRole('button', { name: 'Go back' }));

		expect(await screen.findByText('Fallback page')).toBeInTheDocument();
	});

	it('does not treat an index of 0 on a different state shape as the first entry', async () => {
		renderBackButton();

		window.history.replaceState({ usr: { idx: 0 } }, '');
		userEvent.click(screen.getByRole('button', { name: 'Go back' }));

		expect(await screen.findByText('Previous page')).toBeInTheDocument();
	});
});
