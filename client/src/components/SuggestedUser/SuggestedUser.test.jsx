import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { APP_NAME } from '../../constants/app';

import SuggestedUser from './SuggestedUser';

const popularSuggestion = {
	_id: 'user2',
	username: 'alice',
	group: 'popular',
	profilePicture: { imageUrl: 'https://example.com/alice.jpg' },
};

const renderSuggestedUser = ({ suggestion = popularSuggestion, actionStyle = 'button', isFollowed = false } = {}) => {
	const onFollowClick = jest.fn();
	const onUnfollowClick = jest.fn();

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

		it('does not follow when the link is clicked', () => {
			const { onFollowClick } = renderSuggestedUser();

			userEvent.click(screen.getByRole('link'));

			expect(onFollowClick).not.toHaveBeenCalled();
		});
	});

	describe('as a button (empty feed)', () => {
		it('shows a primary Follow button', () => {
			renderSuggestedUser();

			const button = screen.getByRole('button', { name: 'Follow alice' });

			expect(button).toHaveTextContent('Follow');
			expect(button).not.toHaveClass('button-secondary');
		});

		it('follows the user when Follow is clicked', () => {
			const { onFollowClick, onUnfollowClick } = renderSuggestedUser();

			userEvent.click(screen.getByRole('button', { name: 'Follow alice' }));

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

		it('unfollows the user when Unfollow is clicked', () => {
			const { onFollowClick, onUnfollowClick } = renderSuggestedUser({ isFollowed: true });

			userEvent.click(screen.getByRole('button', { name: 'Unfollow alice' }));

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

		it('follows the user when clicked', () => {
			const { onFollowClick } = renderSuggestedUser({ actionStyle: 'link' });

			userEvent.click(screen.getByRole('button', { name: 'Follow alice' }));

			expect(onFollowClick).toHaveBeenCalledWith('user2');
		});
	});
});
