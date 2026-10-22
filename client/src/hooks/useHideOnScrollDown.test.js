import { act, renderHook } from '@testing-library/react';

import useHideOnScrollDown from './useHideOnScrollDown';

let queuedFrames;
let nextFrameId;

const setScrollY = (value) => {
	Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value });
};

const scrollTo = (scrollY) => {
	act(() => {
		setScrollY(scrollY);
		window.dispatchEvent(new Event('scroll'));
	});
};

const flushFrames = () => {
	act(() => {
		const frames = [...queuedFrames.values()];

		queuedFrames.clear();
		frames.forEach((frame) => frame());
	});
};

const scrollToAndSettle = (scrollY) => {
	scrollTo(scrollY);
	flushFrames();
};

describe('useHideOnScrollDown', () => {
	let requestFrameSpy;
	let cancelFrameSpy;

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

	it('is visible at first', () => {
		const { result } = renderHook(() => useHideOnScrollDown());

		expect(result.current).toBe(false);
	});

	it('hides when the page is scrolled down', () => {
		const { result } = renderHook(() => useHideOnScrollDown());

		scrollToAndSettle(200);

		expect(result.current).toBe(true);
	});

	it('shows again when the page is scrolled up', () => {
		const { result } = renderHook(() => useHideOnScrollDown());

		scrollToAndSettle(400);
		scrollToAndSettle(300);

		expect(result.current).toBe(false);
	});

	it('stays as it is for a scroll smaller than the minimum distance', () => {
		const { result } = renderHook(() => useHideOnScrollDown());

		scrollToAndSettle(200);
		scrollToAndSettle(195);

		expect(result.current).toBe(true);
	});

	it('does not hide for a small downward scroll from the top', () => {
		const { result } = renderHook(() => useHideOnScrollDown());

		scrollToAndSettle(4);

		expect(result.current).toBe(false);
	});

	it('shows when the page is back at the very top', () => {
		const { result } = renderHook(() => useHideOnScrollDown());

		scrollToAndSettle(400);
		scrollToAndSettle(0);

		expect(result.current).toBe(false);
	});

	it('hides again on the next downward scroll after being shown', () => {
		const { result } = renderHook(() => useHideOnScrollDown());

		scrollToAndSettle(400);
		scrollToAndSettle(300);
		scrollToAndSettle(500);

		expect(result.current).toBe(true);
	});

	it('requests one animation frame for several scroll events before the frame runs', () => {
		renderHook(() => useHideOnScrollDown());

		scrollTo(100);
		scrollTo(200);
		scrollTo(300);

		expect(requestFrameSpy).toHaveBeenCalledTimes(1);
	});

	it('does not react to a scroll event until the animation frame runs', () => {
		const { result } = renderHook(() => useHideOnScrollDown());

		scrollTo(300);

		expect(result.current).toBe(false);
	});

	it('stops listening to scroll once unmounted', () => {
		const { unmount } = renderHook(() => useHideOnScrollDown());

		unmount();
		scrollTo(300);

		expect(requestFrameSpy).not.toHaveBeenCalled();
	});

	it('cancels a pending animation frame when unmounted', () => {
		const { unmount } = renderHook(() => useHideOnScrollDown());

		scrollTo(300);
		unmount();

		expect(cancelFrameSpy).toHaveBeenCalledTimes(1);
	});
});
