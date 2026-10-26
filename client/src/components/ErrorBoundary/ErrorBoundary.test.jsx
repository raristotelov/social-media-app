import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import ErrorBoundary from './ErrorBoundary';

const ThrowingChild = () => {
	throw new Error('render failure');
};

describe('ErrorBoundary', () => {
	let consoleErrorSpy;

	beforeEach(() => {
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	it('renders its children when nothing throws', () => {
		render(
			<ErrorBoundary>
				<p>App content</p>
			</ErrorBoundary>,
		);

		expect(screen.getByText('App content')).toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
	});

	it('renders the "Something went wrong" page when a child throws while rendering', () => {
		render(
			<ErrorBoundary>
				<ThrowingChild />
			</ErrorBoundary>,
		);

		expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument();
	});

	it('replaces the sibling content of the failed child with the error page', () => {
		render(
			<ErrorBoundary>
				<p>App content</p>

				<ThrowingChild />
			</ErrorBoundary>,
		);

		expect(screen.queryByText('App content')).not.toBeInTheDocument();
	});
});
