import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PopularPostsFooter from './PopularPostsFooter';

const renderFooter = (props = {}) => {
	const onRetryClick = jest.fn();

	const rendered = render(<PopularPostsFooter isLoadingMore={false} hasLoadMoreFailed={false} onRetryClick={onRetryClick} {...props} />);

	return { ...rendered, onRetryClick };
};

describe('PopularPostsFooter', () => {
	describe('when nothing is happening', () => {
		it('renders nothing', () => {
			const { container } = renderFooter();

			expect(container).toBeEmptyDOMElement();
		});
	});

	describe('while the next batch loads', () => {
		it('shows the loading spinner', () => {
			const { container } = renderFooter({ isLoadingMore: true });

			expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
		});

		it('shows the spinner inline, not as a full-page overlay', () => {
			const { container } = renderFooter({ isLoadingMore: true });

			expect(container.querySelector('.spinner-container')).not.toHaveClass('spinner-container-full-page');
		});

		it('shows no error', () => {
			renderFooter({ isLoadingMore: true });

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});
	});

	describe('when the next batch failed', () => {
		it('shows "Couldn\'t load more posts"', () => {
			renderFooter({ hasLoadMoreFailed: true });

			expect(screen.getByText("Couldn't load more posts")).toBeInTheDocument();
		});

		it('announces the error as an alert', () => {
			renderFooter({ hasLoadMoreFailed: true });

			expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load more posts");
		});

		it('shows a "Try again" button, separated from the message by a dot', () => {
			renderFooter({ hasLoadMoreFailed: true });

			expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load more posts·Try again");
			expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
		});

		it('hides the separator dot from assistive technology', () => {
			renderFooter({ hasLoadMoreFailed: true });

			expect(screen.getByText('·')).toHaveAttribute('aria-hidden', 'true');
		});

		it('calls onRetryClick once when Try again is clicked', () => {
			const { onRetryClick } = renderFooter({ hasLoadMoreFailed: true });

			userEvent.click(screen.getByRole('button', { name: 'Try again' }));

			expect(onRetryClick).toHaveBeenCalledTimes(1);
		});

		it('is not a submit button, so it never submits a surrounding form', () => {
			renderFooter({ hasLoadMoreFailed: true });

			expect(screen.getByRole('button', { name: 'Try again' })).toHaveAttribute('type', 'button');
		});

		it('shows the error instead of the spinner when both flags are set', () => {
			const { container } = renderFooter({ hasLoadMoreFailed: true, isLoadingMore: true });

			expect(screen.getByRole('alert')).toBeInTheDocument();
			expect(container.querySelector('.loading-spinner')).not.toBeInTheDocument();
		});
	});
});
