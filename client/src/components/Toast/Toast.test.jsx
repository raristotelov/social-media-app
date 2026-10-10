import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TOAST_DURATION_MS } from '../../constants/toast';

import Toast from './Toast';

const MESSAGE = "Couldn't delete the post. Try again.";

const advance = (ms) => {
	act(() => {
		jest.advanceTimersByTime(ms);
	});
};

describe('Toast', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('is dismissed after 5 seconds', () => {
		expect(TOAST_DURATION_MS).toBe(5000);
	});

	it('renders the message', () => {
		render(<Toast message={MESSAGE} onDismiss={jest.fn()} />);

		expect(screen.getByText(MESSAGE)).toBeInTheDocument();
	});

	it('renders a close button', () => {
		render(<Toast message={MESSAGE} onDismiss={jest.fn()} />);

		expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
	});

	it('calls onDismiss once when the close button is clicked', () => {
		const onDismiss = jest.fn();

		render(<Toast message={MESSAGE} onDismiss={onDismiss} />);

		userEvent.click(screen.getByRole('button', { name: 'Close' }));

		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	describe('auto-dismiss', () => {
		it('does not dismiss before 5 seconds have passed', () => {
			const onDismiss = jest.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(4999);

			expect(onDismiss).not.toHaveBeenCalled();
		});

		it('dismisses once after 5 seconds', () => {
			const onDismiss = jest.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(5000);
			advance(10000);

			expect(onDismiss).toHaveBeenCalledTimes(1);
		});

		it('does not dismiss after it is unmounted', () => {
			const onDismiss = jest.fn();
			const { unmount } = render(<Toast message={MESSAGE} onDismiss={onDismiss} />);

			unmount();
			advance(10000);

			expect(onDismiss).not.toHaveBeenCalled();
		});
	});

	describe('pausing', () => {
		it('pauses the timer while hovered', () => {
			const onDismiss = jest.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(3000);
			userEvent.hover(screen.getByText(MESSAGE));
			advance(60000);

			expect(onDismiss).not.toHaveBeenCalled();
		});

		it('resumes with the remaining time when the pointer leaves', () => {
			const onDismiss = jest.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(3000);
			userEvent.hover(screen.getByText(MESSAGE));
			advance(60000);
			userEvent.unhover(screen.getByText(MESSAGE));
			advance(1999);

			expect(onDismiss).not.toHaveBeenCalled();

			advance(1);

			expect(onDismiss).toHaveBeenCalledTimes(1);
		});

		it('pauses the timer while the close button has focus', () => {
			const onDismiss = jest.fn();

			render(<Toast message={MESSAGE} onDismiss={onDismiss} />);
			advance(3000);
			act(() => {
				screen.getByRole('button', { name: 'Close' }).focus();
			});
			advance(60000);

			expect(onDismiss).not.toHaveBeenCalled();
		});

		it('resumes with the remaining time when focus leaves', () => {
			const onDismiss = jest.fn();

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
			const onDismiss = jest.fn();

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
