import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';

import { NOTIFICATION_TARGET_STATE_KEY, NOTIFICATION_TYPES } from '../../constants/notifications';

import NotificationRow from './NotificationRow';

const HOUR_MS = 60 * 60 * 1000;

const LocationProbe = () => {
	const { pathname, hash, state } = useLocation();

	return (
		<div>
			<p data-testid='path'>{pathname}</p>

			<p data-testid='hash'>{hash}</p>

			<p data-testid='state'>{JSON.stringify(state)}</p>
		</div>
	);
};

const buildNotification = (overrides = {}) => ({
	_id: 'n1',
	type: NOTIFICATION_TYPES.POST_LIKE,
	createdAt: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
	actor: { _id: 'user2', username: 'janedoe', profilePicture: { imageUrl: 'https://example.com/jane.jpg' } },
	post: { _id: 'post1', imageUrl: 'https://example.com/post1.jpg', userId: 'user1' },
	excerpt: null,
	...overrides,
});

const renderRow = (notification, { isUnread = false } = {}) => {
	const onClick = vi.fn();

	const rendered = render(
		<MemoryRouter initialEntries={['/user-feed']}>
			<ul>
				<NotificationRow notification={notification} isUnread={isUnread} onClick={onClick} />
			</ul>

			<LocationProbe />
		</MemoryRouter>,
	);

	return { ...rendered, onClick };
};

