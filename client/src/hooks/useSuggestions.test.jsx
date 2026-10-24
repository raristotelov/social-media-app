import '@testing-library/jest-dom';
import { act, renderHook, screen, waitFor } from '@testing-library/react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { dismissSuggestionsCarousel, getSuggestions } from '../services/suggestionService';
import { followUser, unfollowUser } from '../services/userService';

import ToastProvider from '../components/ToastProvider/ToastProvider';

import useSuggestions from './useSuggestions';

jest.mock('../services/suggestionService');
jest.mock('../services/userService');

const loggedInUser = { _id: 'me', username: 'johndoe', following: [] };

const buildSuggestion = (id, group) => ({ _id: id, username: `name-${id}`, group });

const SIDEBAR_SUGGESTIONS = [
	buildSuggestion('m1', 'mutual'),
	buildSuggestion('m2', 'mutual'),
	buildSuggestion('p1', 'popular'),
	buildSuggestion('p2', 'popular'),
	buildSuggestion('n1', 'new'),
];

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const buildResult = ({ suggestions = SIDEBAR_SUGGESTIONS, reserve = [], isCarouselDismissed = false } = {}) => ({
	suggestions,
	reserve,
	isCarouselDismissed,
});

const getIds = (result) => result.current.suggestions.map((suggestion) => suggestion._id);

const renderSuggestions = async ({ placement = 'sidebar', options, serverResult = buildResult(), waitForLoad = true } = {}) => {
	const updateLoggedInUser = jest.fn();
	const endSession = jest.fn();

	getSuggestions.mockResolvedValue(serverResult);

	const wrapper = ({ children }) => (
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser, endSession }}>
			<ToastProvider>{children}</ToastProvider>
		</LoggedInUserContext.Provider>
	);
	const rendered = renderHook(() => useSuggestions(placement, options), { wrapper });

	if (waitForLoad) {
		await waitFor(() => expect(rendered.result.current.isLoaded).toBe(true));
	}

	return { ...rendered, updateLoggedInUser, endSession };
};

