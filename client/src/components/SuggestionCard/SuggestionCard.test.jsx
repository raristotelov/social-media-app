import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { APP_NAME } from '../../constants/app';

import SuggestionCard from './SuggestionCard';

const suggestion = {
	_id: 'user2',
	username: 'alice',
	group: 'popular',
	profilePicture: { imageUrl: 'https://example.com/alice.jpg' },
};

const renderCard = (overrides = {}) => {
	const onFollowClick = jest.fn();

	render(
		<MemoryRouter>
			<SuggestionCard suggestion={{ ...suggestion, ...overrides }} onFollowClick={onFollowClick} />
		</MemoryRouter>,
	);

	return { onFollowClick };
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

	it('follows the user when Follow is clicked', () => {
		const { onFollowClick } = renderCard();

		userEvent.click(screen.getByRole('button', { name: 'Follow alice' }));

		expect(onFollowClick).toHaveBeenCalledTimes(1);
		expect(onFollowClick).toHaveBeenCalledWith('user2');
	});

	it('does not follow when the profile link is clicked', () => {
		const { onFollowClick } = renderCard();

		userEvent.click(screen.getByRole('link', { name: 'alice' }));

		expect(onFollowClick).not.toHaveBeenCalled();
	});
});
