import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { APP_NAME } from '../../constants/app';

import SuggestedUser from './SuggestedUser';

const popularSuggestion = {
	_id: 'user2',
	username: 'alice',
	group: 'popular',
	profilePicture: { imageUrl: 'https://example.com/alice.jpg' },
};

const renderSuggestedUser = ({ suggestion = popularSuggestion, actionStyle = 'button', isFollowed = false } = {}) => {
	const onFollowClick = vi.fn();
	const onUnfollowClick = vi.fn();

	render(
		<MemoryRouter>
			<SuggestedUser
				suggestion={suggestion}
				actionStyle={actionStyle}
				isFollowed={isFollowed}
				onFollowClick={onFollowClick}
				onUnfollowClick={onUnfollowClick}
			/>
		</MemoryRouter>,
	);

	return { onFollowClick, onUnfollowClick };
};

describe('SuggestedUser', () => {
	let user;

	beforeEach(() => {
		user = userEvent.setup();
	});

	describe('the reason line', () => {
		it('says "Followed by X" for a mutual suggestion', () => {
			renderSuggestedUser({
				suggestion: { ...popularSuggestion, group: 'mutual', followedBy: { _id: 'u3', username: 'bob' }, moreMutualCount: 0 },
			});

			expect(screen.getByText('Followed by bob')).toBeInTheDocument();
		});

		it('says "Followed by X + N more" when there are more mutual connections', () => {
			renderSuggestedUser({
				suggestion: { ...popularSuggestion, group: 'mutual', followedBy: { _id: 'u3', username: 'bob' }, moreMutualCount: 2 },
			});

			expect(screen.getByText('Followed by bob + 2 more')).toBeInTheDocument();
		});

		it('says "Popular on {APP_NAME}" for the most-followed group', () => {
			renderSuggestedUser();

			expect(screen.getByText(`Popular on ${APP_NAME}`)).toBeInTheDocument();
		});

		it('says "New to {APP_NAME}" for the new group', () => {
			renderSuggestedUser({ suggestion: { ...popularSuggestion, group: 'new' } });

			expect(screen.getByText(`New to ${APP_NAME}`)).toBeInTheDocument();
		});
	});

	describe('the link to the profile', () => {
		it('opens the profile from the photo and username', () => {
			renderSuggestedUser();

			const link = screen.getByRole('link', { name: /alice/ });

			expect(link).toHaveAttribute('href', '/user/user2');
			expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.com/alice.jpg');
		});

		it('wraps the username and the reason in the same link', () => {
			renderSuggestedUser();

			expect(screen.getByRole('link')).toHaveTextContent('alice');
			expect(screen.getByRole('link')).toHaveTextContent(`Popular on ${APP_NAME}`);
		});

		it('shows the placeholder avatar for a user without a picture', () => {
			renderSuggestedUser({ suggestion: { ...popularSuggestion, profilePicture: undefined } });

			expect(screen.getByRole('link').querySelector('svg')).toBeInTheDocument();
			expect(screen.getByRole('link').querySelector('img')).not.toBeInTheDocument();
		});

		it('does not follow when the link is clicked', async () => {
			const { onFollowClick } = renderSuggestedUser();

			await user.click(screen.getByRole('link'));

			expect(onFollowClick).not.toHaveBeenCalled();
		});
	});

	describe('story ring', () => {
		const getAvatar = () => screen.getByRole('link').querySelector('.suggested-user-avatar');

		it('rings the photo red when the user has a story that is not fully watched', () => {
			renderSuggestedUser({ suggestion: { ...popularSuggestion, story: { isWatched: false } } });

			expect(getAvatar()).toHaveClass('story-ring', 'story-ring-unwatched');
		});

		it('rings the photo grey when the user has a story that is fully watched', () => {
			renderSuggestedUser({ suggestion: { ...popularSuggestion, story: { isWatched: true } } });

			expect(getAvatar()).toHaveClass('story-ring');
			expect(getAvatar()).not.toHaveClass('story-ring-unwatched');
		});

		it('rings the placeholder avatar too', () => {
			renderSuggestedUser({ suggestion: { ...popularSuggestion, profilePicture: undefined, story: { isWatched: false } } });

			expect(getAvatar()).toHaveClass('story-ring', 'story-ring-unwatched');
		});

		it.each([[null], [undefined]])('draws no ring when the story is %p', (story) => {
			renderSuggestedUser({ suggestion: { ...popularSuggestion, story } });

			expect(getAvatar()).not.toHaveClass('story-ring');
		});

		it('is an indicator only: the one link still opens the profile and nothing else is added', () => {
			renderSuggestedUser({ suggestion: { ...popularSuggestion, story: { isWatched: false } } });

			expect(screen.getAllByRole('link')).toHaveLength(1);
			expect(screen.getByRole('link')).toHaveAttribute('href', '/user/user2');
			expect(screen.getAllByRole('button')).toHaveLength(1);
		});

		it('keeps the follow action working on a ringed row', async () => {
			const { onFollowClick } = renderSuggestedUser({ suggestion: { ...popularSuggestion, story: { isWatched: false } } });

			await user.click(screen.getByRole('button', { name: /follow/i }));

			expect(onFollowClick).toHaveBeenCalledWith('user2');
		});
	});

	describe('as a button (empty feed)', () => {
		it('shows a primary Follow button', () => {
			renderSuggestedUser();

			const button = screen.getByRole('button', { name: 'Follow alice' });

			expect(button).toHaveTextContent('Follow');
			expect(button).not.toHaveClass('button-secondary');
		});

		it('follows the user when Follow is clicked', async () => {
			const { onFollowClick, onUnfollowClick } = renderSuggestedUser();

			await user.click(screen.getByRole('button', { name: 'Follow alice' }));

			expect(onFollowClick).toHaveBeenCalledWith('user2');
			expect(onUnfollowClick).not.toHaveBeenCalled();
		});

		it('shows a secondary Unfollow button once followed', () => {
			renderSuggestedUser({ isFollowed: true });

			const button = screen.getByRole('button', { name: 'Unfollow alice' });

			expect(button).toHaveTextContent('Unfollow');
			expect(button).toHaveClass('button-secondary');
			expect(screen.queryByRole('button', { name: 'Follow alice' })).not.toBeInTheDocument();
		});

		it('unfollows the user when Unfollow is clicked', async () => {
			const { onFollowClick, onUnfollowClick } = renderSuggestedUser({ isFollowed: true });

			await user.click(screen.getByRole('button', { name: 'Unfollow alice' }));

			expect(onUnfollowClick).toHaveBeenCalledWith('user2');
			expect(onFollowClick).not.toHaveBeenCalled();
		});
	});

	describe('as a text link (sidebar)', () => {
		it('shows a plain Follow text button, not the Button component', () => {
			renderSuggestedUser({ actionStyle: 'link' });

			const button = screen.getByRole('button', { name: 'Follow alice' });

			expect(button).toHaveClass('suggested-user-follow-link');
			expect(button).not.toHaveClass('button-classname');
		});

		it('follows the user when clicked', async () => {
			const { onFollowClick } = renderSuggestedUser({ actionStyle: 'link' });

			await user.click(screen.getByRole('button', { name: 'Follow alice' }));

			expect(onFollowClick).toHaveBeenCalledWith('user2');
		});
	});
});
