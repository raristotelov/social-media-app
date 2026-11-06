import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';

import PageLoadError from './PageLoadError';

describe('PageLoadError', () => {
	describe('with the feed copy', () => {
		it('shows the heading "Couldn\'t load your feed"', () => {
			render(<PageLoadError onActionClick={vi.fn()} messages={LOAD_ERROR_MESSAGES.FEED} />);

			expect(screen.getByRole('heading', { name: "Couldn't load your feed" })).toBeInTheDocument();
		});

		it('shows the "Check your connection and try again." line', () => {
			render(<PageLoadError onActionClick={vi.fn()} messages={LOAD_ERROR_MESSAGES.FEED} />);

			expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
		});

		it('shows a Retry button that calls onActionClick', async () => {
			const user = userEvent.setup();
			const onActionClick = vi.fn();

			render(<PageLoadError onActionClick={onActionClick} messages={LOAD_ERROR_MESSAGES.FEED} />);

			await user.click(screen.getByRole('button', { name: 'Retry' }));

			expect(onActionClick).toHaveBeenCalledTimes(1);
		});

		it('does not show the profile heading', () => {
			render(<PageLoadError onActionClick={vi.fn()} messages={LOAD_ERROR_MESSAGES.FEED} />);

			expect(screen.queryByRole('heading', { name: "Couldn't load this profile" })).not.toBeInTheDocument();
		});
	});

	it('shows the heading "Couldn\'t load this profile"', () => {
		render(<PageLoadError onActionClick={vi.fn()} />);

		expect(screen.getByRole('heading', { name: "Couldn't load this profile" })).toBeInTheDocument();
	});

	it('shows the "Check your connection and try again." line', () => {
		render(<PageLoadError onActionClick={vi.fn()} />);

		expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
	});

	it('calls onActionClick when Retry is clicked', async () => {
		const user = userEvent.setup();
		const onActionClick = vi.fn();

		render(<PageLoadError onActionClick={onActionClick} />);

		await user.click(screen.getByRole('button', { name: 'Retry' }));

		expect(onActionClick).toHaveBeenCalledTimes(1);
	});

	it('enables Retry by default', () => {
		render(<PageLoadError onActionClick={vi.fn()} />);

		expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
	});

	it('disables Retry while a retry is in flight and does not call onActionClick', async () => {
		const user = userEvent.setup();
		const onActionClick = vi.fn();

		render(<PageLoadError onActionClick={onActionClick} isRetrying />);

		await user.click(screen.getByRole('button', { name: 'Retry' }));

		expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
		expect(onActionClick).not.toHaveBeenCalled();
	});
});
