import '@testing-library/jest-dom';
import { act, renderHook, screen } from '@testing-library/react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { followUser, unfollowUser } from '../services/userService';

import ToastProvider from '../components/ToastProvider/ToastProvider';

import useFollowActions from './useFollowActions';

jest.mock('../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', following: [] };

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const renderFollowActions = () => {
	const updateLoggedInUser = jest.fn();
	const endSession = jest.fn();
	const wrapper = ({ children }) => (
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser, endSession }}>
			<ToastProvider>{children}</ToastProvider>
		</LoggedInUserContext.Provider>
	);
	const rendered = renderHook(() => useFollowActions(), { wrapper });

	return { ...rendered, updateLoggedInUser, endSession };
};

describe('useFollowActions', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('follow', () => {
		it('sends the follow request with the logged-in user, the token and the target', async () => {
			followUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
			const { result } = renderFollowActions();

			await act(() => result.current.follow('user2'));

			expect(followUser).toHaveBeenCalledWith({ userId: 'user1', jwtToken: 'token123', userIdToFollow: 'user2' });
		});

		it('resolves true and refreshes the logged-in user with the server response', async () => {
			const response = { user: { ...loggedInUser, following: ['user2'] }, jwt: 'new.jwt' };

			followUser.mockResolvedValue(response);
			const { result, updateLoggedInUser } = renderFollowActions();

			let outcome;

			await act(async () => {
				outcome = await result.current.follow('user2');
			});

			expect(outcome).toBe(true);
			expect(updateLoggedInUser).toHaveBeenCalledWith(response);
		});

		it('resolves false and shows the follow toast when the request fails', async () => {
			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { result, updateLoggedInUser } = renderFollowActions();

			let outcome;

			await act(async () => {
				outcome = await result.current.follow('user2');
			});

			expect(outcome).toBe(false);
			expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
			expect(updateLoggedInUser).not.toHaveBeenCalled();
		});

		it('shows the follow toast for an error that is not a RequestError', async () => {
			followUser.mockRejectedValue(new Error('network down'));
			const { result } = renderFollowActions();

			await act(() => result.current.follow('user2'));

			expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
		});

		it('ends the session and shows no toast when the request fails with UNAUTHENTICATED', async () => {
			followUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { result, endSession } = renderFollowActions();

			let outcome;

			await act(async () => {
				outcome = await result.current.follow('user2');
			});

			expect(outcome).toBe(false);
			expect(endSession).toHaveBeenCalledTimes(1);
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});
	});

	describe('unfollow', () => {
		it('sends the unfollow request with the logged-in user, the token and the target', async () => {
			unfollowUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
			const { result } = renderFollowActions();

			await act(() => result.current.unfollow('user2'));

			expect(unfollowUser).toHaveBeenCalledWith({ userId: 'user1', jwtToken: 'token123', userIdToUnfollow: 'user2' });
		});

		it('resolves true and refreshes the logged-in user with the server response', async () => {
			const response = { user: loggedInUser, jwt: 'new.jwt' };

			unfollowUser.mockResolvedValue(response);
			const { result, updateLoggedInUser } = renderFollowActions();

			let outcome;

			await act(async () => {
				outcome = await result.current.unfollow('user2');
			});

			expect(outcome).toBe(true);
			expect(updateLoggedInUser).toHaveBeenCalledWith(response);
		});

		it('resolves false and shows the unfollow toast when the request fails', async () => {
			unfollowUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { result } = renderFollowActions();

			let outcome;

			await act(async () => {
				outcome = await result.current.unfollow('user2');
			});

			expect(outcome).toBe(false);
			expect(await screen.findByText("Couldn't unfollow this user. Try again.")).toBeInTheDocument();
		});

		it('ends the session and shows no toast when the request fails with UNAUTHENTICATED', async () => {
			unfollowUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { result, endSession } = renderFollowActions();

			await act(() => result.current.unfollow('user2'));

			expect(endSession).toHaveBeenCalledTimes(1);
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});
	});

	describe('overlapping requests', () => {
		it('ignores the response of an earlier request that returns after a later one', async () => {
			const first = buildDeferred();
			const second = buildDeferred();
			const firstResponse = { user: { ...loggedInUser, following: ['user2'] }, jwt: 'first.jwt' };
			const secondResponse = { user: { ...loggedInUser, following: ['user2', 'user3'] }, jwt: 'second.jwt' };

			followUser.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
			const { result, updateLoggedInUser } = renderFollowActions();

			let firstOutcome;
			let secondOutcome;

			await act(async () => {
				firstOutcome = result.current.follow('user2');
				secondOutcome = result.current.follow('user3');
				second.resolve(secondResponse);
				await secondOutcome;
				first.resolve(firstResponse);
				await firstOutcome;
			});

			expect(updateLoggedInUser).toHaveBeenCalledTimes(1);
			expect(updateLoggedInUser).toHaveBeenCalledWith(secondResponse);
			expect(await firstOutcome).toBe(true);
		});
	});
});
