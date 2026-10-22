import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PostsBar from './PostsBar';

describe('PostsBar', () => {
	it('shows the "Posts" heading', () => {
		render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

		expect(screen.getByRole('heading', { name: 'Posts' })).toBeInTheDocument();
	});

	it('shows the username of the profile the posts belong to', () => {
		render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

		expect(screen.getByText('janedoe')).toBeInTheDocument();
	});

	it('calls onBackClick when the back chevron is clicked', () => {
		const onBackClick = jest.fn();

		render(<PostsBar username='janedoe' onBackClick={onBackClick} />);

		userEvent.click(screen.getByRole('button', { name: 'Back' }));

		expect(onBackClick).toHaveBeenCalledTimes(1);
	});

	it('is visible by default', () => {
		const { container } = render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

		expect(container.querySelector('.posts-bar')).not.toHaveClass('posts-bar-hidden');
	});

	describe('hiding on scroll', () => {
		let queuedFrames;
		let nextFrameId;
		let requestFrameSpy;
		let cancelFrameSpy;

		const setScrollY = (value) => {
			Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value });
		};

		const scrollToAndSettle = (scrollY) => {
			act(() => {
				setScrollY(scrollY);
				window.dispatchEvent(new Event('scroll'));
			});

			act(() => {
				const frames = [...queuedFrames.values()];

				queuedFrames.clear();
				frames.forEach((frame) => frame());
			});
		};

		beforeEach(() => {
			queuedFrames = new Map();
			nextFrameId = 1;
			setScrollY(0);

			requestFrameSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
				const frameId = nextFrameId;

				nextFrameId += 1;
				queuedFrames.set(frameId, callback);

				return frameId;
			});
			cancelFrameSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
				queuedFrames.delete(frameId);
			});
		});

		afterEach(() => {
			requestFrameSpy.mockRestore();
			cancelFrameSpy.mockRestore();
		});

		it('is marked hidden when the page is scrolled down', () => {
			const { container } = render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

			scrollToAndSettle(300);

			expect(container.querySelector('.posts-bar')).toHaveClass('posts-bar-hidden');
		});

		it('is shown again when the page is scrolled up', () => {
			const { container } = render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

			scrollToAndSettle(400);
			scrollToAndSettle(300);

			expect(container.querySelector('.posts-bar')).not.toHaveClass('posts-bar-hidden');
		});

		it('is shown when the page is back at the top', () => {
			const { container } = render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

			scrollToAndSettle(400);
			scrollToAndSettle(0);

			expect(container.querySelector('.posts-bar')).not.toHaveClass('posts-bar-hidden');
		});

		it('stops listening to scroll once unmounted', () => {
			const { unmount } = render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

			unmount();
			act(() => {
				window.dispatchEvent(new Event('scroll'));
			});

			expect(requestFrameSpy).not.toHaveBeenCalled();
		});
	});
});
