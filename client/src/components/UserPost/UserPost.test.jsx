import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { likeUserPost, unlikeUserPost, getUserPostLikes } from '../../services/userPostService';
import { getComments, addComment } from '../../services/commentService';

import ToastProvider from '../ToastProvider/ToastProvider';

import UserPost from './UserPost';

vi.mock('../../services/userPostService');
vi.mock('../../services/commentService');

const mockNavigate = vi.fn();

vi.mock('react-router', async () => ({
	...(await vi.importActual('react-router')),
	useNavigate: () => mockNavigate,
}));

const loggedInUser = { _id: 'user1', username: 'johndoe' };

const author = { _id: 'user2', username: 'janedoe', profilePicture: { imageUrl: 'https://example.com/jane.jpg' } };

const basePost = {
	_id: 'post1',
	imageUrl: 'https://example.com/1.jpg',
	imageWidth: 1080,
	imageHeight: 1350,
	caption: 'Sunset at the beach',
	likes: [],
	commentsCount: 0,
	previewComments: [],
};

const buildComment = (id, text, overrides = {}) => ({
	_id: id,
	text,
	likes: [],
	createdAt: '2024-01-01T00:00:00.000Z',
	userId: { _id: 'user3', username: 'alice' },
	replies: [],
	...overrides,
});

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const renderPost = ({
	post = basePost,
	user = loggedInUser,
	entry = '/user-feed',
	endSession = vi.fn(),
	onPostChange = vi.fn(),
	onEditClick = vi.fn(),
	onDeleteClick = vi.fn(),
	showActions,
} = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ loggedInUser: user, endSession }}>
			<ToastProvider>
				<MemoryRouter initialEntries={[entry]}>
					<UserPost
						userPostData={post}
						author={author}
						showActions={showActions}
						onPostChange={onPostChange}
						onEditClick={onEditClick}
						onDeleteClick={onDeleteClick}
					/>
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, endSession, onPostChange, onEditClick, onDeleteClick };
};

const getPreviewTexts = (container) => Array.from(container.querySelectorAll('.user-post-preview')).map((element) => element.textContent);

