import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import SearchResults from './SearchResults';

const buildUser = (overrides = {}) => ({
	_id: 'user1',
	username: 'janedoe',
	followersCount: 0,
	...overrides,
});

const renderSearchResults = (props = {}) =>
	render(
		<MemoryRouter>
			<SearchResults results={[buildUser()]} isLoading={false} onResultClick={jest.fn()} {...props} />
		</MemoryRouter>,
	);

describe('SearchResults', () => {
	describe('avatar', () => {
		it("shows the user's profile picture", () => {
			const { container } = renderSearchResults({
				results: [buildUser({ profilePicture: { imageUrl: 'https://example.com/jane.jpg' } })],
			});

			const avatar = container.querySelector('img.search-result-avatar');

			expect(avatar).toHaveAttribute('src', 'https://example.com/jane.jpg');
		});

		it('falls back to the placeholder avatar when the user has no profile picture', () => {
			const { container } = renderSearchResults({ results: [buildUser({ profilePicture: undefined })] });

			expect(container.querySelector('img')).not.toBeInTheDocument();
			expect(container.querySelector('svg.search-result-avatar')).toBeInTheDocument();
		});

		it('falls back to the placeholder avatar when the profile picture has no image url', () => {
			const { container } = renderSearchResults({ results: [buildUser({ profilePicture: null })] });

			expect(container.querySelector('img')).not.toBeInTheDocument();
			expect(container.querySelector('svg.search-result-avatar')).toBeInTheDocument();
		});

		it('shows one avatar per row, each with its own picture or placeholder', () => {
			const { container } = renderSearchResults({
				results: [
					buildUser({ _id: 'user1', profilePicture: { imageUrl: 'https://example.com/one.jpg' } }),
					buildUser({ _id: 'user2', username: 'johndoe' }),
				],
			});

			expect(container.querySelectorAll('.search-result-avatar')).toHaveLength(2);
			expect(container.querySelectorAll('img.search-result-avatar')).toHaveLength(1);
			expect(container.querySelectorAll('svg.search-result-avatar')).toHaveLength(1);
		});
	});

	describe('rows', () => {
		it('shows the username and links the row to that profile', () => {
			renderSearchResults({ results: [buildUser({ _id: 'user7', username: 'janedoe' })] });

			expect(screen.getByRole('link', { name: /janedoe/ })).toHaveAttribute('href', '/user/user7');
		});

		it.each([
			[0, '0 followers'],
			[1, '1 follower'],
			[2, '2 followers'],
		])('labels %i followers as "%s"', (count, expected) => {
			renderSearchResults({ results: [buildUser({ followersCount: count })] });

			expect(screen.getByText(expected)).toBeInTheDocument();
		});

		it('shows 0 followers when the row has no follower count', () => {
			renderSearchResults({ results: [buildUser({ followersCount: undefined })] });

			expect(screen.getByText('0 followers')).toBeInTheDocument();
		});

		it('shows the follower count by default, as search results do', () => {
			const { container } = renderSearchResults({ results: [buildUser({ followersCount: 4 })] });

			expect(container.querySelector('.search-result-followers')).toHaveTextContent('4 followers');
		});

		it('leaves the follower count out when showFollowersCount is false', () => {
			const { container } = renderSearchResults({ results: [buildUser({ followersCount: 4 })], showFollowersCount: false });

			expect(container.querySelector('.search-result-followers')).not.toBeInTheDocument();
			expect(screen.queryByText('4 followers')).not.toBeInTheDocument();
		});

		it('still shows the username and photo when the follower count is left out', () => {
			const { container } = renderSearchResults({
				results: [buildUser({ profilePicture: { imageUrl: 'https://example.com/jane.jpg' } })],
				showFollowersCount: false,
			});

			expect(screen.getByText('janedoe')).toBeInTheDocument();
			expect(container.querySelector('img.search-result-avatar')).toHaveAttribute('src', 'https://example.com/jane.jpg');
		});

		it('calls onResultClick when a row is clicked', () => {
			const onResultClick = jest.fn();

			renderSearchResults({ onResultClick });

			userEvent.click(screen.getByRole('link', { name: /janedoe/ }));

			expect(onResultClick).toHaveBeenCalledTimes(1);
		});

		it('adds the given class name to the list', () => {
			const { container } = renderSearchResults({ className: 'follow-list-results' });

			expect(container.querySelector('.search-results.follow-list-results')).toBeInTheDocument();
		});
	});

	describe('states', () => {
		it('shows a spinner and no rows while loading', () => {
			const { container } = renderSearchResults({ isLoading: true });

			expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
			expect(screen.queryByRole('link')).not.toBeInTheDocument();
		});

		it('shows "No users found" when there are no results', () => {
			renderSearchResults({ results: [] });

			expect(screen.getByText('No users found')).toBeInTheDocument();
		});
	});
});
