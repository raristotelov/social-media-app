import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getSuggestions } from '../../services/suggestionService';
import { followUser } from '../../services/userService';

import ToastProvider from '../ToastProvider/ToastProvider';

import SuggestionsSidebar from './SuggestionsSidebar';

jest.mock('../../services/suggestionService');
jest.mock('../../services/userService');

const loggedInUser = { _id: 'me', username: 'johndoe', following: [] };

const buildSuggestion = (id, group, overrides = {}) => ({ _id: id, username: `name-${id}`, group, ...overrides });

const suggestions = [
	buildSuggestion('m1', 'mutual', { followedBy: { _id: 'f1', username: 'bob' }, moreMutualCount: 2 }),
	buildSuggestion('m2', 'mutual', { followedBy: { _id: 'f2', username: 'carol' }, moreMutualCount: 0 }),
	buildSuggestion('p1', 'popular'),
	buildSuggestion('p2', 'popular'),
	buildSuggestion('n1', 'new'),
];

const renderSidebar = ({ result = { suggestions, reserve: [], isCarouselDismissed: false } } = {}) => {
	getSuggestions.mockResolvedValue(result);

	return render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
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
		jest.resetAllMocks();
		followUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
	});

	it('requests the sidebar placement', async () => {
		renderSidebar();

		await screen.findByRole('complementary');

		expect(getSuggestions).toHaveBeenCalledWith({ placement: 'sidebar', jwtToken: 'token123' });
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
			<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
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
			<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
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
		renderSidebar({ result: { suggestions: [], reserve: [], isCarouselDismissed: false } });

		await waitFor(() => expect(getSuggestions).toHaveBeenCalled());

		expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
	});

	it('removes a followed user at once and fills the gap from the spares', async () => {
		followUser.mockReturnValue(new Promise(() => {}));
		renderSidebar({ result: { suggestions, reserve: [buildSuggestion('p3', 'popular')], isCarouselDismissed: false } });

		userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

		expect(screen.queryByRole('button', { name: 'Follow name-p1' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Follow name-p3' })).toBeInTheDocument();
		expect(screen.getAllByRole('button', { name: /^Follow / })).toHaveLength(5);
	});

	it('shows the list one shorter when no spare is left', async () => {
		renderSidebar();

		userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

		await waitFor(() => expect(screen.getAllByRole('button', { name: /^Follow / })).toHaveLength(4));
	});

	it('puts the user back and shows the follow toast when the request fails', async () => {
		followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
		renderSidebar();

		userEvent.click(await screen.findByRole('button', { name: 'Follow name-p1' }));

		expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Follow name-p1' })).toBeInTheDocument();
		expect(screen.getAllByRole('button', { name: /^Follow / })).toHaveLength(5);
	});

	it('has no dismiss button: only the carousel can be dismissed', async () => {
		renderSidebar();

		await screen.findByRole('complementary');

		expect(screen.queryByRole('button', { name: 'Dismiss suggestions' })).not.toBeInTheDocument();
	});
});
