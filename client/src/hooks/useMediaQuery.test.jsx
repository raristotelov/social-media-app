import { act, renderHook } from '@testing-library/react';

import useMediaQuery from './useMediaQuery';

const QUERY = '(min-width: 1280px)';

const installMatchMedia = (matches) => {
	const listeners = new Set();
	const mediaQueryList = {
		matches,
		addEventListener: jest.fn((_event, listener) => listeners.add(listener)),
		removeEventListener: jest.fn((_event, listener) => listeners.delete(listener)),
	};

	window.matchMedia = jest.fn().mockReturnValue(mediaQueryList);

	return {
		mediaQueryList,
		listeners,
		change: (nextMatches) => {
			mediaQueryList.matches = nextMatches;
			listeners.forEach((listener) => listener());
		},
	};
};

describe('useMediaQuery', () => {
	const originalMatchMedia = window.matchMedia;

	afterEach(() => {
		window.matchMedia = originalMatchMedia;
	});

	it('is true when the query matches', () => {
		installMatchMedia(true);

		const { result } = renderHook(() => useMediaQuery(QUERY));

		expect(result.current).toBe(true);
	});

	it('is false when the query does not match', () => {
		installMatchMedia(false);

		const { result } = renderHook(() => useMediaQuery(QUERY));

		expect(result.current).toBe(false);
	});

	it('asks the browser about the query it was given', () => {
		installMatchMedia(false);

		renderHook(() => useMediaQuery(QUERY));

		expect(window.matchMedia).toHaveBeenCalledWith(QUERY);
	});

	it('updates when the viewport crosses the breakpoint', () => {
		const media = installMatchMedia(false);
		const { result } = renderHook(() => useMediaQuery(QUERY));

		act(() => media.change(true));

		expect(result.current).toBe(true);

		act(() => media.change(false));

		expect(result.current).toBe(false);
	});

	it('stops listening when unmounted', () => {
		const media = installMatchMedia(false);
		const { unmount } = renderHook(() => useMediaQuery(QUERY));

		expect(media.listeners.size).toBe(1);

		unmount();

		expect(media.listeners.size).toBe(0);
	});

	it('is false when the browser has no matchMedia', () => {
		window.matchMedia = undefined;

		const { result } = renderHook(() => useMediaQuery(QUERY));

		expect(result.current).toBe(false);
	});
});
