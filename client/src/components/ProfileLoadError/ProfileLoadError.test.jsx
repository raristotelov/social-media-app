import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ProfileLoadError from './ProfileLoadError';

describe('ProfileLoadError', () => {
	it('shows the heading "Couldn\'t load this profile"', () => {
		render(<ProfileLoadError onRetryClick={jest.fn()} />);

		expect(screen.getByRole('heading', { name: "Couldn't load this profile" })).toBeInTheDocument();
	});

	it('shows the "Check your connection and try again." line', () => {
		render(<ProfileLoadError onRetryClick={jest.fn()} />);

		expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
	});

	it('calls onRetryClick when Retry is clicked', () => {
		const onRetryClick = jest.fn();

		render(<ProfileLoadError onRetryClick={onRetryClick} />);

		userEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(onRetryClick).toHaveBeenCalledTimes(1);
	});

	it('enables Retry by default', () => {
		render(<ProfileLoadError onRetryClick={jest.fn()} />);

		expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
	});

	it('disables Retry while a retry is in flight and does not call onRetryClick', () => {
		const onRetryClick = jest.fn();

		render(<ProfileLoadError onRetryClick={onRetryClick} isRetrying />);

		userEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
		expect(onRetryClick).not.toHaveBeenCalled();
	});
});
