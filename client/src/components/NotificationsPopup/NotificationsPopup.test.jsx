import '@testing-library/jest-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotificationsContext from '../../contexts/NotificationsContext';
import { getNotifications, markAllNotificationsRead } from '../../services/notificationService';
import { RequestError } from '../../services/requester';
import { ERROR_CODES } from '../../constants/errorCodes';
import { NOTIFICATION_TYPES } from '../../constants/notifications';

import NotificationsPopup from './NotificationsPopup';

jest.mock('../../services/notificationService');

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.now();

const hoursAgo = (hours) => new Date(NOW - hours * HOUR_MS).toISOString();

const buildNotification = (id, overrides = {}) => ({
	_id: id,
	type: NOTIFICATION_TYPES.POST_LIKE,
	createdAt: hoursAgo(1),
	actor: { _id: `actor-${id}`, username: `user-${id}` },
	post: { _id: `post-${id}`, imageUrl: `https://example.com/${id}.jpg`, userId: 'user1' },
	excerpt: null,
	...overrides,
});

const buildPage = (notifications, overrides = {}) => ({
	notifications,
	hasMore: false,
	nextCursor: null,
	unreadSince: null,
	fetchedAt: new Date(NOW).toISOString(),
	...overrides,
});

const unauthenticatedError = () => new RequestError({ code: ERROR_CODES.UNAUTHENTICATED, status: 401, message: 'Unauthorized' });

const serverError = () => new RequestError({ code: ERROR_CODES.INTERNAL_ERROR, status: 500, message: 'Failed' });

const renderPopup = () => {
	const onClose = jest.fn();
	const endSession = jest.fn();
	const clearUnreadCount = jest.fn();

	const ui = (
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser: { _id: 'user1', username: 'johndoe' }, endSession }}>
			<NotificationsContext.Provider value={{ unreadCount: 2, clearUnreadCount }}>
				<MemoryRouter>
					<NotificationsPopup onClose={onClose} />
				</MemoryRouter>
			</NotificationsContext.Provider>
		</LoggedInUserContext.Provider>
	);

	const rendered = render(ui);

	return { ...rendered, ui, onClose, endSession, clearUnreadCount };
};

