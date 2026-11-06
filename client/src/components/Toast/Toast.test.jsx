import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TOAST_DURATION_MS } from '../../constants/toast';

import Toast from './Toast';

vi.mock('../icons/Alert', () => ({ default: () => <svg data-testid='alert-icon' /> }));
vi.mock('../icons/Check', () => ({ default: () => <svg data-testid='check-icon' /> }));

const MESSAGE = "Couldn't delete the post. Try again.";

const advance = (ms) => {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
};

const setupUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe('Toast', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('is dismissed after 5 seconds', () => {
		expect(TOAST_DURATION_MS).toBe(5000);
	});

	it('renders the message', () => {
		render(<Toast message={MESSAGE} onDismiss={vi.fn()} />);

		expect(screen.getByText(MESSAGE)).toBeInTheDocument();
	});

	describe('type', () => {
		it('defaults to the error look: alert icon, no success class', () => {
			const { container } = render(<Toast message={MESSAGE} onDismiss={vi.fn()} />);

			expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
			expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
			expect(container.querySelector('.toast-icon')).not.toHaveClass('toast-icon-success');
		});

		it('keeps the error look for the error type', () => {
			render(<Toast message={MESSAGE} type='error' onDismiss={vi.fn()} />);

			expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
		});

		it('renders the check icon with the success class for the success type', () => {
			const { container } = render(<Toast message='Password changed' type='success' onDismiss={vi.fn()} />);

			expect(screen.getByTestId('check-icon')).toBeInTheDocument();
			expect(screen.queryByTestId('alert-icon')).not.toBeInTheDocument();
			expect(container.querySelector('.toast-icon')).toHaveClass('toast-icon-success');
		});

		it('still shows the message and auto-dismisses after 5 seconds for the success type', () => {
			const onDismiss = vi.fn();

			render(<Toast message='Password changed' type='success' onDismiss={onDismiss} />);

			expect(screen.getByText('Password changed')).toBeInTheDocument();

			advance(5000);

			expect(onDismiss).toHaveBeenCalledTimes(1);
		});
	});

	it('renders a close button', () => {
		render(<Toast message={MESSAGE} onDismiss={vi.fn()} />);

		expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
	});

	it('calls onDismiss once when the close button is clicked', async () => {
		const user = setupUser();
		const onDismiss = vi.fn();

		render(<Toast message={MESSAGE} onDismiss={onDismiss} />);

		await user.click(screen.getByRole('button', { name: 'Close' }));

		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	describe('auto-dismiss', () => {
		it('does not dismiss before 5 seconds have passed', () => {
			const onDismiss = vi.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(4999);

			expect(onDismiss).not.toHaveBeenCalled();
		});

		it('dismisses once after 5 seconds', () => {
			const onDismiss = vi.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(5000);
			advance(10000);

			expect(onDismiss).toHaveBeenCalledTimes(1);
		});

		it('does not dismiss after it is unmounted', () => {
			const onDismiss = vi.fn();
			const { unmount } = render(<Toast message={MESSAGE} onDismiss={onDismiss} />);

			unmount();
			advance(10000);

			expect(onDismiss).not.toHaveBeenCalled();
		});
	});

	describe('pausing', () => {
		it('pauses the timer while hovered', async () => {
			const user = setupUser();
			const onDismiss = vi.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(3000);
			await user.hover(screen.getByText(MESSAGE));
			advance(60000);

			expect(onDismiss).not.toHaveBeenCalled();
		});

		it('resumes with the remaining time when the pointer leaves', async () => {
			const user = setupUser();
			const onDismiss = vi.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(3000);
			await user.hover(screen.getByText(MESSAGE));
			advance(60000);
			await user.unhover(screen.getByText(MESSAGE));
			advance(1999);

			expect(onDismiss).not.toHaveBeenCalled();

			advance(1);

			expect(onDismiss).toHaveBeenCalledTimes(1);
		});

		it('pauses the timer while the close button has focus', () => {
			const onDismiss = vi.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(3000);
			act(() => {
				screen.getByRole('button', { name: 'Close' }).focus();
			});
			advance(60000);

			expect(onDismiss).not.toHaveBeenCalled();
		});

		it('resumes with the remaining time when focus leaves', () => {
			const onDismiss = vi.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(3000);
			act(() => {
				screen.getByRole('button', { name: 'Close' }).focus();
			});
			advance(60000);
			act(() => {
				screen.getByRole('button', { name: 'Close' }).blur();
			});
			advance(1999);

			expect(onDismiss).not.toHaveBeenCalled();

			advance(1);

			expect(onDismiss).toHaveBeenCalledTimes(1);
		});

		it('counts only the time spent running across several pauses', () => {
			const onDismiss = vi.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(2000);
			fireEvent.mouseEnter(screen.getByText(MESSAGE));
			advance(10000);
			fireEvent.mouseLeave(screen.getByText(MESSAGE));
			advance(2000);
			fireEvent.mouseEnter(screen.getByText(MESSAGE));
			advance(10000);
			fireEvent.mouseLeave(screen.getByText(MESSAGE));
			advance(999);

			expect(onDismiss).not.toHaveBeenCalled();

			advance(1);

			expect(onDismiss).toHaveBeenCalledTimes(1);
		});
	});
});