describe('NotificationRow', () => {
	let user;

	beforeEach(() => {
		user = userEvent.setup();
	});

	describe('content', () => {
		it.each([
			[NOTIFICATION_TYPES.FOLLOW, null, 'started following you.'],
			[NOTIFICATION_TYPES.POST_LIKE, null, 'liked your post.'],
			[NOTIFICATION_TYPES.COMMENT_LIKE, 'lovely colours', 'liked your comment: lovely colours'],
			[NOTIFICATION_TYPES.COMMENT, 'lovely colours', 'commented: lovely colours'],
			[NOTIFICATION_TYPES.REPLY, 'lovely colours', 'replied to your comment: lovely colours'],
			[NOTIFICATION_TYPES.REPLY_ON_POST, 'lovely colours', 'replied to a comment on your post: lovely colours'],
		])('says what a %s notification means', (type, excerpt, message) => {
			const { container } = renderRow(buildNotification({ type, excerpt, ...(type === NOTIFICATION_TYPES.FOLLOW && { post: null }) }));

			expect(container.querySelector('.notification-row-text')).toHaveTextContent(`janedoe ${message}`);
		});

		it('shows the actor name as a link to their profile', () => {
			renderRow(buildNotification());

			expect(screen.getByText('janedoe')).toHaveAttribute('href', '/user/user2');
		});

		it('shows the actor profile picture', () => {
			const { container } = renderRow(buildNotification());

			expect(container.querySelector('.notification-row-avatar')).toHaveAttribute('src', 'https://example.com/jane.jpg');
		});

		it('falls back to the placeholder avatar when the actor has no picture', () => {
			const { container } = renderRow(buildNotification({ actor: { _id: 'user2', username: 'janedoe' } }));

			expect(container.querySelector('svg.notification-row-avatar')).toBeInTheDocument();
		});

		it('shows how long ago it happened', () => {
			renderRow(buildNotification());

			expect(screen.getByText('2h')).toHaveClass('notification-row-time');
		});

		it('shows the post thumbnail on the right when there is a post', () => {
			const { container } = renderRow(buildNotification());

			expect(container.querySelector('.notification-row-thumbnail')).toHaveAttribute('src', 'https://example.com/post1.jpg');
		});

		it('shows no thumbnail for a follow', () => {
			const { container } = renderRow(buildNotification({ type: NOTIFICATION_TYPES.FOLLOW, post: null }));

			expect(container.querySelector('.notification-row-thumbnail')).not.toBeInTheDocument();
		});

		it('hides the thumbnail from assistive technology', () => {
			const { container } = renderRow(buildNotification());

			expect(container.querySelector('.notification-row-thumbnail')).toHaveAttribute('alt', '');
		});

		it('describes the whole row to assistive technology through one link', () => {
			renderRow(buildNotification({ type: NOTIFICATION_TYPES.COMMENT, excerpt: 'lovely colours' }));

			expect(screen.getByRole('link', { name: 'janedoe commented: lovely colours' })).toBeInTheDocument();
		});
	});

	describe('unread highlight', () => {
		it('highlights an unread row', () => {
			const { container } = renderRow(buildNotification(), { isUnread: true });

			expect(container.querySelector('.notification-row')).toHaveClass('notification-row-unread');
		});

		it('does not highlight a read row', () => {
			const { container } = renderRow(buildNotification());

			expect(container.querySelector('.notification-row')).not.toHaveClass('notification-row-unread');
		});
	});

	describe('navigation', () => {
		it('opens the actor profile when a follow row is clicked', async () => {
			renderRow(buildNotification({ type: NOTIFICATION_TYPES.FOLLOW, post: null }));

			await user.click(screen.getByRole('link', { name: 'janedoe started following you.' }));

			expect(screen.getByTestId('path')).toHaveTextContent('/user/user2');
		});

		it('opens the posts view of the post owner scrolled to the post when a like row is clicked', async () => {
			renderRow(buildNotification());

			await user.click(screen.getByRole('link', { name: 'janedoe liked your post.' }));

			expect(screen.getByTestId('path')).toHaveTextContent('/user/user1/posts');
			expect(screen.getByTestId('hash')).toHaveTextContent('#post1');
		});

		it('does not ask to open the comments for a like row', async () => {
			renderRow(buildNotification());

			await user.click(screen.getByRole('link', { name: 'janedoe liked your post.' }));

			expect(JSON.parse(screen.getByTestId('state').textContent)[NOTIFICATION_TARGET_STATE_KEY]).toEqual({
				postId: 'post1',
				shouldOpenComments: false,
			});
		});

		it.each([[NOTIFICATION_TYPES.COMMENT_LIKE], [NOTIFICATION_TYPES.COMMENT], [NOTIFICATION_TYPES.REPLY], [NOTIFICATION_TYPES.REPLY_ON_POST]])(
			'opens the post with its comments when a %s row is clicked',
			async (type) => {
				const { container } = renderRow(buildNotification({ type, excerpt: 'lovely colours' }));

				await user.click(container.querySelector('.notification-row-target'));

				expect(screen.getByTestId('path')).toHaveTextContent('/user/user1/posts');
				expect(JSON.parse(screen.getByTestId('state').textContent)[NOTIFICATION_TARGET_STATE_KEY]).toEqual({
					postId: 'post1',
					shouldOpenComments: true,
				});
			},
		);

		it('opens the actor profile, not the post, when the name is clicked', async () => {
			renderRow(buildNotification());

			await user.click(screen.getByText('janedoe'));

			expect(screen.getByTestId('path')).toHaveTextContent('/user/user2');
		});

		it('opens the actor profile when the avatar is clicked', async () => {
			const { container } = renderRow(buildNotification());

			await user.click(container.querySelector('.notification-row-avatar'));

			expect(screen.getByTestId('path')).toHaveTextContent('/user/user2');
		});
	});

	describe('onClick', () => {
		it('is called when the row is clicked', async () => {
			const { onClick } = renderRow(buildNotification());

			await user.click(screen.getByRole('link', { name: 'janedoe liked your post.' }));

			expect(onClick).toHaveBeenCalledTimes(1);
		});

		it('is called when the name is clicked', async () => {
			const { onClick } = renderRow(buildNotification());

			await user.click(screen.getByText('janedoe'));

			expect(onClick).toHaveBeenCalledTimes(1);
		});

		it('is called when the avatar is clicked', async () => {
			const { container, onClick } = renderRow(buildNotification());

			await user.click(container.querySelector('.notification-row-avatar'));

			expect(onClick).toHaveBeenCalledTimes(1);
		});

		it('is not called before anything is clicked', () => {
			const { onClick } = renderRow(buildNotification());

			expect(onClick).not.toHaveBeenCalled();
		});
	});
});
