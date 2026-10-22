import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import StoryCircle, { STORY_RING_STATES } from './StoryCircle';

const renderCircle = (props = {}) => render(<StoryCircle label='alice' ariaLabel="View alice's story" onClick={jest.fn()} {...props} />);

describe('StoryCircle', () => {
	describe('content', () => {
		it('shows the label under the circle', () => {
			renderCircle({ label: 'alice' });

			expect(screen.getByText('alice')).toBeInTheDocument();
		});

		it('shows the profile picture inside the circle', () => {
			const { container } = renderCircle({ imageUrl: 'https://example.com/alice.jpg' });

			expect(container.querySelector('img.story-circle-avatar')).toHaveAttribute('src', 'https://example.com/alice.jpg');
		});

		it('falls back to the placeholder avatar without a picture', () => {
			const { container } = renderCircle({ imageUrl: undefined });

			expect(container.querySelector('img')).not.toBeInTheDocument();
			expect(container.querySelector('svg.story-circle-avatar')).toBeInTheDocument();
		});

		it('gives the circle button the accessible name it was given', () => {
			renderCircle({ ariaLabel: "View alice's story" });

			expect(screen.getByRole('button', { name: "View alice's story" })).toBeInTheDocument();
		});
	});

	describe('ring', () => {
		it('is the red unwatched ring when the stories are unwatched', () => {
			const { container } = renderCircle({ ringState: STORY_RING_STATES.UNWATCHED });

			expect(container.querySelector('.story-circle-ring')).toHaveClass('story-circle-ring-unwatched');
		});

		it('is the grey ring once the stories are watched', () => {
			const { container } = renderCircle({ ringState: STORY_RING_STATES.WATCHED });

			expect(container.querySelector('.story-circle-ring')).not.toHaveClass('story-circle-ring-unwatched');
		});

		it('is the grey ring when no state is given, as for your own circle', () => {
			const { container } = renderCircle();

			expect(container.querySelector('.story-circle-ring')).not.toHaveClass('story-circle-ring-unwatched');
		});
	});

	describe('clicking', () => {
		it('calls onClick when the circle is clicked', () => {
			const onClick = jest.fn();
			renderCircle({ onClick });

			userEvent.click(screen.getByRole('button', { name: "View alice's story" }));

			expect(onClick).toHaveBeenCalledTimes(1);
		});
	});

	describe('the plus badge', () => {
		it('is not shown by default', () => {
			const { container } = renderCircle();

			expect(container.querySelector('.story-circle-badge')).not.toBeInTheDocument();
		});

		it('is its own button, with its own click, when it has an add handler', () => {
			const onClick = jest.fn();
			const onAddClick = jest.fn();
			renderCircle({ hasAddBadge: true, onClick, onAddClick, ariaLabel: 'View your story' });

			userEvent.click(screen.getByRole('button', { name: 'Add to your story' }));

			expect(onAddClick).toHaveBeenCalledTimes(1);
			expect(onClick).not.toHaveBeenCalled();
		});

		it('does not trigger the add handler when the circle itself is clicked', () => {
			const onAddClick = jest.fn();
			renderCircle({ hasAddBadge: true, onAddClick, ariaLabel: 'View your story' });

			userEvent.click(screen.getByRole('button', { name: 'View your story' }));

			expect(onAddClick).not.toHaveBeenCalled();
		});

		it('is only decoration, hidden from assistive technology, when there is no add handler', () => {
			const { container } = renderCircle({ hasAddBadge: true, ariaLabel: 'Add to your story' });
			const badge = container.querySelector('.story-circle-badge');

			expect(badge).toHaveAttribute('aria-hidden', 'true');
			expect(badge.tagName).toBe('SPAN');
			expect(screen.getAllByRole('button')).toHaveLength(1);
		});

		it('is not shown without hasAddBadge even when an add handler is given', () => {
			const { container } = renderCircle({ onAddClick: jest.fn() });

			expect(container.querySelector('.story-circle-badge')).not.toBeInTheDocument();
		});
	});
});