describe('useSuggestions', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		followUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
		unfollowUser.mockResolvedValue({ user: loggedInUser, jwt: 'new.jwt' });
		dismissSuggestionsCarousel.mockResolvedValue(undefined);
	});

	describe('loading', () => {
		it('starts empty and not loaded', async () => {
			const { result } = await renderSuggestions({ serverResult: new Promise(() => {}), waitForLoad: false });

			expect(result.current.suggestions).toEqual([]);
			expect(result.current.isLoaded).toBe(false);
			expect(result.current.isCarouselDismissed).toBe(false);
			expect(result.current.followedIds).toEqual([]);
		});

		it('requests the placement with the token', async () => {
			await renderSuggestions({ placement: 'carousel' });

			expect(getSuggestions).toHaveBeenCalledTimes(1);
			expect(getSuggestions).toHaveBeenCalledWith({ placement: 'carousel', jwtToken: 'token123' });
		});

		it('exposes the suggestions once loaded', async () => {
			const { result } = await renderSuggestions();

			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
		});

		it('exposes the dismissal flag the server sent', async () => {
			const { result } = await renderSuggestions({
				placement: 'carousel',
				serverResult: buildResult({ suggestions: [], isCarouselDismissed: true }),
			});

			expect(result.current.isCarouselDismissed).toBe(true);
		});

		it('stays not loaded, shows no toast and does not end the session when loading fails', async () => {
			getSuggestions.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const updateLoggedInUser = jest.fn();
			const endSession = jest.fn();
			const wrapper = ({ children }) => (
				<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser, endSession }}>
					<ToastProvider>{children}</ToastProvider>
				</LoggedInUserContext.Provider>
			);
			const { result } = renderHook(() => useSuggestions('sidebar'), { wrapper });

			await waitFor(() => expect(getSuggestions).toHaveBeenCalled());
			await act(async () => {});

			expect(result.current.isLoaded).toBe(false);
			expect(result.current.suggestions).toEqual([]);
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
			expect(endSession).not.toHaveBeenCalled();
		});

		it('ends the session when loading fails with UNAUTHENTICATED', async () => {
			getSuggestions.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const endSession = jest.fn();
			const wrapper = ({ children }) => (
				<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession }}>
					<ToastProvider>{children}</ToastProvider>
				</LoggedInUserContext.Provider>
			);

			renderHook(() => useSuggestions('sidebar'), { wrapper });

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});

		it('ignores a response that arrives after unmounting', async () => {
			const request = buildDeferred();

			getSuggestions.mockReturnValue(request.promise);
			const wrapper = ({ children }) => (
				<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
					<ToastProvider>{children}</ToastProvider>
				</LoggedInUserContext.Provider>
			);
			const { result, unmount } = renderHook(() => useSuggestions('sidebar'), { wrapper });

			unmount();
			await act(async () => request.resolve(buildResult()));

			expect(result.current.isLoaded).toBe(false);
		});
	});

	describe('following from the sidebar or carousel', () => {
		it('removes the user from the list straight away, before the request returns', async () => {
			const { result } = await renderSuggestions();

			followUser.mockReturnValue(new Promise(() => {}));

			act(() => {
				result.current.followSuggestion('p1');
			});

			expect(getIds(result)).toEqual(['m1', 'm2', 'p2', 'n1']);
		});

		it('sends the follow request for that user', async () => {
			const { result } = await renderSuggestions();

			await act(() => result.current.followSuggestion('p1'));

			expect(followUser).toHaveBeenCalledWith({ userId: 'me', jwtToken: 'token123', userIdToFollow: 'p1' });
		});

		it('fills the gap with the first spare suggestion, keeping the list size', async () => {
			const { result } = await renderSuggestions({ serverResult: buildResult({ reserve: [buildSuggestion('p3', 'popular')] }) });

			await act(() => result.current.followSuggestion('m1'));

			expect(result.current.suggestions).toHaveLength(5);
			expect(getIds(result)).toContain('p3');
		});

		it('places the replacement in group order: a mutual replacement goes after the mutuals', async () => {
			const { result } = await renderSuggestions({ serverResult: buildResult({ reserve: [buildSuggestion('m3', 'mutual')] }) });

			await act(() => result.current.followSuggestion('p1'));

			expect(getIds(result)).toEqual(['m1', 'm2', 'm3', 'p2', 'n1']);
		});

		it('places a most-followed replacement after the other most-followed and before the new', async () => {
			const { result } = await renderSuggestions({ serverResult: buildResult({ reserve: [buildSuggestion('p3', 'popular')] }) });

			await act(() => result.current.followSuggestion('m1'));

			expect(getIds(result)).toEqual(['m2', 'p1', 'p2', 'p3', 'n1']);
		});

		it('keeps new users last: a new replacement goes at the end', async () => {
			const { result } = await renderSuggestions({ serverResult: buildResult({ reserve: [buildSuggestion('n2', 'new')] }) });

			await act(() => result.current.followSuggestion('m1'));

			expect(getIds(result)).toEqual(['m2', 'p1', 'p2', 'n1', 'n2']);
		});

		it('keeps new users last when a new user is followed and a most-followed one replaces them', async () => {
			const { result } = await renderSuggestions({ serverResult: buildResult({ reserve: [buildSuggestion('p3', 'popular')] }) });

			await act(() => result.current.followSuggestion('n1'));

			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'p3']);
		});

		it('takes spares in the order the server sent them', async () => {
			const reserve = [buildSuggestion('p3', 'popular'), buildSuggestion('p4', 'popular')];
			const { result } = await renderSuggestions({ serverResult: buildResult({ reserve }) });

			await act(() => result.current.followSuggestion('m1'));
			await act(() => result.current.followSuggestion('m2'));

			expect(getIds(result)).toEqual(['p1', 'p2', 'p3', 'p4', 'n1']);
		});

		it('shrinks the list once the spares run out', async () => {
			const { result } = await renderSuggestions({ serverResult: buildResult({ reserve: [buildSuggestion('p3', 'popular')] }) });

			await act(() => result.current.followSuggestion('m1'));
			await act(() => result.current.followSuggestion('m2'));

			expect(getIds(result)).toEqual(['p1', 'p2', 'p3', 'n1']);
		});

		it('keeps the user out of the list once the follow succeeded', async () => {
			const { result } = await renderSuggestions();

			await act(() => result.current.followSuggestion('p1'));

			expect(getIds(result)).not.toContain('p1');
		});

		it('puts the user back in their place and shows the follow toast when the request fails', async () => {
			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { result } = await renderSuggestions();

			await act(() => result.current.followSuggestion('p1'));

			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
			expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
		});

		it('sends the spare back to the reserve when the follow fails, so nobody is shown twice', async () => {
			followUser.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 });
			const { result } = await renderSuggestions({ serverResult: buildResult({ reserve: [buildSuggestion('m3', 'mutual')] }) });

			await act(() => result.current.followSuggestion('p1'));

			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);

			await act(() => result.current.followSuggestion('p2'));

			expect(getIds(result)).toEqual(['m1', 'm2', 'm3', 'p1', 'n1']);
		});

		it('restores the user to the same index', async () => {
			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { result } = await renderSuggestions();

			await act(() => result.current.followSuggestion('m2'));

			expect(getIds(result).indexOf('m2')).toBe(1);
		});

		it('ends the session without a toast when the request fails with UNAUTHENTICATED', async () => {
			followUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { result, endSession } = await renderSuggestions();

			await act(() => result.current.followSuggestion('p1'));

			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
			expect(endSession).toHaveBeenCalledTimes(1);
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});

		it('sends one request when the same user is followed twice before the first returns', async () => {
			const request = buildDeferred();

			followUser.mockReturnValue(request.promise);
			const { result } = await renderSuggestions();

			act(() => {
				result.current.followSuggestion('p1');
				result.current.followSuggestion('p1');
			});

			expect(followUser).toHaveBeenCalledTimes(1);

			await act(async () => request.resolve({ user: loggedInUser, jwt: 'j' }));
		});

		it('can follow two different users at once', async () => {
			followUser.mockReturnValue(new Promise(() => {}));
			const { result } = await renderSuggestions();

			act(() => {
				result.current.followSuggestion('p1');
				result.current.followSuggestion('n1');
			});

			expect(followUser).toHaveBeenCalledTimes(2);
			expect(getIds(result)).toEqual(['m1', 'm2', 'p2']);
		});

		it('ignores following a user who is not listed', async () => {
			const { result } = await renderSuggestions({ serverResult: buildResult({ reserve: [buildSuggestion('p3', 'popular')] }) });

			await act(() => result.current.followSuggestion('stranger'));

			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
		});
	});

	describe('following from the empty feed', () => {
		const EMPTY_FEED_SUGGESTIONS = [buildSuggestion('p1', 'popular'), buildSuggestion('p2', 'popular'), buildSuggestion('n1', 'new')];

		const renderEmptyFeed = (options) =>
			renderSuggestions({ placement: 'empty-feed', serverResult: buildResult({ suggestions: EMPTY_FEED_SUGGESTIONS }), options });

		it('keeps the user in the list and marks them as followed straight away', async () => {
			const { result } = await renderEmptyFeed();

			followUser.mockReturnValue(new Promise(() => {}));

			act(() => {
				result.current.followSuggestion('p1');
			});

			expect(getIds(result)).toEqual(['p1', 'p2', 'n1']);
			expect(result.current.followedIds).toEqual(['p1']);
		});

		it('keeps them marked as followed once the request succeeds', async () => {
			const { result } = await renderEmptyFeed();

			await act(() => result.current.followSuggestion('p1'));

			expect(result.current.followedIds).toEqual(['p1']);
			expect(getIds(result)).toEqual(['p1', 'p2', 'n1']);
		});

		it('tells the caller about a successful follow', async () => {
			const onFollowChange = jest.fn();
			const { result } = await renderEmptyFeed({ onFollowChange });

			await act(() => result.current.followSuggestion('p1'));

			expect(onFollowChange).toHaveBeenCalledTimes(1);
		});

		it('marks the user as not followed again and shows the follow toast when the request fails', async () => {
			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const onFollowChange = jest.fn();
			const { result } = await renderEmptyFeed({ onFollowChange });

			await act(() => result.current.followSuggestion('p1'));

			expect(result.current.followedIds).toEqual([]);
			expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
			expect(onFollowChange).not.toHaveBeenCalled();
		});

		it('unfollows: marks the user as not followed straight away and sends the request', async () => {
			const { result } = await renderEmptyFeed();

			await act(() => result.current.followSuggestion('p1'));

			unfollowUser.mockReturnValue(new Promise(() => {}));

			act(() => {
				result.current.unfollowSuggestion('p1');
			});

			expect(result.current.followedIds).toEqual([]);
			expect(unfollowUser).toHaveBeenCalledWith({ userId: 'me', jwtToken: 'token123', userIdToUnfollow: 'p1' });
			expect(getIds(result)).toEqual(['p1', 'p2', 'n1']);
		});

		it('tells the caller about a successful unfollow', async () => {
			const onFollowChange = jest.fn();
			const { result } = await renderEmptyFeed({ onFollowChange });

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.unfollowSuggestion('p1'));

			expect(onFollowChange).toHaveBeenCalledTimes(2);
		});

		it('marks the user as followed again and shows the unfollow toast when the unfollow fails', async () => {
			unfollowUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const onFollowChange = jest.fn();
			const { result } = await renderEmptyFeed({ onFollowChange });

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.unfollowSuggestion('p1'));

			expect(result.current.followedIds).toEqual(['p1']);
			expect(await screen.findByText("Couldn't unfollow this user. Try again.")).toBeInTheDocument();
			expect(onFollowChange).toHaveBeenCalledTimes(1);
		});

		it('ends the session without a toast when the unfollow fails with UNAUTHENTICATED', async () => {
			unfollowUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { result, endSession } = await renderEmptyFeed();

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.unfollowSuggestion('p1'));

			expect(endSession).toHaveBeenCalledTimes(1);
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});

		it('follows several users independently', async () => {
			const { result } = await renderEmptyFeed();

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.followSuggestion('n1'));
			await act(() => result.current.unfollowSuggestion('p1'));

			expect(result.current.followedIds).toEqual(['n1']);
		});

		it('never replaces anyone, since the empty feed has no spares', async () => {
			const { result } = await renderEmptyFeed();

			await act(() => result.current.followSuggestion('p1'));

			expect(result.current.suggestions).toHaveLength(3);
		});
	});

	describe('dismissing the carousel', () => {
		it('marks the carousel dismissed straight away', async () => {
			dismissSuggestionsCarousel.mockReturnValue(new Promise(() => {}));
			const { result } = await renderSuggestions({ placement: 'carousel' });

			act(() => {
				result.current.dismissCarousel();
			});

			expect(result.current.isCarouselDismissed).toBe(true);
		});

		it('tells the server with the token', async () => {
			const { result } = await renderSuggestions({ placement: 'carousel' });

			await act(() => result.current.dismissCarousel());

			expect(dismissSuggestionsCarousel).toHaveBeenCalledWith({ jwtToken: 'token123' });
		});

		it('stays dismissed, with no toast, when the request fails', async () => {
			dismissSuggestionsCarousel.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { result, endSession } = await renderSuggestions({ placement: 'carousel' });

			await act(() => result.current.dismissCarousel());

			expect(result.current.isCarouselDismissed).toBe(true);
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
			expect(endSession).not.toHaveBeenCalled();
		});

		it('ends the session when the request fails with UNAUTHENTICATED', async () => {
			dismissSuggestionsCarousel.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { result, endSession } = await renderSuggestions({ placement: 'carousel' });

			await act(() => result.current.dismissCarousel());

			expect(endSession).toHaveBeenCalledTimes(1);
		});
	});

	describe('changing placement', () => {
		it('loads again for the new placement and drops the previous list', async () => {
			getSuggestions.mockResolvedValue(buildResult());
			const wrapper = ({ children }) => (
				<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
					<ToastProvider>{children}</ToastProvider>
				</LoggedInUserContext.Provider>
			);
			const { result, rerender } = renderHook(({ placement }) => useSuggestions(placement), {
				wrapper,
				initialProps: { placement: 'sidebar' },
			});

			await waitFor(() => expect(result.current.isLoaded).toBe(true));

			getSuggestions.mockResolvedValue(buildResult({ suggestions: [buildSuggestion('x1', 'popular')] }));
			rerender({ placement: 'carousel' });

			await waitFor(() => expect(getIds(result)).toEqual(['x1']));
			expect(getSuggestions).toHaveBeenLastCalledWith({ placement: 'carousel', jwtToken: 'token123' });
		});
	});
});
