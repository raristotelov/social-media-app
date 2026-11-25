import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { dismissSuggestionsCarousel, getSuggestions } from '../../services/suggestionService';
import { followUser, unfollowUser } from '../../services/userService';

import ToastProvider from '../ToastProvider/ToastProvider';

import SuggestionsCarousel from './SuggestionsCarousel';

vi.mock('../../services/suggestionService');
vi.mock('../../services/userService');

const loggedInUser = { _id: 'me', username: 'johndoe', following: [] };

const buildSuggestion = (id, group, overrides = {}) => ({ _id: id, username: `name-${id}`, group, ...overrides });

const suggestions = [
	buildSuggestion('m1', 'mutual', { followedBy: { _id: 'f1', username: 'bob' }, moreMutualCount: 1 }),
	buildSuggestion('p1', 'popular'),
	buildSuggestion('p2', 'popular'),
	buildSuggestion('n1', 'new'),
];

const renderCarousel = ({ result = { suggestions, isCarouselDismissed: false }, endSession = vi.fn() } = {}) => {
	getSuggestions.mockResolvedValue(result);

	const rendered = render(
		<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession }}>
			<ToastProvider>
				<MemoryRouter>
					<SuggestionsCarousel />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, endSession };
};

describe('SuggestionsCarousel', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		followUser.mockResolvedValue({ user: loggedInUser });
		unfollowUser.mockResolvedValue({ user: loggedInUser });
		dismissSuggestionsCarousel.mockResolvedValue(undefined);
	});

	it('requests the carousel placement', async () => {
		renderCarousel();

		await screen.findByRole('region', { name: 'Suggested for you' });

		expect(getSuggestions).toHaveBeenCalledWith({ placement: 'carousel' });
	});

	it('shows the "Suggested for you" heading', async () => {
		renderCarousel();

		expect(await screen.findByRole('heading', { name: 'Suggested for you' })).toBeInTheDocument();
	});

	it('shows a card per suggestion, in order, each with its reason line', async () => {
		renderCarousel();

		const carousel = await screen.findByRole('region', { name: 'Suggested for you' });

		expect(within(carousel).getAllByRole('article')).toHaveLength(4);
		expect(
			within(carousel)
				.getAllByRole('link')
				.map((link) => link.getAttribute('href')),
		).toEqual(['/user/m1', '/user/p1', '/user/p2', '/user/n1']);
		expect(within(carousel).getByText('Followed by bob + 1 more')).toBeInTheDocument();
		expect(within(carousel).getAllByText(/^Popular on /)).toHaveLength(2);
		expect(within(carousel).getByText(/^New to /)).toBeInTheDocument();
	});

	it('is hidden while loading', () => {
		getSuggestions.mockReturnValue(new Promise(() => {}));

		render(
			<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession: vi.fn() }}>
				<ToastProvider>
					<MemoryRouter>
						<SuggestionsCarousel />
					</MemoryRouter>
				</ToastProvider>
			</LoggedInUserContext.Provider>,
		);

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
	});

	it('stays hidden, with no error and no toast, when loading fails', async () => {
		getSuggestions.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

		render(
			<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession: vi.fn() }}>
				<ToastProvider>
					<MemoryRouter>
						<SuggestionsCarousel />
					</MemoryRouter>
				</ToastProvider>
			</LoggedInUserContext.Provider>,
		);

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
		expect(screen.getByRole('alert')).toBeEmptyDOMElement();
	});

	it('is hidden when there are no suggestions', async () => {
		renderCarousel({ result: { suggestions: [], isCarouselDismissed: false } });

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
	});

	it('is hidden when the server says it is dismissed', async () => {
		renderCarousel({ result: { suggestions: [], isCarouselDismissed: true } });

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
	});

	it('is hidden when dismissed even if suggestions came with it', async () => {
		renderCarousel({ result: { suggestions, isCarouselDismissed: true } });

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
	});

	describe('dismissing', () => {
		it('has a dismiss button beside the heading', async () => {
			renderCarousel();

			const header = (await screen.findByRole('heading', { name: 'Suggested for you' })).parentElement;

			expect(within(header).getByRole('button', { name: 'Dismiss suggestions' })).toBeInTheDocument();
		});

		it('hides the carousel as soon as the dismiss button is clicked', async () => {
			const user = userEvent.setup();

			dismissSuggestionsCarousel.mockReturnValue(new Promise(() => {}));
			renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Dismiss suggestions' }));

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
		});

		it('tells the server with the token', async () => {
			const user = userEvent.setup();

			renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Dismiss suggestions' }));

			await waitFor(() => expect(dismissSuggestionsCarousel).toHaveBeenCalledWith());
			expect(dismissSuggestionsCarousel).toHaveBeenCalledTimes(1);
		});

		it('stays hidden, with no toast, when the request fails', async () => {
			const user = userEvent.setup();

			dismissSuggestionsCarousel.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Dismiss suggestions' }));

			await waitFor(() => expect(dismissSuggestionsCarousel).toHaveBeenCalled());

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});

		it('ends the session when the request fails with UNAUTHENTICATED', async () => {
			const user = userEvent.setup();

			dismissSuggestionsCarousel.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Dismiss suggestions' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});
	});

	describe('following', () => {
		it('uses primary Follow buttons', async () => {
			renderCarousel();

			const button = await screen.findByRole('button', { name: 'Follow name-p1' });

			expect(button).not.toHaveClass('button-secondary');
		});

		it('keeps the followed card in place and switches it to a secondary Unfollow button at once', async () => {
			const user = userEvent.setup();

			followUser.mockReturnValue(new Promise(() => {}));
			renderCarousel();

			const carousel = await screen.findByRole('region', { name: 'Suggested for you' });

			await user.click(screen.getByRole('button', { name: 'Follow name-p1' }));

			const unfollowButton = screen.getByRole('button', { name: 'Unfollow name-p1' });

			expect(unfollowButton).toHaveTextContent('Unfollow');
			expect(unfollowButton).toHaveClass('button-secondary');
			expect(screen.queryByRole('button', { name: 'Follow name-p1' })).not.toBeInTheDocument();
			expect(within(carousel).getAllByRole('article')).toHaveLength(4);
			expect(
				within(carousel)
					.getAllByRole('link')
					.map((link) => link.getAttribute('href')),
			).toEqual(['/user/m1', '/user/p1', '/user/p2', '/user/n1']);
		});

		it('keeps the other cards as primary Follow buttons', async () => {
			const user = userEvent.setup();

			followUser.mockReturnValue(new Promise(() => {}));
			renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			expect(screen.getByRole('button', { name: 'Follow name-p2' })).not.toHaveClass('button-secondary');
		});

		it('turns Unfollow back into a primary Follow when clicked, and sends the unfollow request', async () => {
			const user = userEvent.setup();

			renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
			await user.click(await screen.findByRole('button', { name: 'Unfollow name-p1' }));

			expect(await screen.findByRole('button', { name: 'Follow name-p1' })).not.toHaveClass('button-secondary');
			expect(unfollowUser).toHaveBeenCalledTimes(1);
			expect(unfollowUser).toHaveBeenCalledWith({ userId: 'me', userIdToUnfollow: 'p1' });
			expect(screen.getAllByRole('article')).toHaveLength(4);
		});

		it('turns back to Follow and shows the follow toast when the request fails', async () => {
			const user = userEvent.setup();

			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Follow name-p1' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /^Unfollow / })).not.toBeInTheDocument();
			expect(screen.getAllByRole('article')).toHaveLength(4);
		});

		it('turns back to Unfollow and shows the unfollow toast when the unfollow fails', async () => {
			const user = userEvent.setup();

			unfollowUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
			await user.click(await screen.findByRole('button', { name: 'Unfollow name-p1' }));

			expect(await screen.findByText("Couldn't unfollow this user. Try again.")).toBeInTheDocument();
			expect(await screen.findByRole('button', { name: 'Unfollow name-p1' })).toBeInTheDocument();
		});

		it('follows two users at once, each keeping their own button', async () => {
			const user = userEvent.setup();

			followUser.mockReturnValue(new Promise(() => {}));
			renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
			await user.click(screen.getByRole('button', { name: 'Follow name-n1' }));

			expect(screen.getByRole('button', { name: 'Unfollow name-p1' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Unfollow name-n1' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Follow name-m1' })).toBeInTheDocument();
			expect(followUser).toHaveBeenCalledTimes(2);
		});

		it('sends one request when the button is clicked again before the follow returns', async () => {
			const user = userEvent.setup();

			followUser.mockReturnValue(new Promise(() => {}));
			renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
			await user.click(screen.getByRole('button', { name: 'Unfollow name-p1' }));

			expect(followUser).toHaveBeenCalledTimes(1);
			expect(unfollowUser).not.toHaveBeenCalled();
		});

		it('ends the session without a toast when the follow fails with UNAUTHENTICATED', async () => {
			const user = userEvent.setup();

			followUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderCarousel();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});
	});
});
