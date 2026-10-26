import '@testing-library/jest-dom';
import { act, renderHook } from '@testing-library/react';

import { LOAD_MORE_DISTANCE_PX } from '../constants/layout';

import useLoadMoreOnScroll from './useLoadMoreOnScroll';

const VIEWPORT_HEIGHT = 800;
const PAGE_HEIGHT = 5000;

describe('useLoadMoreOnScroll', () => {
	let queuedFrames;
	let nextFrameId;
	let requestFrameSpy;
	let cancelFrameSpy;
	let originalInnerHeight;

	const setPage = ({ scrollY, scrollHeight = PAGE_HEIGHT }) => {
		Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: scrollY });
		Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: scrollHeight });
	};

	const distanceToBottom = (scrollY) => PAGE_HEIGHT - (scrollY + VIEWPORT_HEIGHT);

	const scrollYWithDistanceToBottom = (distance) => PAGE_HEIGHT - VIEWPORT_HEIGHT - distance;

	const runQueuedFrames = () => {
		act(() => {
			const frames = [...queuedFrames.values()];

			queuedFrames.clear();
			frames.forEach((frame) => frame());
		});
	};

	const scrollTo = (scrollY) => {
		act(() => {
			setPage({ scrollY });
			window.dispatchEvent(new Event('scroll'));
		});

		runQueuedFrames();
	};

	beforeEach(() => {
		queuedFrames = new Map();
		nextFrameId = 1;
		originalInnerHeight = window.innerHeight;

		Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: VIEWPORT_HEIGHT });
		setPage({ scrollY: 0 });

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

		Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: originalInnerHeight });
		Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
		delete document.documentElement.scrollHeight;
	});

	it('loads more when the page is already near its bottom as the hook starts', () => {
		const onLoadMore = jest.fn();

		setPage({ scrollY: scrollYWithDistanceToBottom(100) });
		renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));
		runQueuedFrames();

		expect(onLoadMore).toHaveBeenCalledTimes(1);
	});

	it('loads more when the page is too short to scroll, so the next batch fills the screen', () => {
		const onLoadMore = jest.fn();

		setPage({ scrollY: 0, scrollHeight: VIEWPORT_HEIGHT });
		renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));
		runQueuedFrames();

		expect(onLoadMore).toHaveBeenCalledTimes(1);
	});

	it('does not load more while the bottom is far away', () => {
		const onLoadMore = jest.fn();

		renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));
		runQueuedFrames();

		expect(onLoadMore).not.toHaveBeenCalled();
	});

	it('loads more when scrolling brings the bottom within the distance', () => {
		const onLoadMore = jest.fn();

		renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));
		runQueuedFrames();
		scrollTo(scrollYWithDistanceToBottom(LOAD_MORE_DISTANCE_PX - 1));

		expect(onLoadMore).toHaveBeenCalledTimes(1);
	});

	it('loads more when the bottom is exactly the distance away', () => {
		const onLoadMore = jest.fn();

		renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));
		runQueuedFrames();
		scrollTo(scrollYWithDistanceToBottom(LOAD_MORE_DISTANCE_PX));

		expect(onLoadMore).toHaveBeenCalledTimes(1);
	});

	it('does not load more while the bottom is just beyond the distance', () => {
		const onLoadMore = jest.fn();

		renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));
		runQueuedFrames();
		scrollTo(scrollYWithDistanceToBottom(LOAD_MORE_DISTANCE_PX + 1));

		expect(distanceToBottom(scrollYWithDistanceToBottom(LOAD_MORE_DISTANCE_PX + 1))).toBeGreaterThan(LOAD_MORE_DISTANCE_PX);
		expect(onLoadMore).not.toHaveBeenCalled();
	});

	it('checks once per frame however many scroll events arrive', () => {
		const onLoadMore = jest.fn();

		renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));
		runQueuedFrames();

		act(() => {
			setPage({ scrollY: scrollYWithDistanceToBottom(10) });
			window.dispatchEvent(new Event('scroll'));
			window.dispatchEvent(new Event('scroll'));
			window.dispatchEvent(new Event('scroll'));
		});

		expect(queuedFrames.size).toBe(1);

		runQueuedFrames();

		expect(onLoadMore).toHaveBeenCalledTimes(1);
	});

	it('loads more when the window is resized to leave the bottom within reach', () => {
		const onLoadMore = jest.fn();

		setPage({ scrollY: scrollYWithDistanceToBottom(LOAD_MORE_DISTANCE_PX + 500) });
		renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));
		runQueuedFrames();

		act(() => {
			Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: VIEWPORT_HEIGHT + 600 });
			window.dispatchEvent(new Event('resize'));
		});
		runQueuedFrames();

		expect(onLoadMore).toHaveBeenCalledTimes(1);
	});

	describe('when disabled', () => {
		it('never loads more, even at the bottom of the page', () => {
			const onLoadMore = jest.fn();

			setPage({ scrollY: scrollYWithDistanceToBottom(0) });
			renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: false }));
			runQueuedFrames();
			scrollTo(scrollYWithDistanceToBottom(0));

			expect(onLoadMore).not.toHaveBeenCalled();
		});

		it('schedules no frame at all', () => {
			renderHook(() => useLoadMoreOnScroll({ onLoadMore: jest.fn(), isEnabled: false }));

			expect(requestFrameSpy).not.toHaveBeenCalled();
		});

		it('starts watching once it becomes enabled', () => {
			const onLoadMore = jest.fn();

			setPage({ scrollY: scrollYWithDistanceToBottom(0) });

			const { rerender } = renderHook(({ isEnabled }) => useLoadMoreOnScroll({ onLoadMore, isEnabled }), {
				initialProps: { isEnabled: false },
			});

			runQueuedFrames();
			expect(onLoadMore).not.toHaveBeenCalled();

			rerender({ isEnabled: true });
			runQueuedFrames();

			expect(onLoadMore).toHaveBeenCalledTimes(1);
		});

		it('stops watching once it becomes disabled', () => {
			const onLoadMore = jest.fn();

			const { rerender } = renderHook(({ isEnabled }) => useLoadMoreOnScroll({ onLoadMore, isEnabled }), { initialProps: { isEnabled: true } });

			runQueuedFrames();
			rerender({ isEnabled: false });
			scrollTo(scrollYWithDistanceToBottom(0));

			expect(onLoadMore).not.toHaveBeenCalled();
		});
	});

	describe('on unmount', () => {
		it('stops listening to scroll', () => {
			const onLoadMore = jest.fn();

			const { unmount } = renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));

			runQueuedFrames();
			unmount();
			scrollTo(scrollYWithDistanceToBottom(0));

			expect(onLoadMore).not.toHaveBeenCalled();
		});

		it('stops listening to resize', () => {
			const onLoadMore = jest.fn();

			setPage({ scrollY: scrollYWithDistanceToBottom(0) });

			const { unmount } = renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));

			runQueuedFrames();
			onLoadMore.mockClear();
			unmount();

			act(() => {
				window.dispatchEvent(new Event('resize'));
			});
			runQueuedFrames();

			expect(onLoadMore).not.toHaveBeenCalled();
		});

		it('cancels a check that is waiting for its frame', () => {
			const onLoadMore = jest.fn();

			setPage({ scrollY: scrollYWithDistanceToBottom(0) });

			const { unmount } = renderHook(() => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }));

			unmount();
			runQueuedFrames();

			expect(cancelFrameSpy).toHaveBeenCalledTimes(1);
			expect(onLoadMore).not.toHaveBeenCalled();
		});
	});

	describe('when the callback changes', () => {
		it('checks again with the new callback, which is how the next batch follows the last', () => {
			const firstCallback = jest.fn();
			const secondCallback = jest.fn();

			setPage({ scrollY: scrollYWithDistanceToBottom(0) });

			const { rerender } = renderHook(({ onLoadMore }) => useLoadMoreOnScroll({ onLoadMore, isEnabled: true }), {
				initialProps: { onLoadMore: firstCallback },
			});

			runQueuedFrames();
			rerender({ onLoadMore: secondCallback });
			runQueuedFrames();

			expect(firstCallback).toHaveBeenCalledTimes(1);
			expect(secondCallback).toHaveBeenCalledTimes(1);
		});
	});
});
