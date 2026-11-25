import { act, renderHook, screen, waitFor } from '@testing-library/react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { dismissSuggestionsCarousel, getSuggestions } from '../services/suggestionService';
import { followUser, unfollowUser } from '../services/userService';

import ToastProvider from '../components/ToastProvider/ToastProvider';

import useSuggestions from './useSuggestions';

vi.mock('../services/suggestionService');
vi.mock('../services/userService');

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

const buildResult = ({ suggestions = SIDEBAR_SUGGESTIONS, isCarouselDismissed = false } = {}) => ({
	suggestions,
	isCarouselDismissed,
});

const getIds = (result) => result.current.suggestions.map((suggestion) => suggestion._id);

const renderSuggestions = async ({ placement = 'sidebar', options, serverResult = buildResult(), waitForLoad = true } = {}) => {
	const updateLoggedInUser = vi.fn();
	const endSession = vi.fn();

	getSuggestions.mockResolvedValue(serverResult);

	const wrapper = ({ children }) => (
		<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser, endSession }}>
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
		vi.resetAllMocks();
		followUser.mockResolvedValue({ user: loggedInUser });
		unfollowUser.mockResolvedValue({ user: loggedInUser });
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

		it('requests the placement, without passing a token', async () => {
			await renderSuggestions({ placement: 'carousel' });

			expect(getSuggestions).toHaveBeenCalledTimes(1);
			expect(getSuggestions).toHaveBeenCalledWith({ placement: 'carousel' });
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
			const updateLoggedInUser = vi.fn();
			const endSession = vi.fn();
			const wrapper = ({ children }) => (
				<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser, endSession }}>
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
			const endSession = vi.fn();
			const wrapper = ({ children }) => (
				<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession }}>
					<ToastProvider>{children}</ToastProvider>
				</LoggedInUserContext.Provider>
			);

			renderHook(() => useSuggestions('sidebar'), { wrapper });

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});
	});

	describe.each([['sidebar'], ['carousel'], ['empty-feed']])('following and unfollowing in the %s placement', (placement) => {
		const renderPlacement = (options) => renderSuggestions({ placement, options });

		it('keeps the user in place and marks them followed straight away, before the request returns', async () => {
			const { result } = await renderPlacement();

			followUser.mockReturnValue(new Promise(() => {}));

			act(() => {
				result.current.followSuggestion('p1');
			});

			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
			expect(result.current.followedIds).toEqual(['p1']);
		});

		it('sends the follow request for that user', async () => {
			const { result } = await renderPlacement();

			await act(() => result.current.followSuggestion('p1'));

			expect(followUser).toHaveBeenCalledTimes(1);
			expect(followUser).toHaveBeenCalledWith({ userId: 'me', userIdToFollow: 'p1' });
		});

		it('keeps the user in place, followed and with the list size unchanged once the follow succeeded', async () => {
			const { result } = await renderPlacement();

			await act(() => result.current.followSuggestion('p1'));

			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
			expect(result.current.followedIds).toEqual(['p1']);
		});

		it('tells the caller about a successful follow', async () => {
			const onFollowChange = vi.fn();
			const { result } = await renderPlacement({ onFollowChange });

			await act(() => result.current.followSuggestion('p1'));

			expect(onFollowChange).toHaveBeenCalledTimes(1);
		});

		it('unfollows: marks the user as not followed straight away, keeps them in place and sends the request', async () => {
			const { result } = await renderPlacement();

			await act(() => result.current.followSuggestion('p1'));

			unfollowUser.mockReturnValue(new Promise(() => {}));

			act(() => {
				result.current.unfollowSuggestion('p1');
			});

			expect(result.current.followedIds).toEqual([]);
			expect(unfollowUser).toHaveBeenCalledWith({ userId: 'me', userIdToUnfollow: 'p1' });
			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
		});

		it('keeps the user in place and not followed once the unfollow succeeded', async () => {
			const { result } = await renderPlacement();

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.unfollowSuggestion('p1'));

			expect(result.current.followedIds).toEqual([]);
			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
		});

		it('can follow again after unfollowing', async () => {
			const { result } = await renderPlacement();

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.unfollowSuggestion('p1'));
			await act(() => result.current.followSuggestion('p1'));

			expect(followUser).toHaveBeenCalledTimes(2);
			expect(result.current.followedIds).toEqual(['p1']);
		});

		it('tells the caller about a successful unfollow', async () => {
			const onFollowChange = vi.fn();
			const { result } = await renderPlacement({ onFollowChange });

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.unfollowSuggestion('p1'));

			expect(onFollowChange).toHaveBeenCalledTimes(2);
		});

		it('marks the user as not followed again, keeps their place and shows the follow toast when the follow fails', async () => {
			followUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const onFollowChange = vi.fn();
			const { result } = await renderPlacement({ onFollowChange });

			await act(() => result.current.followSuggestion('p1'));

			expect(result.current.followedIds).toEqual([]);
			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
			expect(await screen.findByText("Couldn't follow this user. Try again.")).toBeInTheDocument();
			expect(onFollowChange).not.toHaveBeenCalled();
		});

		it('marks the user as followed again, keeps their place and shows the unfollow toast when the unfollow fails', async () => {
			unfollowUser.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const onFollowChange = vi.fn();
			const { result } = await renderPlacement({ onFollowChange });

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.unfollowSuggestion('p1'));

			expect(result.current.followedIds).toEqual(['p1']);
			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
			expect(await screen.findByText("Couldn't unfollow this user. Try again.")).toBeInTheDocument();
			expect(onFollowChange).toHaveBeenCalledTimes(1);
		});

		it('ends the session without a toast when the follow fails with UNAUTHENTICATED', async () => {
			followUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { result, endSession } = await renderPlacement();

			await act(() => result.current.followSuggestion('p1'));

			expect(result.current.followedIds).toEqual([]);
			expect(endSession).toHaveBeenCalledTimes(1);
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});

		it('ends the session without a toast when the unfollow fails with UNAUTHENTICATED', async () => {
			unfollowUser.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { result, endSession } = await renderPlacement();

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.unfollowSuggestion('p1'));

			expect(endSession).toHaveBeenCalledTimes(1);
			expect(screen.getByRole('alert')).toBeEmptyDOMElement();
		});

		it('sends one request when the same user is followed twice before the first returns', async () => {
			const request = buildDeferred();

			followUser.mockReturnValue(request.promise);
			const { result } = await renderPlacement();

			act(() => {
				result.current.followSuggestion('p1');
				result.current.followSuggestion('p1');
			});

			expect(followUser).toHaveBeenCalledTimes(1);

			await act(async () => request.resolve({ user: loggedInUser }));
		});

		it('sends no unfollow request while the follow is still pending', async () => {
			const request = buildDeferred();

			followUser.mockReturnValue(request.promise);
			const { result } = await renderPlacement();

			act(() => {
				result.current.followSuggestion('p1');
				result.current.unfollowSuggestion('p1');
			});

			expect(unfollowUser).not.toHaveBeenCalled();
			expect(result.current.followedIds).toEqual(['p1']);

			await act(async () => request.resolve({ user: loggedInUser }));
		});

		it('sends one request when the same user is unfollowed twice before the first returns', async () => {
			const request = buildDeferred();
			const { result } = await renderPlacement();

			await act(() => result.current.followSuggestion('p1'));

			unfollowUser.mockReturnValue(request.promise);

			act(() => {
				result.current.unfollowSuggestion('p1');
				result.current.unfollowSuggestion('p1');
			});

			expect(unfollowUser).toHaveBeenCalledTimes(1);

			await act(async () => request.resolve({ user: loggedInUser }));
		});

		it('can follow two different users at once', async () => {
			followUser.mockReturnValue(new Promise(() => {}));
			const { result } = await renderPlacement();

			act(() => {
				result.current.followSuggestion('p1');
				result.current.followSuggestion('n1');
			});

			expect(followUser).toHaveBeenCalledTimes(2);
			expect(result.current.followedIds).toEqual(['p1', 'n1']);
			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
		});

		it('keeps two users independent when only one of the follows fails', async () => {
			followUser.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce({ user: loggedInUser });
			const { result } = await renderPlacement();

			await act(() => Promise.all([result.current.followSuggestion('p1'), result.current.followSuggestion('n1')]));

			expect(result.current.followedIds).toEqual(['n1']);
			expect(getIds(result)).toEqual(['m1', 'm2', 'p1', 'p2', 'n1']);
		});

		it('follows several users independently and unfollows one of them', async () => {
			const { result } = await renderPlacement();

			await act(() => result.current.followSuggestion('p1'));
			await act(() => result.current.followSuggestion('n1'));
			await act(() => result.current.unfollowSuggestion('p1'));

			expect(result.current.followedIds).toEqual(['n1']);
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

		it('tells the server, without passing a token', async () => {
			const { result } = await renderSuggestions({ placement: 'carousel' });

			await act(() => result.current.dismissCarousel());

			expect(dismissSuggestionsCarousel).toHaveBeenCalledWith();
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
		it('loads again for the new placement and drops the previous list and followed marks', async () => {
			getSuggestions.mockResolvedValue(buildResult());
			const wrapper = ({ children }) => (
				<LoggedInUserContext.Provider value={{ loggedInUser, updateLoggedInUser: vi.fn(), endSession: vi.fn() }}>
					<ToastProvider>{children}</ToastProvider>
				</LoggedInUserContext.Provider>
			);
			const { result, rerender } = renderHook(({ placement }) => useSuggestions(placement), {
				wrapper,
				initialProps: { placement: 'sidebar' },
			});

			await waitFor(() => expect(result.current.isLoaded).toBe(true));
			await act(() => result.current.followSuggestion('p1'));

			getSuggestions.mockResolvedValue(buildResult({ suggestions: [buildSuggestion('x1', 'popular')] }));
			rerender({ placement: 'carousel' });

			await waitFor(() => expect(getIds(result)).toEqual(['x1']));
			expect(result.current.followedIds).toEqual([]);
			expect(getSuggestions).toHaveBeenLastCalledWith({ placement: 'carousel' });
		});

		it('keeps the new list when the previous placement answers last', async () => {
			const sidebarRequest = buildDeferred();
			const carouselRequest = buildDeferred();

			getSuggestions.mockReturnValueOnce(sidebarRequest.promise).mockReturnValueOnce(carouselRequest.promise);
			const contextValue = { loggedInUser, updateLoggedInUser: vi.fn(), endSession: vi.fn() };
			const wrapper = ({ children }) => (
				<LoggedInUserContext.Provider value={contextValue}>
					<ToastProvider>{children}</ToastProvider>
				</LoggedInUserContext.Provider>
			);
			const { result, rerender } = renderHook(({ placement }) => useSuggestions(placement), {
				wrapper,
				initialProps: { placement: 'sidebar' },
			});

			rerender({ placement: 'carousel' });
			expect(getSuggestions).toHaveBeenCalledTimes(2);

			await act(async () => carouselRequest.resolve(buildResult({ suggestions: [buildSuggestion('x1', 'popular')] })));
			await act(async () => sidebarRequest.resolve(buildResult()));

			expect(result.current.isLoaded).toBe(true);
			expect(getIds(result)).toEqual(['x1']);
		});
	});
});
