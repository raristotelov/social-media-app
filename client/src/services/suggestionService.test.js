import { requestFactory } from './requester';
import { dismissSuggestionsCarousel, getSuggestions } from './suggestionService';

vi.mock('./requester');

describe('suggestionService', () => {
	describe('getSuggestions', () => {
		it.each([['sidebar'], ['carousel'], ['empty-feed']])('gets the suggestions endpoint with the %s placement', async (placement) => {
			const get = vi.fn().mockResolvedValue({ suggestions: [], reserve: [], isCarouselDismissed: false });

			requestFactory.mockReturnValue({ get });

			await getSuggestions({ placement });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/suggestions\\?placement=${placement}$`)));
		});

		it('resolves with the server result', async () => {
			const result = { suggestions: [{ _id: 'u2' }], reserve: [{ _id: 'u3' }], isCarouselDismissed: false };

			requestFactory.mockReturnValue({ get: vi.fn().mockResolvedValue(result) });

			await expect(getSuggestions({ placement: 'sidebar' })).resolves.toBe(result);
		});

		it('encodes the placement in the query string', async () => {
			const get = vi.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ get });

			await getSuggestions({ placement: 'a&b' });

			expect(get).toHaveBeenCalledWith(expect.stringContaining('placement=a%26b'));
		});

		it('rejects with the request error', async () => {
			const error = { code: 'INTERNAL_ERROR', status: 500 };

			requestFactory.mockReturnValue({ get: vi.fn().mockRejectedValue(error) });

			await expect(getSuggestions({ placement: 'sidebar' })).rejects.toBe(error);
		});
	});

	describe('dismissSuggestionsCarousel', () => {
		it('posts to the carousel dismiss endpoint', async () => {
			const post = vi.fn().mockResolvedValue(undefined);

			requestFactory.mockReturnValue({ post });

			await dismissSuggestionsCarousel();

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/suggestions\/carousel\/dismiss$/));
		});

		it('rejects with the request error', async () => {
			const error = { code: 'UNAUTHENTICATED', status: 401 };

			requestFactory.mockReturnValue({ post: vi.fn().mockRejectedValue(error) });

			await expect(dismissSuggestionsCarousel()).rejects.toBe(error);
		});
	});
});
