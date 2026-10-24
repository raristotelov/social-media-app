import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getSuggestions } from '../../services/suggestionService';
import { followUser, unfollowUser } from '../../services/userService';

import ToastProvider from '../ToastProvider/ToastProvider';

import EmptyFeedSuggestions from './EmptyFeedSuggestions';

jest.mock('../../services/suggestionService');
jest.mock('../../services/userService');

const loggedInUser = { _id: 'me', username: 'johndoe', following: [] };

const buildSuggestion = (id, group) => ({ _id: id, username: `name-${id}`, group });

const suggestions = [
	...['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => buildSuggestion(id, 'popular')),
	...['n1', 'n2', 'n3'].map((id) => buildSuggestion(id, 'new')),
];

const renderList = ({ result = { suggestions, reserve: [], isCarouselDismissed: false }, onFollowChange = jest.fn() } = {}) => {
	getSuggestions.mockResolvedValue(result);

	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
			<ToastProvider>
				<MemoryRouter>
					<EmptyFeedSuggestions onFollowChange={onFollowChange} />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onFollowChange };
};

describe('EmptyFeedSuggestions', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		followUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
		unfollowUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
	});

	it('requests the empty-feed placement', async () => {
		renderList();

		await screen.findByRole('region', { name: 'Suggested for you' });

		expect(getSuggestions).toHaveBeenCalledWith({ placement: 'empty-feed', jwtToken: 'token123' });
	});

	it('lists all 8 suggestions with a primary Follow button each', async () => {
		renderList();

		const list = await screen.findByRole('region', { name: 'Suggested for you' });
		const buttons = within(list).getAllByRole('button');

		expect(buttons).toHaveLength(8);
		buttons.forEach((button) => {
			expect(button).toHaveTextContent('Follow');
			expect(button).not.toHaveClass('button-secondary');
		});
	});

	it('shows each suggestion linked to their profile', async () => {
		renderList();

		const list = await screen.findByRole('region', { name: 'Suggested for you' });

		expect(within(list).getAllByRole('link')[0]).toHaveAttribute('href', '/user/p1');
		expect(within(list).getAllByRole('link')).toHaveLength(8);
	});

	it('shows a reason line for each suggestion', async () => {
		renderList();

		const list = await screen.findByRole('region', { name: 'Suggested for you' });

		expect(within(list).getAllByText(/^Popular on /)).toHaveLength(5);
		expect(within(list).getAllByText(/^New to /)).toHaveLength(3);
	});

	it('is hidden while loading', () => {
		getSuggestions.mockReturnValue(new Promise(() => {}));

		render(
			<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
				<ToastProvider>
					<MemoryRouter>
						<EmptyFeedSuggestions />
					</MemoryRouter>
				</ToastProvider>
			</LoggedInUserContext.Provider>,
		);

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
	});

	it('shows nothing, and no toast, when loading fails', async () => {
		getSuggestions.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

		render(
			<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
				<ToastProvider>
					<MemoryRouter>
						<EmptyFeedSuggestions />
					</MemoryRouter>
				</ToastProvider>
			</LoggedInUserContext.Provider>,
		);

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
		expect(screen.getByRole('alert')).toBeEmptyDOMElement();
	});

	it('shows nothing when there is nobody to suggest', async () => {
		renderList({ result: { suggestions: [], reserve: [], isCarouselDismissed: false } });

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
	});

	describe('following', () => {
		it('turns the button into a secondary Unfollow straight away and keeps the row', async () => {
			followUser.mockReturnValue(new Promise(() => {}));
			renderList();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			const unfollowButton = screen.getByRole('button', { name: 'Unfollow name-p1' });

			expect(unfollowButton).toHaveTextContent('Unfollow');
			expect(unfollowButton).toHaveClass('button-secondary');
			expect(screen.getAllByRole('link')).toHaveLength(8);
		});

		it('sends the follow request', async () => {
			renderList();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			await waitFor(() => expect(followUser).toHaveBeenCalledWith({ userId: 'me', jwtToken: 'token123', userIdToFollow: 'p1' }));
		});

		it('tells the feed to reload its posts once the follow succeeded', async () => {
			const { onFollowChange } = renderList();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			await waitFor(() => expect(onFollowChange).toHaveBeenCalledTimes(1));
		});

		it('does not tell the feed to reload before the follow succeeded', async () => {
			followUser.mockReturnValue(new Promise(() => {}));
			const { onFollowChange } = renderList();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			expect(onFollowChange).not.toHaveBeenCalled();
		});

		it('goes back to a primary Follow and shows the follow toast when the request fails', async () => {
			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { onFollowChange } = renderList();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Follow name-p1' })).not.toHaveClass('button-secondary');
			expect(onFollowChange).not.toHaveBeenCalled();
		});

		it('leaves the other rows alone', async () => {
			renderList();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			await screen.findByRole('button', { name: 'Unfollow name-p1' });

			expect(screen.getByRole('button', { name: 'Follow name-p2' })).toBeInTheDocument();
		});
	});

	describe('unfollowing', () => {
		const followFirst = async () => {
			const rendered = renderList();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
			await screen.findByRole('button', { name: 'Unfollow name-p1' });
			await waitFor(() => expect(rendered.onFollowChange).toHaveBeenCalledTimes(1));

			return rendered;
		};

		it('turns the button back into a primary Follow straight away', async () => {
			await followFirst();
			unfollowUser.mockReturnValue(new Promise(() => {}));

			userEvent.click(screen.getByRole('button', { name: 'Unfollow name-p1' }));

			expect(screen.getByRole('button', { name: 'Follow name-p1' })).not.toHaveClass('button-secondary');
		});

		it('sends the unfollow request', async () => {
			await followFirst();

			userEvent.click(screen.getByRole('button', { name: 'Unfollow name-p1' }));

			await waitFor(() => expect(unfollowUser).toHaveBeenCalledWith({ userId: 'me', jwtToken: 'token123', userIdToUnfollow: 'p1' }));
		});

		it('tells the feed to reload its posts once the unfollow succeeded', async () => {
			const { onFollowChange } = await followFirst();

			userEvent.click(screen.getByRole('button', { name: 'Unfollow name-p1' }));

			await waitFor(() => expect(onFollowChange).toHaveBeenCalledTimes(2));
		});

		it('goes back to Unfollow and shows the unfollow toast when the request fails', async () => {
			unfollowUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { onFollowChange } = await followFirst();

			userEvent.click(screen.getByRole('button', { name: 'Unfollow name-p1' }));

			expect(await screen.findByText("Couldn't unfollow this user. Try again.")).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Unfollow name-p1' })).toHaveClass('button-secondary');
			expect(onFollowChange).toHaveBeenCalledTimes(1);
		});
	});
});