describe('NotificationsPopup', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		markAllNotificationsRead.mockResolvedValue(undefined);
	});

	describe('while loading', () => {
		it('shows the loading spinner under the Notifications title', () => {
			getNotifications.mockReturnValue(new Promise(() => {}));

			const { container } = renderPopup();

			expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
			expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
		});

		it('does not mark anything read before the list has loaded', () => {
			getNotifications.mockReturnValue(new Promise(() => {}));

			renderPopup();

			expect(markAllNotificationsRead).not.toHaveBeenCalled();
		});
	});

	describe('with notifications', () => {
		beforeEach(() => {
			getNotifications.mockResolvedValue(
				buildPage([
					buildNotification('n3', { type: NOTIFICATION_TYPES.FOLLOW, post: null }),
					buildNotification('n2', { type: NOTIFICATION_TYPES.COMMENT, excerpt: 'lovely colours' }),
					buildNotification('n1'),
				]),
			);
		});

		it('fetches the first page with the token and no cursor', async () => {
			renderPopup();

			await screen.findByText('user-n1');

			expect(getNotifications).toHaveBeenCalledWith({ jwtToken: 'token123' });
		});

		it('lists the rows in the order the server sent them, newest first', async () => {
			const { container } = renderPopup();

			await screen.findByText('user-n1');

			expect([...container.querySelectorAll('.notification-row-username')].map((name) => name.textContent)).toEqual([
				'user-n3',
				'user-n2',
				'user-n1',
			]);
		});

		it('shows each row with its message', async () => {
			const { container } = renderPopup();

			await screen.findByText('user-n1');

			const texts = [...container.querySelectorAll('.notification-row-text')].map((text) => text.textContent);

			expect(texts[0]).toContain('started following you.');
			expect(texts[1]).toContain('commented: lovely colours');
			expect(texts[2]).toContain('liked your post.');
		});

		it('shows neither the empty state nor an error', async () => {
			renderPopup();

			await screen.findByText('user-n1');

			expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument();
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('marks everything read once the list has loaded and clears the unread count', async () => {
			const { clearUnreadCount } = renderPopup();

			await screen.findByText('user-n1');

			await waitFor(() => expect(clearUnreadCount).toHaveBeenCalledTimes(1));
			expect(markAllNotificationsRead).toHaveBeenCalledWith({ jwtToken: 'token123', cutoff: new Date(NOW).toISOString() });
			expect(markAllNotificationsRead).toHaveBeenCalledTimes(1);
		});

		it('fetches the list afresh every time it is opened', async () => {
			const { unmount, ui } = renderPopup();

			await screen.findByText('user-n1');
			unmount();
			render(ui);
			await screen.findByText('user-n1');

			expect(getNotifications).toHaveBeenCalledTimes(2);
		});
	});

	describe('unread highlight', () => {
		it('highlights the rows from the oldest unread one onwards and not the older ones', async () => {
			getNotifications.mockResolvedValue(
				buildPage(
					[
						buildNotification('n3', { createdAt: hoursAgo(1) }),
						buildNotification('n2', { createdAt: hoursAgo(2) }),
						buildNotification('n1', { createdAt: hoursAgo(5) }),
					],
					{
						unreadSince: hoursAgo(2),
					},
				),
			);

			const { container } = renderPopup();

			await screen.findByText('user-n1');

			const rows = container.querySelectorAll('.notification-row');

			expect(rows[0]).toHaveClass('notification-row-unread');
			expect(rows[1]).toHaveClass('notification-row-unread');
			expect(rows[2]).not.toHaveClass('notification-row-unread');
		});

		it('keeps the highlight after the notifications were marked read', async () => {
			getNotifications.mockResolvedValue(buildPage([buildNotification('n1', { createdAt: hoursAgo(1) })], { unreadSince: hoursAgo(1) }));

			const { container, clearUnreadCount } = renderPopup();

			await screen.findByText('user-n1');
			await waitFor(() => expect(clearUnreadCount).toHaveBeenCalled());

			expect(container.querySelector('.notification-row')).toHaveClass('notification-row-unread');
		});

		it('highlights nothing when nothing was unread', async () => {
			getNotifications.mockResolvedValue(buildPage([buildNotification('n1')]));

			const { container } = renderPopup();

			await screen.findByText('user-n1');

			expect(container.querySelector('.notification-row-unread')).not.toBeInTheDocument();
		});
	});

	describe('when marking read fails', () => {
		it('still shows the list and leaves the unread count alone', async () => {
			getNotifications.mockResolvedValue(buildPage([buildNotification('n1')]));
			markAllNotificationsRead.mockRejectedValue(serverError());

			const { clearUnreadCount } = renderPopup();

			await screen.findByText('user-n1');
			await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled());

			expect(clearUnreadCount).not.toHaveBeenCalled();
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('ends the session when the token is no longer valid', async () => {
			getNotifications.mockResolvedValue(buildPage([buildNotification('n1')]));
			markAllNotificationsRead.mockRejectedValue(unauthenticatedError());

			const { endSession } = renderPopup();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});
	});

	describe('when there are none', () => {
		beforeEach(() => {
			getNotifications.mockResolvedValue(buildPage([]));
		});

		it('shows the empty state heading and description', async () => {
			renderPopup();

			expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
			expect(screen.getByText("When people follow you, like or comment on your posts, you'll see it here.")).toBeInTheDocument();
		});

		it('shows no rows', async () => {
			const { container } = renderPopup();

			await screen.findByText('No notifications yet');

			expect(container.querySelector('.notification-row')).not.toBeInTheDocument();
		});

		it('still marks everything read with the first page cutoff', async () => {
			renderPopup();

			await screen.findByText('No notifications yet');

			await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledTimes(1));
			expect(markAllNotificationsRead).toHaveBeenCalledWith({ jwtToken: 'token123', cutoff: new Date(NOW).toISOString() });
		});

		it('clears the unread dot even though there is nothing to show', async () => {
			const { clearUnreadCount } = renderPopup();

			await screen.findByText('No notifications yet');

			await waitFor(() => expect(clearUnreadCount).toHaveBeenCalledTimes(1));
		});
	});

	describe('when the list fails to load', () => {
		it('shows the inline "Couldn\'t load this list · Try again" error as an alert', async () => {
			getNotifications.mockRejectedValue(serverError());

			renderPopup();

			const alert = await screen.findByRole('alert');

			expect(alert).toHaveTextContent("Couldn't load this list·Try again");
		});

		it('shows no spinner, rows or empty state next to the error', async () => {
			getNotifications.mockRejectedValue(serverError());

			const { container } = renderPopup();

			await screen.findByRole('alert');

			expect(container.querySelector('.loading-spinner')).not.toBeInTheDocument();
			expect(container.querySelector('.notification-row')).not.toBeInTheDocument();
			expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument();
		});

		it('does not mark anything read', async () => {
			getNotifications.mockRejectedValue(serverError());

			const { clearUnreadCount } = renderPopup();

			await screen.findByRole('alert');

			expect(markAllNotificationsRead).not.toHaveBeenCalled();
			expect(clearUnreadCount).not.toHaveBeenCalled();
		});

		it('loads the list when Try again is clicked', async () => {
			getNotifications.mockRejectedValueOnce(serverError()).mockResolvedValueOnce(buildPage([buildNotification('n1')]));

			renderPopup();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			expect(await screen.findByText('user-n1')).toBeInTheDocument();
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
			expect(getNotifications).toHaveBeenCalledTimes(2);
		});

		it('shows the error again when Try again fails again', async () => {
			getNotifications.mockRejectedValue(serverError());

			renderPopup();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			await waitFor(() => expect(getNotifications).toHaveBeenCalledTimes(2));
			expect(await screen.findByRole('alert')).toBeInTheDocument();
		});

		it('ends the session instead of showing the error when the token is no longer valid', async () => {
			getNotifications.mockRejectedValue(unauthenticatedError());

			const { endSession } = renderPopup();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});
	});

	describe('infinite scroll', () => {
		const firstPage = () =>
			buildPage([buildNotification('n3'), buildNotification('n2')], { hasMore: true, nextCursor: 'cursor-1', unreadSince: null });

		it('asks for the next page with the cursor and appends it below the first', async () => {
			getNotifications.mockResolvedValueOnce(firstPage()).mockResolvedValueOnce(buildPage([buildNotification('n1')]));

			const { container } = renderPopup();

			await screen.findByText('user-n1');

			expect(getNotifications).toHaveBeenNthCalledWith(2, { jwtToken: 'token123', cursor: 'cursor-1' });
			expect([...container.querySelectorAll('.notification-row-username')].map((name) => name.textContent)).toEqual([
				'user-n3',
				'user-n2',
				'user-n1',
			]);
		});

		it('does not show a row twice when the next page repeats one', async () => {
			getNotifications.mockResolvedValueOnce(firstPage()).mockResolvedValueOnce(buildPage([buildNotification('n2'), buildNotification('n1')]));

			const { container } = renderPopup();

			await screen.findByText('user-n1');

			expect(container.querySelectorAll('.notification-row')).toHaveLength(3);
		});

		it('stops asking once the last page has arrived', async () => {
			getNotifications.mockResolvedValueOnce(firstPage()).mockResolvedValueOnce(buildPage([buildNotification('n1')]));

			renderPopup();

			await screen.findByText('user-n1');
			await act(async () => {
				await Promise.resolve();
			});

			expect(getNotifications).toHaveBeenCalledTimes(2);
		});

		it('shows "Couldn\'t load more notifications · Try again" when the next page fails, keeping the rows', async () => {
			getNotifications.mockResolvedValueOnce(firstPage()).mockRejectedValueOnce(serverError());

			renderPopup();

			const alert = await screen.findByRole('alert');

			expect(alert).toHaveTextContent("Couldn't load more notifications·Try again");
			expect(screen.getByText('user-n3')).toBeInTheDocument();
			expect(screen.getByText('user-n2')).toBeInTheDocument();
		});

		it('does not use the generic "more posts" wording', async () => {
			getNotifications.mockResolvedValueOnce(firstPage()).mockRejectedValueOnce(serverError());

			renderPopup();

			await screen.findByRole('alert');

			expect(screen.queryByText("Couldn't load more posts")).not.toBeInTheDocument();
		});

		it('does not replace the list with the full-list error when only the next page fails', async () => {
			getNotifications.mockResolvedValueOnce(firstPage()).mockRejectedValueOnce(serverError());

			renderPopup();

			await screen.findByRole('alert');

			expect(screen.queryByText("Couldn't load this list")).not.toBeInTheDocument();
		});

		it('retries the same cursor and appends the page when Try again is clicked', async () => {
			getNotifications
				.mockResolvedValueOnce(firstPage())
				.mockRejectedValueOnce(serverError())
				.mockResolvedValueOnce(buildPage([buildNotification('n1')]));

			renderPopup();

			userEvent.click(await within(await screen.findByRole('alert')).findByRole('button', { name: 'Try again' }));

			expect(await screen.findByText('user-n1')).toBeInTheDocument();
			expect(getNotifications).toHaveBeenNthCalledWith(3, { jwtToken: 'token123', cursor: 'cursor-1' });
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('ends the session when the token expires while loading the next page', async () => {
			getNotifications.mockResolvedValueOnce(firstPage()).mockRejectedValueOnce(unauthenticatedError());

			const { endSession } = renderPopup();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});

		it('sends the first page fetchedAt as the cutoff, not that of a later page', async () => {
			const firstFetchedAt = new Date(NOW).toISOString();
			const laterFetchedAt = new Date(NOW + HOUR_MS).toISOString();

			getNotifications
				.mockResolvedValueOnce({ ...firstPage(), fetchedAt: firstFetchedAt })
				.mockResolvedValueOnce(buildPage([buildNotification('n1')], { fetchedAt: laterFetchedAt }));

			renderPopup();

			await screen.findByText('user-n1');

			expect(markAllNotificationsRead).toHaveBeenCalledWith({ jwtToken: 'token123', cutoff: firstFetchedAt });
			expect(markAllNotificationsRead).not.toHaveBeenCalledWith(expect.objectContaining({ cutoff: laterFetchedAt }));
		});

		it('marks read only once, however many pages load', async () => {
			getNotifications.mockResolvedValueOnce(firstPage()).mockResolvedValueOnce(buildPage([buildNotification('n1')]));

			renderPopup();

			await screen.findByText('user-n1');

			expect(markAllNotificationsRead).toHaveBeenCalledTimes(1);
		});
	});

	describe('closing', () => {
		beforeEach(() => {
			getNotifications.mockResolvedValue(buildPage([buildNotification('n1')]));
		});

		it('closes when a row is clicked', async () => {
			const { onClose } = renderPopup();

			userEvent.click(await screen.findByRole('link', { name: 'user-n1 liked your post.' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes when the name on a row is clicked', async () => {
			const { onClose } = renderPopup();

			userEvent.click(await screen.findByText('user-n1'));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes when the close button is clicked', async () => {
			const { onClose } = renderPopup();

			await screen.findByText('user-n1');
			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes on Escape', async () => {
			const { onClose } = renderPopup();

			await screen.findByText('user-n1');
			userEvent.keyboard('{Escape}');

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('does not close when nothing was clicked', async () => {
			const { onClose } = renderPopup();

			await screen.findByText('user-n1');

			expect(onClose).not.toHaveBeenCalled();
		});
	});
});
