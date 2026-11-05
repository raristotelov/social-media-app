import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotificationsContext from '../../contexts/NotificationsContext';
import { getUnreadNotificationCount } from '../../services/notificationService';
import { RequestError } from '../../services/requester';
import { ERROR_CODES } from '../../constants/errorCodes';
import { NOTIFICATIONS_POLL_INTERVAL_MS } from '../../constants/notifications';

import NotificationsProvider from './NotificationsProvider';

jest.mock('../../services/notificationService');

const loggedInUser = { _id: 'user1', username: 'johndoe' };

const CountProbe = () => {
	const { unreadCount, clearUnreadCount } = useContext(NotificationsContext);

	return (
		<div>
			<p data-testid='count'>{unreadCount}</p>

			<button type='button' onClick={clearUnreadCount}>
				Clear
			</button>
		</div>
	);
};

const buildTree = ({ jwtToken = 'token123', user = loggedInUser, endSession = jest.fn() } = {}) => (
	<LoggedInUserContext.Provider value={{ jwtToken, loggedInUser: user, endSession }}>
		<NotificationsProvider>
			<CountProbe />
		</NotificationsProvider>
	</LoggedInUserContext.Provider>
);

const setVisibility = (state) => {
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });

	act(() => {
		document.dispatchEvent(new Event('visibilitychange'));
	});
};

const advance = async (ms) => {
	await act(async () => {
		jest.advanceTimersByTime(ms);
	});
};

const flush = async () => {
	await act(async () => {
		await Promise.resolve();
	});
};

