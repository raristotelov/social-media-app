import { act, renderHook, waitFor } from '@testing-library/react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { getStoryTray } from '../services/storyService';

import useStoryTray from './useStoryTray';

jest.mock('../services/storyService');

const trayEntries = [{ isOwn: true, isWatched: true, user: { _id: 'me', username: 'me' } }];

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const renderStoryTray = () => {
	const endSession = jest.fn();
	const wrapper = ({ children }) => (
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', endSession }}>{children}</LoggedInUserContext.Provider>
	);
	const rendered = renderHook(() => useStoryTray(), { wrapper });

	return { ...rendered, endSession };
};

describe('useStoryTray', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	it('starts empty and not loaded', () => {
		getStoryTray.mockReturnValue(new Promise(() => {}));

		const { result } = renderStoryTray();

		expect(result.current.entries).toEqual([]);
		expect(result.current.isLoaded).toBe(false);
	});

	it('requests the tray with the token', async () => {
		getStoryTray.mockResolvedValue(trayEntries);

		const { result } = renderStoryTray();

		await waitFor(() => expect(result.current.isLoaded).toBe(true));

		expect(getStoryTray).toHaveBeenCalledTimes(1);
		expect(getStoryTray).toHaveBeenCalledWith({ jwtToken: 'token123' });
	});

	it('exposes the entries once loaded', async () => {
		getStoryTray.mockResolvedValue(trayEntries);

		const { result } = renderStoryTray();

		await waitFor(() => expect(result.current.isLoaded).toBe(true));

		expect(result.current.entries).toEqual(trayEntries);
	});

	it('stays empty and not loaded when the request fails, with no error', async () => {
		const request = buildDeferred();

		getStoryTray.mockReturnValue(request.promise);

		const { result, endSession } = renderStoryTray();

		await act(async () => {
			request.reject({ code: 'INTERNAL_ERROR', status: 500 });
			await request.promise.catch(() => {});
		});

		expect(result.current.entries).toEqual([]);
		expect(result.current.isLoaded).toBe(false);
		expect(endSession).not.toHaveBeenCalled();
	});

	it('ends the session when the token is no longer valid', async () => {
		getStoryTray.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

		const { endSession } = renderStoryTray();

		await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
	});

	it('loads the tray again when reload is called', async () => {
		getStoryTray.mockResolvedValueOnce(trayEntries).mockResolvedValueOnce([]);

		const { result } = renderStoryTray();

		await waitFor(() => expect(result.current.isLoaded).toBe(true));

		act(() => {
			result.current.reload();
		});

		await waitFor(() => expect(result.current.entries).toEqual([]));
		expect(getStoryTray).toHaveBeenCalledTimes(2);
	});

	it('keeps showing the current entries while a reload is in flight', async () => {
		const reloadRequest = buildDeferred();

		getStoryTray.mockResolvedValueOnce(trayEntries).mockReturnValueOnce(reloadRequest.promise);

		const { result } = renderStoryTray();

		await waitFor(() => expect(result.current.isLoaded).toBe(true));

		act(() => {
			result.current.reload();
		});

		expect(result.current.entries).toEqual(trayEntries);
		expect(result.current.isLoaded).toBe(true);

		await act(async () => {
			reloadRequest.resolve([]);
			await reloadRequest.promise;
		});
	});

	it('ignores the answer of a request that finished after unmounting', async () => {
		const request = buildDeferred();

		getStoryTray.mockReturnValue(request.promise);

		const { result, unmount } = renderStoryTray();

		unmount();

		await act(async () => {
			request.resolve(trayEntries);
			await request.promise;
		});

		expect(result.current.isLoaded).toBe(false);
	});

	it('gives reload a stable identity across renders', async () => {
		getStoryTray.mockResolvedValue(trayEntries);

		const { result, rerender } = renderStoryTray();

		await waitFor(() => expect(result.current.isLoaded).toBe(true));

		const { reload } = result.current;

		rerender();

		expect(result.current.reload).toBe(reload);
	});
});
