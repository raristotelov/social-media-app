import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';

import PageLoadError from './PageLoadError';

describe('PageLoadError', () => {
	describe('with the feed copy', () => {
		it('shows the heading "Couldn\'t load your feed"', () => {
			render(<PageLoadError onRetryClick={jest.fn()} messages={LOAD_ERROR_MESSAGES.FEED} />);

			expect(screen.getByRole('heading', { name: "Couldn't load your feed" })).toBeInTheDocument();
		});

		it('shows the "Check your connection and try again." line', () => {
			render(<PageLoadError onRetryClick={jest.fn()} messages={LOAD_ERROR_MESSAGES.FEED} />);

			expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
		});

		it('shows a Retry button that calls onRetryClick', () => {
			const onRetryClick = jest.fn();

			render(<PageLoadError onRetryClick={onRetryClick} messages={LOAD_ERROR_MESSAGES.FEED} />);

			userEvent.click(screen.getByRole('button', { name: 'Retry' }));

			expect(onRetryClick).toHaveBeenCalledTimes(1);
		});

		it('does not show the profile heading', () => {
			render(<PageLoadError onRetryClick={jest.fn()} messages={LOAD_ERROR_MESSAGES.FEED} />);

			expect(screen.queryByRole('heading', { name: "Couldn't load this profile" })).not.toBeInTheDocument();
		});
	});

	it('shows the heading "Couldn\'t load this profile"', () => {
		render(<PageLoadError onRetryClick={jest.fn()} />);

		expect(screen.getByRole('heading', { name: "Couldn't load this profile" })).toBeInTheDocument();
	});

	it('shows the "Check your connection and try again." line', () => {
		render(<PageLoadError onRetryClick={jest.fn()} />);

		expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
	});

	it('calls onRetryClick when Retry is clicked', () => {
		const onRetryClick = jest.fn();

		render(<PageLoadError onRetryClick={onRetryClick} />);

		userEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(onRetryClick).toHaveBeenCalledTimes(1);
	});

	it('enables Retry by default', () => {
		render(<PageLoadError onRetryClick={jest.fn()} />);

		expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
	});

	it('disables Retry while a retry is in flight and does not call onRetryClick', () => {
		const onRetryClick = jest.fn();

		render(<PageLoadError onRetryClick={onRetryClick} isRetrying />);

		userEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
		expect(onRetryClick).not.toHaveBeenCalled();
	});
});