describe('NotificationsProvider', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
		getUnreadNotificationCount.mockResolvedValue({ count: 3 });
	});

	afterEach(() => {
		jest.useRealTimers();
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
	});

	describe('for a guest', () => {
		it('never asks for the count and shows zero', async () => {
			render(buildTree({ jwtToken: null, user: null }));
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS * 3);

			expect(getUnreadNotificationCount).not.toHaveBeenCalled();
			expect(screen.getByTestId('count')).toHaveTextContent('0');
		});

		it('does not ask when there is a token but no user yet', async () => {
			render(buildTree({ user: null }));
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);

			expect(getUnreadNotificationCount).not.toHaveBeenCalled();
		});
	});

	describe('on app load', () => {
		it('fetches the count with the token', async () => {
			render(buildTree());
			await flush();

			expect(getUnreadNotificationCount).toHaveBeenCalledWith({ jwtToken: 'token123' });
			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1);
		});

		it('shows the fetched count', async () => {
			render(buildTree());
			await flush();

			expect(screen.getByTestId('count')).toHaveTextContent('3');
		});

		it('starts at zero before the count arrives', () => {
			getUnreadNotificationCount.mockReturnValue(new Promise(() => {}));

			render(buildTree());

			expect(screen.getByTestId('count')).toHaveTextContent('0');
		});
	});

	describe('polling', () => {
		it('fetches again every 60 seconds', async () => {
			render(buildTree());
			await flush();
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);

			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(3);
		});

		it('uses an interval of exactly 60 seconds', () => {
			expect(NOTIFICATIONS_POLL_INTERVAL_MS).toBe(60 * 1000);
		});

		it('does not fetch before the 60 seconds are up', async () => {
			render(buildTree());
			await flush();
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS - 1);

			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1);
		});

		it('shows the new count after a poll', async () => {
			render(buildTree());
			await flush();
			getUnreadNotificationCount.mockResolvedValue({ count: 7 });
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);

			expect(screen.getByTestId('count')).toHaveTextContent('7');
		});

		it('stops asking while the tab is hidden', async () => {
			render(buildTree());
			await flush();
			setVisibility('hidden');
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS * 3);

			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1);
		});

		it('does not ask at all when the app loads in a hidden tab', async () => {
			Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });

			render(buildTree());
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS * 2);

			expect(getUnreadNotificationCount).not.toHaveBeenCalled();
		});

		it('asks right away when the tab becomes visible again', async () => {
			render(buildTree());
			await flush();
			setVisibility('hidden');
			setVisibility('visible');
			await flush();

			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2);
		});

		it('resumes the 60 second rhythm once the tab is visible again', async () => {
			render(buildTree());
			await flush();
			setVisibility('hidden');
			setVisibility('visible');
			await flush();
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);

			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(3);
		});

		it('does not run two timers when visible is announced twice', async () => {
			render(buildTree());
			await flush();
			setVisibility('visible');
			setVisibility('visible');
			await flush();
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);

			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2);
		});

		it('stops polling when the provider unmounts', async () => {
			const { unmount } = render(buildTree());

			await flush();
			unmount();
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS * 2);

			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1);
		});

		it('stops polling and resets to zero on logout', async () => {
			const { rerender } = render(buildTree());

			await flush();
			rerender(buildTree({ jwtToken: null, user: null }));
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS * 2);

			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1);
			expect(screen.getByTestId('count')).toHaveTextContent('0');
		});
	});

	describe('clearUnreadCount', () => {
		it('sets the count to zero', async () => {
			render(buildTree());
			await flush();

			userEvent.click(screen.getByRole('button', { name: 'Clear' }));

			expect(screen.getByTestId('count')).toHaveTextContent('0');
		});

		it('lets the next poll bring the count back', async () => {
			render(buildTree());
			await flush();
			userEvent.click(screen.getByRole('button', { name: 'Clear' }));
			getUnreadNotificationCount.mockResolvedValue({ count: 1 });
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);

			expect(screen.getByTestId('count')).toHaveTextContent('1');
		});

		describe('with a poll still in flight', () => {
			const deferPoll = () => {
				let resolvePoll;

				getUnreadNotificationCount.mockReturnValueOnce(
					new Promise((resolve) => {
						resolvePoll = resolve;
					}),
				);

				return (value) => resolvePoll(value);
			};

			it('ignores a response from a request that started before the clear', async () => {
				const resolvePoll = deferPoll();

				render(buildTree());
				userEvent.click(screen.getByRole('button', { name: 'Clear' }));
				resolvePoll({ count: 5 });
				await flush();

				expect(screen.getByTestId('count')).toHaveTextContent('0');
			});

			it('ignores a stale response from a later interval poll as well', async () => {
				render(buildTree());
				await flush();

				const resolvePoll = deferPoll();

				await advance(NOTIFICATIONS_POLL_INTERVAL_MS);
				userEvent.click(screen.getByRole('button', { name: 'Clear' }));
				resolvePoll({ count: 9 });
				await flush();

				expect(screen.getByTestId('count')).toHaveTextContent('0');
			});

			it('still applies a response from a request that started after the clear', async () => {
				render(buildTree());
				await flush();
				userEvent.click(screen.getByRole('button', { name: 'Clear' }));

				const resolvePoll = deferPoll();

				await advance(NOTIFICATIONS_POLL_INTERVAL_MS);
				resolvePoll({ count: 4 });
				await flush();

				expect(screen.getByTestId('count')).toHaveTextContent('4');
			});

			it('ignores every response that was in flight across several clears', async () => {
				const resolvePoll = deferPoll();

				render(buildTree());
				userEvent.click(screen.getByRole('button', { name: 'Clear' }));
				userEvent.click(screen.getByRole('button', { name: 'Clear' }));
				resolvePoll({ count: 6 });
				await flush();

				expect(screen.getByTestId('count')).toHaveTextContent('0');
			});
		});
	});

	describe('when a poll fails', () => {
		it('keeps the last known count', async () => {
			render(buildTree());
			await flush();
			getUnreadNotificationCount.mockRejectedValue(new RequestError({ code: ERROR_CODES.INTERNAL_ERROR, status: 500, message: 'Failed' }));
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);

			expect(screen.getByTestId('count')).toHaveTextContent('3');
		});

		it('keeps polling', async () => {
			render(buildTree());
			await flush();
			getUnreadNotificationCount.mockRejectedValueOnce(new RequestError({ code: ERROR_CODES.INTERNAL_ERROR, status: 500, message: 'Failed' }));
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);
			await advance(NOTIFICATIONS_POLL_INTERVAL_MS);

			expect(getUnreadNotificationCount).toHaveBeenCalledTimes(3);
		});

		it('does not end the session for an ordinary failure', async () => {
			const endSession = jest.fn();

			getUnreadNotificationCount.mockRejectedValue(new RequestError({ code: ERROR_CODES.INTERNAL_ERROR, status: 500, message: 'Failed' }));

			render(buildTree({ endSession }));
			await flush();

			expect(endSession).not.toHaveBeenCalled();
		});

		it('ends the session when the token is no longer valid', async () => {
			const endSession = jest.fn();

			getUnreadNotificationCount.mockRejectedValue(
				new RequestError({ code: ERROR_CODES.UNAUTHENTICATED, status: 401, message: 'Unauthorized' }),
			);

			render(buildTree({ endSession }));
			await flush();

			expect(endSession).toHaveBeenCalledTimes(1);
		});
	});
});
