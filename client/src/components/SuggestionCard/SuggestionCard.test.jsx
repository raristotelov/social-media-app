import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { APP_NAME } from '../../constants/app';

import SuggestionCard from './SuggestionCard';

const suggestion = {
	_id: 'user2',
	username: 'alice',
	group: 'popular',
	profilePicture: { imageUrl: 'https://example.com/alice.jpg' },
};

const renderCard = (overrides = {}, { isFollowed } = {}) => {
	const onFollowClick = vi.fn();
	const onUnfollowClick = vi.fn();

	render(
		<MemoryRouter>
			<SuggestionCard
				suggestion={{ ...suggestion, ...overrides }}
				isFollowed={isFollowed}
				onFollowClick={onFollowClick}
				onUnfollowClick={onUnfollowClick}
			/>
		</MemoryRouter>,
	);

	return { onFollowClick, onUnfollowClick };
};

describe('SuggestionCard', () => {
	it('shows the username', () => {
		renderCard();

		expect(screen.getByText('alice')).toBeInTheDocument();
	});

	it('opens the profile from the photo and username', () => {
		renderCard();

		const link = screen.getByRole('link', { name: 'alice' });

		expect(link).toHaveAttribute('href', '/user/user2');
		expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.com/alice.jpg');
	});

	it('shows the placeholder avatar for a user without a picture', () => {
		renderCard({ profilePicture: undefined });

		expect(screen.getByRole('link').querySelector('svg')).toBeInTheDocument();
	});

	describe('story ring', () => {
		const getAvatar = () => screen.getByRole('link').querySelector('.suggestion-card-avatar');

		it('rings the photo red when the user has a story that is not fully watched', () => {
			renderCard({ story: { isWatched: false } });

			expect(getAvatar()).toHaveClass('story-ring', 'story-ring-unwatched');
		});

		it('rings the photo grey when the user has a story that is fully watched', () => {
			renderCard({ story: { isWatched: true } });

			expect(getAvatar()).toHaveClass('story-ring');
			expect(getAvatar()).not.toHaveClass('story-ring-unwatched');
		});

		it('rings the placeholder avatar too', () => {
			renderCard({ profilePicture: undefined, story: { isWatched: false } });

			expect(getAvatar()).toHaveClass('story-ring', 'story-ring-unwatched');
		});

		it.each([[null], [undefined]])('draws no ring when the story is %p', (story) => {
			renderCard({ story });

			expect(getAvatar()).not.toHaveClass('story-ring');
		});

		it('is an indicator only: the one link still opens the profile and nothing else is added', () => {
			renderCard({ story: { isWatched: false } });

			expect(screen.getAllByRole('link')).toHaveLength(1);
			expect(screen.getByRole('link')).toHaveAttribute('href', '/user/user2');
			expect(screen.getAllByRole('button')).toHaveLength(1);
		});
	});

	it('says "Popular on {APP_NAME}" for the most-followed group', () => {
		renderCard();

		expect(screen.getByText(`Popular on ${APP_NAME}`)).toBeInTheDocument();
	});

	it('says "New to {APP_NAME}" for the new group', () => {
		renderCard({ group: 'new' });

		expect(screen.getByText(`New to ${APP_NAME}`)).toBeInTheDocument();
	});

	it('says "Followed by X" for a mutual suggestion', () => {
		renderCard({ group: 'mutual', followedBy: { _id: 'u3', username: 'bob' }, moreMutualCount: 0 });

		expect(screen.getByText('Followed by bob')).toBeInTheDocument();
	});

	it('says "Followed by X + N more" for a mutual suggestion with others', () => {
		renderCard({ group: 'mutual', followedBy: { _id: 'u3', username: 'bob' }, moreMutualCount: 4 });

		expect(screen.getByText('Followed by bob + 4 more')).toBeInTheDocument();
	});

	it('has a primary Follow button', () => {
		renderCard();

		const button = screen.getByRole('button', { name: 'Follow alice' });

		expect(button).toHaveTextContent('Follow');
		expect(button).not.toHaveClass('button-secondary');
	});

	it('follows the user when Follow is clicked', async () => {
		const user = userEvent.setup();
		const { onFollowClick, onUnfollowClick } = renderCard();

		await user.click(screen.getByRole('button', { name: 'Follow alice' }));

		expect(onFollowClick).toHaveBeenCalledTimes(1);
		expect(onFollowClick).toHaveBeenCalledWith('user2');
		expect(onUnfollowClick).not.toHaveBeenCalled();
	});

	it('shows a primary Follow button when isFollowed is false', () => {
		renderCard({}, { isFollowed: false });

		const button = screen.getByRole('button', { name: 'Follow alice' });

		expect(button).toHaveTextContent('Follow');
		expect(button).not.toHaveClass('button-secondary');
	});

	describe('once followed', () => {
		it('shows a secondary Unfollow button labelled with the username', () => {
			renderCard({}, { isFollowed: true });

			const button = screen.getByRole('button', { name: 'Unfollow alice' });

			expect(button).toHaveTextContent('Unfollow');
			expect(button).toHaveClass('button-secondary');
			expect(screen.queryByRole('button', { name: 'Follow alice' })).not.toBeInTheDocument();
		});

		it('unfollows the user when Unfollow is clicked', async () => {
			const user = userEvent.setup();
			const { onFollowClick, onUnfollowClick } = renderCard({}, { isFollowed: true });

			await user.click(screen.getByRole('button', { name: 'Unfollow alice' }));

			expect(onUnfollowClick).toHaveBeenCalledTimes(1);
			expect(onUnfollowClick).toHaveBeenCalledWith('user2');
			expect(onFollowClick).not.toHaveBeenCalled();
		});

		it('keeps the photo and username link to the profile', () => {
			renderCard({}, { isFollowed: true });

			expect(screen.getByRole('link', { name: 'alice' })).toHaveAttribute('href', '/user/user2');
		});
	});

	it('does not follow when the profile link is clicked', async () => {
		const user = userEvent.setup();
		const { onFollowClick } = renderCard();

		await user.click(screen.getByRole('link', { name: 'alice' }));

		expect(onFollowClick).not.toHaveBeenCalled();
	});
});
