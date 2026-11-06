import { act, renderHook } from '@testing-library/react';

import useSessionFlag from './useSessionFlag';

const KEY = 'demo-strip-dismissed';

describe('useSessionFlag', () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		sessionStorage.clear();
	});

	it('should be unset when nothing is stored', () => {
		const { result } = renderHook(() => useSessionFlag(KEY));

		expect(result.current[0]).toBe(false);
	});

	it('should be set when the flag is already stored in this tab', () => {
		sessionStorage.setItem(KEY, 'true');

		const { result } = renderHook(() => useSessionFlag(KEY));

		expect(result.current[0]).toBe(true);
	});

	it('should stay unset when the stored value is not the flag value', () => {
		sessionStorage.setItem(KEY, 'false');

		const { result } = renderHook(() => useSessionFlag(KEY));

		expect(result.current[0]).toBe(false);
	});

	it('should set the flag and store it in session storage', () => {
		const { result } = renderHook(() => useSessionFlag(KEY));

		act(() => {
			result.current[1]();
		});

		expect(result.current[0]).toBe(true);
		expect(sessionStorage.getItem(KEY)).toBe('true');
	});

	it('should not touch local storage', () => {
		const { result } = renderHook(() => useSessionFlag(KEY));

		act(() => {
			result.current[1]();
		});

		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('should still be set after a remount in the same tab', () => {
		const first = renderHook(() => useSessionFlag(KEY));

		act(() => {
			first.result.current[1]();
		});

		first.unmount();

		const second = renderHook(() => useSessionFlag(KEY));

		expect(second.result.current[0]).toBe(true);
	});

	it('should keep separate flags for separate keys', () => {
		sessionStorage.setItem('other-key', 'true');

		const { result } = renderHook(() => useSessionFlag(KEY));

		expect(result.current[0]).toBe(false);
	});

	it('should be unset when reading session storage throws', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('storage blocked');
		});

		const { result } = renderHook(() => useSessionFlag(KEY));

		expect(result.current[0]).toBe(false);
	});

	it('should still set the flag for the session of the page when writing to session storage throws', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('storage blocked');
		});

		const { result } = renderHook(() => useSessionFlag(KEY));

		act(() => {
			result.current[1]();
		});

		expect(result.current[0]).toBe(true);
	});
});