describe('UserPost', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe('content', () => {
		it('shows the post image', () => {
			renderPost();

			expect(screen.getByAltText('post')).toHaveAttribute('src', basePost.imageUrl);
		});

		it('does not focus the main Add a comment box', () => {
			renderPost();

			expect(screen.getByPlaceholderText('Add a comment...')).not.toHaveFocus();
		});

		describe('image aspect ratio', () => {
			const getImageAspectRatio = () => {
				const [width, height = '1'] = screen.getByAltText('post').style.aspectRatio.split('/');

				return Number(width) / Number(height);
			};

			it('is set on the image from the stored width and height', () => {
				renderPost({ post: { ...basePost, imageWidth: 1000, imageHeight: 1100 } });

				expect(getImageAspectRatio()).toBeCloseTo(1000 / 1100);
			});

			it('is 1 for a square image', () => {
				renderPost({ post: { ...basePost, imageWidth: 800, imageHeight: 800 } });

				expect(getImageAspectRatio()).toBe(1);
			});

			it('is limited to 4:5 for a portrait image taller than that', () => {
				renderPost({ post: { ...basePost, imageWidth: 500, imageHeight: 2000 } });

				expect(getImageAspectRatio()).toBeCloseTo(0.8);
			});

			it('is limited to 1.91:1 for a landscape image wider than that', () => {
				renderPost({ post: { ...basePost, imageWidth: 3000, imageHeight: 1000 } });

				expect(getImageAspectRatio()).toBeCloseTo(1.91);
			});
		});

		it('uses the post id as the id of the card so the URL hash can point at it', () => {
			const { container } = renderPost();

			expect(container.querySelector('article')).toHaveAttribute('id', 'post1');
		});

		it('shows the username of the author, linked to the profile', () => {
			renderPost();

			expect(screen.getByRole('link', { name: 'janedoe' })).toHaveAttribute('href', '/user/user2');
		});

		it('shows the caption with the username of the author', () => {
			const { container } = renderPost();

			expect(container.querySelector('.post-caption')).toHaveTextContent('janedoe Sunset at the beach');
		});

		it('shows no caption when the post has none', () => {
			const { container } = renderPost({ post: { ...basePost, caption: '' } });

			expect(container.querySelector('.post-caption')).not.toBeInTheDocument();
		});

		it('shows "0 likes" and "0 comments" for a fresh post', () => {
			renderPost();

			expect(screen.getByText('0 likes')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: '0 comments' })).toBeInTheDocument();
		});

		it('uses the singular labels for one like and one comment', () => {
			renderPost({ post: { ...basePost, likes: ['user9'], commentsCount: 1 } });

			expect(screen.getByText('1 like')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: '1 comment' })).toBeInTheDocument();
		});

		it('uses the plural labels otherwise', () => {
			renderPost({ post: { ...basePost, likes: ['user8', 'user9'], commentsCount: 5 } });

			expect(screen.getByText('2 likes')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: '5 comments' })).toBeInTheDocument();
		});

		it('does not fail for a post that has no likes or comment data', () => {
			renderPost({ post: { _id: 'post1', imageUrl: 'https://example.com/1.jpg' } });

			expect(screen.getByText('0 likes')).toBeInTheDocument();
		});
	});

	describe('caption', () => {
		let scrollHeightSpy;
		let clientHeightSpy;

		beforeEach(() => {
			scrollHeightSpy = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(40);
			clientHeightSpy = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(40);
		});

		afterEach(() => {
			scrollHeightSpy.mockRestore();
			clientHeightSpy.mockRestore();
		});

		it('shows no "… more" when the caption fits', () => {
			renderPost();

			expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
		});

		it('shows "… more" when the caption overflows two lines', () => {
			scrollHeightSpy.mockReturnValue(120);

			renderPost();

			expect(screen.getByRole('button', { name: /more/ })).toBeInTheDocument();
		});

		it('expands the caption on the card when "more" is clicked', async () => {
			const user = userEvent.setup();

			scrollHeightSpy.mockReturnValue(120);

			const { container } = renderPost();

			await user.click(screen.getByRole('button', { name: /more/ }));

			expect(container.querySelector('.post-caption')).not.toHaveClass('post-caption-clamped');
			expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
		});
	});

	describe('comment previews', () => {
		it('shows no preview for a post without comments', () => {
			const { container } = renderPost();

			expect(getPreviewTexts(container)).toEqual([]);
		});

		it('shows the two top-level comments it was given, each with its author', () => {
			const { container } = renderPost({
				post: {
					...basePost,
					commentsCount: 2,
					previewComments: [
						buildComment('c1', 'First one'),
						buildComment('c2', 'Second one', { userId: { _id: 'user4', username: 'bob' } }),
					],
				},
			});

			expect(getPreviewTexts(container)).toEqual(['alice First one', 'bob Second one']);
		});

		it('keeps the order of the preview as given', () => {
			const { container } = renderPost({
				post: { ...basePost, previewComments: [buildComment('c2', 'Liked'), buildComment('c1', 'Plain')] },
			});

			expect(getPreviewTexts(container)).toEqual(['alice Liked', 'alice Plain']);
		});

		it('never shows replies in the preview', () => {
			const { container } = renderPost({
				post: {
					...basePost,
					commentsCount: 3,
					previewComments: [buildComment('c1', 'Top level', { replies: [buildComment('r1', 'A reply')] })],
				},
			});

			expect(getPreviewTexts(container)).toEqual(['alice Top level']);
			expect(screen.queryByText(/A reply/)).not.toBeInTheDocument();
		});
	});

	describe('liking the post', () => {
		it('likes the post with the token and reports the new likes', async () => {
			const user = userEvent.setup();

			likeUserPost.mockResolvedValue({ _id: 'post1', likes: ['user1'] });
			const { onPostChange } = renderPost();

			await user.click(screen.getByRole('button', { name: 'Like post' }));

			await waitFor(() => expect(onPostChange).toHaveBeenCalledWith('post1', { likes: ['user1'] }));
			expect(likeUserPost).toHaveBeenCalledWith({ userPostToLikeId: 'post1' });
			expect(unlikeUserPost).not.toHaveBeenCalled();
		});

		it('unlikes a post the user already liked and reports the new likes', async () => {
			const user = userEvent.setup();

			unlikeUserPost.mockResolvedValue({ _id: 'post1', likes: [] });
			const { onPostChange } = renderPost({ post: { ...basePost, likes: ['user1'] } });

			await user.click(screen.getByRole('button', { name: 'Unlike post' }));

			await waitFor(() => expect(onPostChange).toHaveBeenCalledWith('post1', { likes: [] }));
			expect(unlikeUserPost).toHaveBeenCalledWith({ userPostToUnlikeId: 'post1' });
			expect(likeUserPost).not.toHaveBeenCalled();
		});

		it('marks the heart as pressed only when the user liked the post', () => {
			renderPost({ post: { ...basePost, likes: ['user1'] } });

			expect(screen.getByRole('button', { name: 'Unlike post' })).toHaveAttribute('aria-pressed', 'true');
		});

		it('does not mark the heart as pressed for a post liked by someone else', () => {
			renderPost({ post: { ...basePost, likes: ['user9'] } });

			expect(screen.getByRole('button', { name: 'Like post' })).toHaveAttribute('aria-pressed', 'false');
		});

		it('sends one request when the heart is clicked twice before the first returns', async () => {
			const user = userEvent.setup();
			const request = buildDeferred();

			likeUserPost.mockReturnValue(request.promise);
			const { onPostChange } = renderPost();

			await user.dblClick(screen.getByRole('button', { name: 'Like post' }));

			expect(likeUserPost).toHaveBeenCalledTimes(1);

			request.resolve({ _id: 'post1', likes: ['user1'] });
			await waitFor(() => expect(onPostChange).toHaveBeenCalledTimes(1));
		});

		it('shows the like fallback copy as a toast when the request fails', async () => {
			const user = userEvent.setup();

			likeUserPost.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { onPostChange } = renderPost();

			await user.click(screen.getByRole('button', { name: 'Like post' }));

			expect(await screen.findByText("Couldn't update your like. Try again.")).toBeInTheDocument();
			expect(onPostChange).not.toHaveBeenCalled();
		});

		it('shows the like fallback copy as a toast when the failure is not a request error', async () => {
			const user = userEvent.setup();

			likeUserPost.mockRejectedValue(new Error('network down'));
			renderPost();

			await user.click(screen.getByRole('button', { name: 'Like post' }));

			expect(await screen.findByText("Couldn't update your like. Try again.")).toBeInTheDocument();
		});

		it('shows the POST_NOT_FOUND copy as a toast when the post no longer exists', async () => {
			const user = userEvent.setup();

			likeUserPost.mockRejectedValue({ code: 'POST_NOT_FOUND', status: 404 });
			renderPost();

			await user.click(screen.getByRole('button', { name: 'Like post' }));

			expect(await screen.findByText('This post no longer exists')).toBeInTheDocument();
		});

		it('shows the like fallback copy as a toast when unliking fails', async () => {
			const user = userEvent.setup();

			unlikeUserPost.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderPost({ post: { ...basePost, likes: ['user1'] } });

			await user.click(screen.getByRole('button', { name: 'Unlike post' }));

			expect(await screen.findByText("Couldn't update your like. Try again.")).toBeInTheDocument();
		});

		it('ends the session and shows no toast when the like fails with UNAUTHENTICATED', async () => {
			const user = userEvent.setup();

			likeUserPost.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderPost();

			await user.click(screen.getByRole('button', { name: 'Like post' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
		});

		it('allows liking again after a failure', async () => {
			const user = userEvent.setup();

			likeUserPost.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce({ _id: 'post1', likes: ['user1'] });
			const { onPostChange } = renderPost();

			await user.click(screen.getByRole('button', { name: 'Like post' }));
			await screen.findByText("Couldn't update your like. Try again.");
			await user.click(screen.getByRole('button', { name: 'Like post' }));

			await waitFor(() => expect(onPostChange).toHaveBeenCalledWith('post1', { likes: ['user1'] }));
		});
	});

	describe('adding a comment from the card', () => {
		const typeAndPost = async (user, text) => {
			await user.type(screen.getByPlaceholderText('Add a comment...'), text);
			await user.click(screen.getByRole('button', { name: 'Post' }));
		};

		it('keeps Post disabled while the box is empty', () => {
			renderPost();

			expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
		});

		it('keeps Post disabled while the box holds only spaces and sends nothing', async () => {
			const user = userEvent.setup();

			renderPost();

			await user.type(screen.getByPlaceholderText('Add a comment...'), '   {Enter}');

			expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
			expect(addComment).not.toHaveBeenCalled();
		});

		it('sends the comment for the post with the token', async () => {
			const user = userEvent.setup();

			addComment.mockResolvedValue(buildComment('c9', 'Nice shot'));
			renderPost();

			await typeAndPost(user, 'Nice shot');

			await waitFor(() => expect(addComment).toHaveBeenCalledWith({ userPostId: 'post1', text: 'Nice shot' }));
		});

		it('raises the comment count by one and adds the comment to the preview', async () => {
			const user = userEvent.setup();
			const added = buildComment('c9', 'Nice shot', { createdAt: '2024-06-01T00:00:00.000Z' });

			addComment.mockResolvedValue(added);
			const { onPostChange } = renderPost({ post: { ...basePost, commentsCount: 4 } });

			await typeAndPost(user, 'Nice shot');

			await waitFor(() => expect(onPostChange).toHaveBeenCalledWith('post1', { commentsCount: 5, previewComments: [added] }));
		});

		it('keeps only two comments in the preview, most liked first and then newest', async () => {
			const user = userEvent.setup();
			const mostLiked = buildComment('c1', 'Most liked', { likes: ['u8', 'u9'], createdAt: '2024-01-01T00:00:00.000Z' });
			const older = buildComment('c2', 'Older', { createdAt: '2024-02-01T00:00:00.000Z' });
			const added = buildComment('c9', 'Newest', { createdAt: '2024-06-01T00:00:00.000Z' });

			addComment.mockResolvedValue(added);
			const { onPostChange } = renderPost({ post: { ...basePost, commentsCount: 2, previewComments: [mostLiked, older] } });

			await typeAndPost(user, 'Newest');

			await waitFor(() => expect(onPostChange).toHaveBeenCalledWith('post1', { commentsCount: 3, previewComments: [mostLiked, added] }));
		});

		it('clears the box after the comment was added', async () => {
			const user = userEvent.setup();

			addComment.mockResolvedValue(buildComment('c9', 'Nice shot'));
			renderPost();

			await typeAndPost(user, 'Nice shot');

			await waitFor(() => expect(screen.getByPlaceholderText('Add a comment...')).toHaveValue(''));
		});

		it('shows the add-comment fallback copy under the box when the request fails', async () => {
			const user = userEvent.setup();

			addComment.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { onPostChange } = renderPost();

			await typeAndPost(user, 'Nice shot');

			expect(await screen.findByText("Couldn't post your comment. Try again.")).toBeInTheDocument();
			expect(onPostChange).not.toHaveBeenCalled();
		});

		it.each([
			['COMMENT_TEXT_REQUIRED', 400, "Comment can't be empty"],
			['POST_NOT_FOUND', 404, 'This post no longer exists'],
		])('shows the %s copy under the box', async (code, status, copy) => {
			const user = userEvent.setup();

			addComment.mockRejectedValue({ code, status });
			renderPost();

			await typeAndPost(user, 'Nice shot');

			expect(await screen.findByText(copy)).toBeInTheDocument();
		});

		it('keeps the typed text after a failure', async () => {
			const user = userEvent.setup();

			addComment.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderPost();

			await typeAndPost(user, 'Nice shot');
			await screen.findByText("Couldn't post your comment. Try again.");

			expect(screen.getByPlaceholderText('Add a comment...')).toHaveValue('Nice shot');
		});

		it('ends the session and shows no message when adding fails with UNAUTHENTICATED', async () => {
			const user = userEvent.setup();

			addComment.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderPost();

			await typeAndPost(user, 'Nice shot');

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByText("Couldn't post your comment. Try again.")).not.toBeInTheDocument();
		});
	});

	describe('the comments popup', () => {
		it('stays closed until the comment count is clicked', () => {
			renderPost();

			expect(screen.queryByRole('heading', { name: 'Comments' })).not.toBeInTheDocument();
			expect(getComments).not.toHaveBeenCalled();
		});

		it('opens and loads the comments of the post when the comment count is clicked', async () => {
			const user = userEvent.setup();

			getComments.mockResolvedValue([buildComment('c1', 'Hello there')]);
			renderPost({ post: { ...basePost, commentsCount: 1 } });

			await user.click(screen.getByRole('button', { name: '1 comment' }));

			expect(screen.getByRole('heading', { name: 'Comments' })).toBeInTheDocument();
			expect(await screen.findByText('Hello there')).toBeInTheDocument();
			expect(getComments).toHaveBeenCalledWith({ userPostId: 'post1' });
		});

		it('closes when its Close button is clicked', async () => {
			const user = userEvent.setup();

			getComments.mockResolvedValue([buildComment('c1', 'Hello there')]);
			renderPost({ post: { ...basePost, commentsCount: 1 } });

			await user.click(screen.getByRole('button', { name: '1 comment' }));
			await screen.findByText('Hello there');
			await user.click(screen.getByRole('button', { name: 'Close' }));

			expect(screen.queryByRole('heading', { name: 'Comments' })).not.toBeInTheDocument();
		});

		it('updates the card with the loaded comments, counting replies too', async () => {
			const user = userEvent.setup();
			const first = buildComment('c1', 'First', { likes: ['u8'], replies: [buildComment('r1', 'Reply one'), buildComment('r2', 'Reply two')] });
			const second = buildComment('c2', 'Second');
			const third = buildComment('c3', 'Third', { createdAt: '2024-09-01T00:00:00.000Z' });

			getComments.mockResolvedValue([first, second, third]);
			const { onPostChange } = renderPost({ post: { ...basePost, commentsCount: 1 } });

			await user.click(screen.getByRole('button', { name: '1 comment' }));

			await waitFor(() => expect(onPostChange).toHaveBeenCalledWith('post1', { commentsCount: 5, previewComments: [first, third] }));
		});
	});

	describe('the likes list', () => {
		const likedPost = { ...basePost, likes: ['user8', 'user9'] };

		const likers = [
			{ _id: 'user9', username: 'newestliker' },
			{ _id: 'user8', username: 'olderliker' },
		];

		it('shows "0 likes" as plain text, not a button', () => {
			renderPost();

			expect(screen.getByText('0 likes')).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: '0 likes' })).not.toBeInTheDocument();
		});

		it('does nothing when "0 likes" is clicked', async () => {
			const user = userEvent.setup();

			renderPost();

			await user.click(screen.getByText('0 likes'));

			expect(screen.queryByRole('heading', { name: 'Likes' })).not.toBeInTheDocument();
			expect(getUserPostLikes).not.toHaveBeenCalled();
		});

		it('makes "1 like" a button', () => {
			renderPost({ post: { ...basePost, likes: ['user9'] } });

			expect(screen.getByRole('button', { name: '1 like' })).toBeInTheDocument();
		});

		it('makes "N likes" a button from two likes up', () => {
			renderPost({ post: likedPost });

			expect(screen.getByRole('button', { name: '2 likes' })).toBeInTheDocument();
		});

		it('stays closed, and loads nothing, until the label is clicked', () => {
			renderPost({ post: likedPost });

			expect(screen.queryByRole('heading', { name: 'Likes' })).not.toBeInTheDocument();
			expect(getUserPostLikes).not.toHaveBeenCalled();
		});

		it('opens the popup titled "Likes" and loads the likes of this post when the label is clicked', async () => {
			const user = userEvent.setup();

			getUserPostLikes.mockResolvedValue(likers);
			renderPost({ post: likedPost });

			await user.click(screen.getByRole('button', { name: '2 likes' }));

			expect(screen.getByRole('heading', { name: 'Likes' })).toBeInTheDocument();
			expect(await screen.findByText('newestliker')).toBeInTheDocument();
			expect(screen.getByText('olderliker')).toBeInTheDocument();
			expect(getUserPostLikes).toHaveBeenCalledTimes(1);
			expect(getUserPostLikes).toHaveBeenCalledWith(expect.objectContaining({ userPostId: 'post1' }));
		});

		it('does not toggle the like when the label is clicked', async () => {
			const user = userEvent.setup();

			getUserPostLikes.mockResolvedValue(likers);
			renderPost({ post: likedPost });

			await user.click(screen.getByRole('button', { name: '2 likes' }));
			await screen.findByText('newestliker');

			expect(likeUserPost).not.toHaveBeenCalled();
			expect(unlikeUserPost).not.toHaveBeenCalled();
		});

		it('keeps the heart a separate control that still likes the post', async () => {
			const user = userEvent.setup();

			likeUserPost.mockResolvedValue({ _id: 'post1', likes: ['user8', 'user9', 'user1'] });
			renderPost({ post: likedPost });

			await user.click(screen.getByRole('button', { name: 'Like post' }));

			await waitFor(() => expect(likeUserPost).toHaveBeenCalledTimes(1));
			expect(screen.queryByRole('heading', { name: 'Likes' })).not.toBeInTheDocument();
			expect(getUserPostLikes).not.toHaveBeenCalled();
		});

		it('closes when its Close button is clicked, and can be opened again', async () => {
			const user = userEvent.setup();

			getUserPostLikes.mockResolvedValue(likers);
			renderPost({ post: likedPost });

			await user.click(screen.getByRole('button', { name: '2 likes' }));
			await screen.findByText('newestliker');
			await user.click(screen.getByRole('button', { name: 'Close' }));

			expect(screen.queryByRole('heading', { name: 'Likes' })).not.toBeInTheDocument();

			await user.click(screen.getByRole('button', { name: '2 likes' }));

			expect(await screen.findByText('newestliker')).toBeInTheDocument();
		});

		it('closes on Escape', async () => {
			const user = userEvent.setup();

			getUserPostLikes.mockResolvedValue(likers);
			renderPost({ post: likedPost });

			await user.click(screen.getByRole('button', { name: '2 likes' }));
			await screen.findByText('newestliker');
			await user.keyboard('{Escape}');

			expect(screen.queryByRole('heading', { name: 'Likes' })).not.toBeInTheDocument();
		});

		it('links each account to its profile and closes when one is clicked', async () => {
			const user = userEvent.setup();

			getUserPostLikes.mockResolvedValue(likers);
			renderPost({ post: likedPost });

			await user.click(screen.getByRole('button', { name: '2 likes' }));

			expect(await screen.findByRole('link', { name: /olderliker/ })).toHaveAttribute('href', '/user/user8');

			await user.click(screen.getByRole('link', { name: /olderliker/ }));

			expect(screen.queryByRole('heading', { name: 'Likes' })).not.toBeInTheDocument();
		});

		it('shows the inline load error with a retry, not a toast', async () => {
			const user = userEvent.setup();

			getUserPostLikes.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(likers);
			renderPost({ post: likedPost });

			await user.click(screen.getByRole('button', { name: '2 likes' }));
			await user.click(await screen.findByRole('button', { name: 'Try again' }));

			expect(await screen.findByText('newestliker')).toBeInTheDocument();
			expect(getUserPostLikes).toHaveBeenCalledTimes(2);
		});

		it('is open to a guest: the label is a button and the list opens without redirecting', async () => {
			const user = userEvent.setup();

			getUserPostLikes.mockResolvedValue(likers);
			renderPost({ user: null, post: likedPost });

			await user.click(screen.getByRole('button', { name: '2 likes' }));

			expect(await screen.findByText('newestliker')).toBeInTheDocument();
			expect(mockNavigate).not.toHaveBeenCalled();
		});
	});

	describe('as a guest', () => {
		it('shows the post, the like control and the comment box', () => {
			renderPost({ user: null });

			expect(screen.getByAltText('post')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Like post' })).toBeInTheDocument();
			expect(screen.getByPlaceholderText('Add a comment...')).toBeInTheDocument();
		});

		it('sends the guest to /log-in with the same URL, hash included, when Like is clicked', async () => {
			const user = userEvent.setup();

			renderPost({ user: null, entry: '/user/user2/posts#post1' });

			await user.click(screen.getByRole('button', { name: 'Like post' }));

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
			expect(likeUserPost).not.toHaveBeenCalled();
		});

		it('sends the guest to /log-in with the same URL when the comment box is clicked', async () => {
			const user = userEvent.setup();

			renderPost({ user: null, entry: '/user/user2/posts#post1' });

			await user.click(screen.getByPlaceholderText('Add a comment...'));

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
		});

		it('shows Post disabled, and clicking it adds no comment and does not redirect', async () => {
			const user = userEvent.setup();

			renderPost({ user: null, entry: '/user/user2/posts#post1' });

			await user.click(screen.getByRole('button', { name: 'Post' }));

			expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
			expect(mockNavigate).not.toHaveBeenCalled();
			expect(addComment).not.toHaveBeenCalled();
		});

		it('lets the guest open the comments popup and read the comments without redirecting', async () => {
			const user = userEvent.setup();

			getComments.mockResolvedValue([buildComment('c1', 'Hello there')]);
			renderPost({ user: null, post: { ...basePost, commentsCount: 1 } });

			await user.click(screen.getByRole('button', { name: '1 comment' }));

			expect(await screen.findByText('Hello there')).toBeInTheDocument();
			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it('still links the author to their profile', () => {
			renderPost({ user: null });

			expect(screen.getByRole('link', { name: 'janedoe' })).toHaveAttribute('href', '/user/user2');
		});

		it('shows no post actions', () => {
			renderPost({ user: null });

			expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
		});
	});

	describe('post actions', () => {
		it('shows no actions button by default', () => {
			renderPost();

			expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
		});

		it('shows the actions button when showActions is set', () => {
			renderPost({ showActions: true });

			expect(screen.getByRole('button', { name: 'Post actions' })).toBeInTheDocument();
		});

		it('opens a menu with Edit and Delete', async () => {
			const user = userEvent.setup();

			renderPost({ showActions: true });

			await user.click(screen.getByRole('button', { name: 'Post actions' }));

			expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		});

		it('calls onEditClick with the post and closes the menu when Edit is clicked', async () => {
			const user = userEvent.setup();
			const { onEditClick } = renderPost({ showActions: true });

			await user.click(screen.getByRole('button', { name: 'Post actions' }));
			await user.click(screen.getByRole('button', { name: 'Edit' }));

			expect(onEditClick).toHaveBeenCalledWith(basePost);
			expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		});

		it('calls onDeleteClick with the post and closes the menu when Delete is clicked', async () => {
			const user = userEvent.setup();
			const { onDeleteClick } = renderPost({ showActions: true });

			await user.click(screen.getByRole('button', { name: 'Post actions' }));
			await user.click(screen.getByRole('button', { name: 'Delete' }));

			expect(onDeleteClick).toHaveBeenCalledWith(basePost);
			expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
		});
	});
});
