import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getSuggestions } from '../../services/suggestionService';
import { followUser, unfollowUser } from '../../services/userService';

import ToastProvider from '../ToastProvider/ToastProvider';

import SuggestionsSidebar from './SuggestionsSidebar';

vi.mock('../../services/suggestionService');
vi.mock('../../services/userService');

const loggedInUser = { _id: 'me', username: 'johndoe', following: [] };

const buildSuggestion = (id, group, overrides = {}) => ({ _id: id, username: `name-${id}`, group, ...overrides });

const suggestions = [
	buildSuggestion('m1', 'mutual', { followedBy: { _id: 'f1', username: 'bob' }, moreMutualCount: 2 }),
	buildSuggestion('m2', 'mutual', { followedBy: { _id: 'f2', username: 'carol' }, moreMutualCount: 0 }),
	buildSuggestion('p1', 'popular'),
	buildSuggestion('p2', 'popular'),
	buildSuggestion('n1', 'new'),
];

const renderSidebar = ({ result = { suggestions, isCarouselDismissed: false } } = {}) => {
	getSuggestions.mockResolvedValue(result);

	return render(
		<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession: vi.fn() }}>
			<ToastProvider>
				<MemoryRouter>
					<SuggestionsSidebar />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);
};

describe('SuggestionsSidebar', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		followUser.mockResolvedValue({ user: loggedInUser });
		unfollowUser.mockResolvedValue({ user: loggedInUser });
	});

	it('requests the sidebar placement', async () => {
		renderSidebar();

		await screen.findByRole('complementary');

		expect(getSuggestions).toHaveBeenCalledWith({ placement: 'sidebar' });
	});

	it('shows the "Suggested for you" heading', async () => {
		renderSidebar();

		expect(await screen.findByRole('heading', { name: 'Suggested for you' })).toBeInTheDocument();
	});

	it('lists every suggestion with its reason line, in order', async () => {
		renderSidebar();

		const sidebar = await screen.findByRole('complementary', { name: 'Suggested for you' });

		expect(
			within(sidebar)
				.getAllByRole('link')
				.map((link) => link.getAttribute('href')),
		).toEqual(['/user/m1', '/user/m2', '/user/p1', '/user/p2', '/user/n1']);
		expect(within(sidebar).getByText('Followed by bob + 2 more')).toBeInTheDocument();
		expect(within(sidebar).getByText('Followed by carol')).toBeInTheDocument();
		expect(within(sidebar).getAllByText(/^Popular on /)).toHaveLength(2);
		expect(within(sidebar).getByText(/^New to /)).toBeInTheDocument();
	});

	it('uses the text-link Follow, not a filled button', async () => {
		renderSidebar();

		const button = await screen.findByRole('button', { name: 'Follow name-p1' });

		expect(button).toHaveClass('suggested-user-follow-link');
		expect(button).not.toHaveClass('button-classname');
	});

	it('is hidden while loading', () => {
		getSuggestions.mockReturnValue(new Promise(() => {}));

		render(
			<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession: vi.fn() }}>
				<ToastProvider>
					<MemoryRouter>
						<SuggestionsSidebar />
					</MemoryRouter>
				</ToastProvider>
			</LoggedInUserContext.Provider>,
		);

		expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'Suggested for you' })).not.toBeInTheDocument();
	});

	it('stays hidden, with no error and no toast, when loading fails', async () => {
		getSuggestions.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

		render(
			<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession: vi.fn() }}>
				<ToastProvider>
					<MemoryRouter>
						<SuggestionsSidebar />
					</MemoryRouter>
				</ToastProvider>
			</LoggedInUserContext.Provider>,
		);

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
		expect(screen.getByRole('alert')).toBeEmptyDOMElement();
	});

	it('is hidden when there are no suggestions', async () => {
		renderSidebar({ result: { suggestions: [], isCarouselDismissed: false } });

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
	});

	const getActionButtons = (sidebar) => within(sidebar).getAllByRole('button');

	describe('following', () => {
		it('keeps the followed user in place and switches their button to Unfollow at once', async () => {
			const user = userEvent.setup();

			followUser.mockReturnValue(new Promise(() => {}));
			renderSidebar();

			const sidebar = await screen.findByRole('complementary', { name: 'Suggested for you' });

			await user.click(screen.getByRole('button', { name: 'Follow name-p1' }));

			expect(screen.getByRole('button', { name: 'Unfollow name-p1' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Follow name-p1' })).not.toBeInTheDocument();
			expect(getActionButtons(sidebar).map((button) => button.getAttribute('aria-label'))).toEqual([
				'Follow name-m1',
				'Follow name-m2',
				'Unfollow name-p1',
				'Follow name-p2',
				'Follow name-n1',
			]);
		});

		it('keeps the same rows in the same order after the follow succeeds', async () => {
			const user = userEvent.setup();

			renderSidebar();

			const sidebar = await screen.findByRole('complementary', { name: 'Suggested for you' });

			await user.click(screen.getByRole('button', { name: 'Follow name-p1' }));

			await screen.findByRole('button', { name: 'Unfollow name-p1' });

			expect(
				within(sidebar)
					.getAllByRole('link')
					.map((link) => link.getAttribute('href')),
			).toEqual(['/user/m1', '/user/m2', '/user/p1', '/user/p2', '/user/n1']);
		});

		it('styles Unfollow as the followed text link', async () => {
			const user = userEvent.setup();

			renderSidebar();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			expect(screen.getByRole('button', { name: 'Unfollow name-p1' })).toHaveClass('suggested-user-follow-link', 'is-followed');
			expect(screen.getByRole('button', { name: 'Follow name-p2' })).not.toHaveClass('is-followed');
		});

		it('turns Unfollow back into Follow when clicked, and sends the unfollow request', async () => {
			const user = userEvent.setup();

			renderSidebar();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
			await user.click(await screen.findByRole('button', { name: 'Unfollow name-p1' }));

			expect(await screen.findByRole('button', { name: 'Follow name-p1' })).not.toHaveClass('is-followed');
			expect(unfollowUser).toHaveBeenCalledTimes(1);
			expect(unfollowUser).toHaveBeenCalledWith({ userId: 'me', userIdToUnfollow: 'p1' });
			expect(screen.getAllByRole('button')).toHaveLength(5);
		});

		it('turns back to Follow and shows the follow toast when the request fails', async () => {
			const user = userEvent.setup();

			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderSidebar();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Follow name-p1' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /^Unfollow / })).not.toBeInTheDocument();
			expect(screen.getAllByRole('button', { name: /^Follow / })).toHaveLength(5);
		});

		it('turns back to Unfollow and shows the unfollow toast when the unfollow fails', async () => {
			const user = userEvent.setup();

			unfollowUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderSidebar();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
			await user.click(await screen.findByRole('button', { name: 'Unfollow name-p1' }));

			expect(await screen.findByText("Couldn't unfollow this user. Try again.")).toBeInTheDocument();
			expect(await screen.findByRole('button', { name: 'Unfollow name-p1' })).toBeInTheDocument();
		});

		it('follows two users at once, each keeping their own button', async () => {
			const user = userEvent.setup();

			followUser.mockReturnValue(new Promise(() => {}));
			renderSidebar();

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
			renderSidebar();

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));
			await user.click(screen.getByRole('button', { name: 'Unfollow name-p1' }));

			expect(followUser).toHaveBeenCalledTimes(1);
			expect(unfollowUser).not.toHaveBeenCalled();
		});

		it('ends the session without a toast when the follow fails with UNAUTHENTICATED', async () => {
			const user = userEvent.setup();
			const endSession = vi.fn();

			followUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			getSuggestions.mockResolvedValue({ suggestions, isCarouselDismissed: false });
			render(
				<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession }}>
					<ToastProvider>
						<MemoryRouter>
							<SuggestionsSidebar />
						</MemoryRouter>
					</ToastProvider>
				</LoggedInUserContext.Provider>,
			);

			await user.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});
	});

	it('has no dismiss button: only the carousel can be dismissed', async () => {
		renderSidebar();

		await screen.findByRole('complementary');

		expect(screen.queryByRole('button', { name: 'Dismiss suggestions' })).not.toBeInTheDocument();
	});
});
