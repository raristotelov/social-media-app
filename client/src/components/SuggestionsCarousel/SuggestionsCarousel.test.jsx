import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { dismissSuggestionsCarousel, getSuggestions } from '../../services/suggestionService';
import { followUser } from '../../services/userService';

import ToastProvider from '../ToastProvider/ToastProvider';

import SuggestionsCarousel from './SuggestionsCarousel';

jest.mock('../../services/suggestionService');
jest.mock('../../services/userService');

const loggedInUser = { _id: 'me', username: 'johndoe', following: [] };

const buildSuggestion = (id, group, overrides = {}) => ({ _id: id, username: `name-${id}`, group, ...overrides });

const suggestions = [
	buildSuggestion('m1', 'mutual', { followedBy: { _id: 'f1', username: 'bob' }, moreMutualCount: 1 }),
	buildSuggestion('p1', 'popular'),
	buildSuggestion('p2', 'popular'),
	buildSuggestion('n1', 'new'),
];

const renderCarousel = ({ result = { suggestions, reserve: [], isCarouselDismissed: false }, endSession = jest.fn() } = {}) => {
	getSuggestions.mockResolvedValue(result);

	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession }}>
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
		jest.resetAllMocks();
		followUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
		dismissSuggestionsCarousel.mockResolvedValue(undefined);
	});

	it('requests the carousel placement', async () => {
		renderCarousel();

		await screen.findByRole('region', { name: 'Suggested for you' });

		expect(getSuggestions).toHaveBeenCalledWith({ placement: 'carousel', jwtToken: 'token123' });
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
			<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
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
			<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
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
		renderCarousel({ result: { suggestions: [], reserve: [], isCarouselDismissed: false } });

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
	});

	it('is hidden when the server says it is dismissed', async () => {
		renderCarousel({ result: { suggestions: [], reserve: [], isCarouselDismissed: true } });

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
	});

	it('is hidden when dismissed even if suggestions came with it', async () => {
		renderCarousel({ result: { suggestions, reserve: [], isCarouselDismissed: true } });

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
			dismissSuggestionsCarousel.mockReturnValue(new Promise(() => {}));
			renderCarousel();

			userEvent.click(await screen.findByRole('button', { name: 'Dismiss suggestions' }));

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
		});

		it('tells the server with the token', async () => {
			renderCarousel();

			userEvent.click(await screen.findByRole('button', { name: 'Dismiss suggestions' }));

			await waitFor(() => expect(dismissSuggestionsCarousel).toHaveBeenCalledWith({ jwtToken: 'token123' }));
			expect(dismissSuggestionsCarousel).toHaveBeenCalledTimes(1);
		});

		it('stays hidden, with no toast, when the request fails', async () => {
			dismissSuggestionsCarousel.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderCarousel();

			userEvent.click(await screen.findByRole('button', { name: 'Dismiss suggestions' }));

			await waitFor(() => expect(dismissSuggestionsCarousel).toHaveBeenCalled());

			expect(screen.queryByRole('region', { name: 'Suggested for you' })).not.toBeInTheDocument();
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});

		it('ends the session when the request fails with UNAUTHENTICATED', async () => {
			dismissSuggestionsCarousel.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderCarousel();

			userEvent.click(await screen.findByRole('button', { name: 'Dismiss suggestions' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});
	});

	describe('following', () => {
		it('uses primary Follow buttons', async () => {
			renderCarousel();

			const button = await screen.findByRole('button', { name: 'Follow name-p1' });

			expect(button).not.toHaveClass('button-secondary');
		});

		it('removes the followed card at once and fills the gap from the spares', async () => {
			followUser.mockReturnValue(new Promise(() => {}));
			renderCarousel({ result: { suggestions, reserve: [buildSuggestion('p3', 'popular')], isCarouselDismissed: false } });

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			expect(screen.queryByRole('button', { name: 'Follow name-p1' })).not.toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Follow name-p3' })).toBeInTheDocument();
			expect(screen.getAllByRole('article')).toHaveLength(4);
		});

		it('shows one card fewer when no spare is left', async () => {
			renderCarousel();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
		});

		it('puts the card back and shows the follow toast when the request fails', async () => {
			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderCarousel();

			userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

			expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Follow name-p1' })).toBeInTheDocument();
			expect(screen.getAllByRole('article')).toHaveLength(4);
		});
	});
});
