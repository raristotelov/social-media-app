import { renderHook } from '@testing-library/react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';

import useSessionGuard from './useSessionGuard';

const renderSessionGuard = () => {
	const endSession = jest.fn();
	const wrapper = ({ children }) => <LoggedInUserContext.Provider value={{ endSession }}>{children}</LoggedInUserContext.Provider>;
	const rendered = renderHook(() => useSessionGuard(), { wrapper });

	return { ...rendered, endSession };
};

describe('useSessionGuard', () => {
	describe('runWithSessionGuard', () => {
		it('resolves with the value of the action', async () => {
			const { result } = renderSessionGuard();

			await expect(result.current.runWithSessionGuard(() => Promise.resolve('saved'))).resolves.toBe('saved');
		});

		it('does not end the session when the action succeeds', async () => {
			const { result, endSession } = renderSessionGuard();

			await result.current.runWithSessionGuard(() => Promise.resolve('saved'));

			expect(endSession).not.toHaveBeenCalled();
		});

		it('ends the session and rethrows the error when the action fails with UNAUTHENTICATED', async () => {
			const { result, endSession } = renderSessionGuard();
			const error = { code: 'UNAUTHENTICATED', status: 401 };

			await expect(result.current.runWithSessionGuard(() => Promise.reject(error))).rejects.toBe(error);

			expect(endSession).toHaveBeenCalledTimes(1);
		});

		it('rethrows any other error without ending the session', async () => {
			const { result, endSession } = renderSessionGuard();
			const error = { code: 'COMMENT_TEXT_REQUIRED', status: 400 };

			await expect(result.current.runWithSessionGuard(() => Promise.reject(error))).rejects.toBe(error);

			expect(endSession).not.toHaveBeenCalled();
		});

		it('does not end the session for an error that is not a request error', async () => {
			const { result, endSession } = renderSessionGuard();

			await expect(result.current.runWithSessionGuard(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

			expect(endSession).not.toHaveBeenCalled();
		});
	});

	describe('endSessionIfUnauthenticated', () => {
		it('ends the session for UNAUTHENTICATED', () => {
			const { result, endSession } = renderSessionGuard();

			result.current.endSessionIfUnauthenticated({ code: 'UNAUTHENTICATED', status: 401 });

			expect(endSession).toHaveBeenCalledTimes(1);
		});

		it('does nothing for any other error', () => {
			const { result, endSession } = renderSessionGuard();

			result.current.endSessionIfUnauthenticated({ code: 'INTERNAL_ERROR', status: 500 });

			expect(endSession).not.toHaveBeenCalled();
		});
	});
});
