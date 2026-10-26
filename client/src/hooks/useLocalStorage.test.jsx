import { act, renderHook } from '@testing-library/react';

import useLocalStorage from './useLocalStorage';

const KEY = 'theme';

describe('useLocalStorage', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it('should return the initial value when nothing is stored', () => {
		const { result } = renderHook(() => useLocalStorage(KEY, 'light'));

		expect(result.current[0]).toBe('light');
	});

	it('should return the parsed stored value', () => {
		localStorage.setItem(KEY, JSON.stringify({ mode: 'dark' }));

		const { result } = renderHook(() => useLocalStorage(KEY, 'light'));

		expect(result.current[0]).toEqual({ mode: 'dark' });
	});

	it('should return the initial value when the stored value is corrupted', () => {
		localStorage.setItem(KEY, '{broken');

		const { result } = renderHook(() => useLocalStorage(KEY, 'light'));

		expect(result.current[0]).toBe('light');
	});

	it('should remove the key when the stored value is corrupted', () => {
		localStorage.setItem(KEY, '{broken');

		renderHook(() => useLocalStorage(KEY, 'light'));

		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('should store a set value as JSON and update the state', () => {
		const { result } = renderHook(() => useLocalStorage(KEY, 'light'));

		act(() => {
			result.current[1]('dark');
		});

		expect(result.current[0]).toBe('dark');
		expect(localStorage.getItem(KEY)).toBe(JSON.stringify('dark'));
	});

	it('should remove the key when a falsy value is set', () => {
		localStorage.setItem(KEY, JSON.stringify('dark'));
		const { result } = renderHook(() => useLocalStorage(KEY, 'light'));

		act(() => {
			result.current[1](null);
		});

		expect(result.current[0]).toBeNull();
		expect(localStorage.getItem(KEY)).toBeNull();
	});
});
