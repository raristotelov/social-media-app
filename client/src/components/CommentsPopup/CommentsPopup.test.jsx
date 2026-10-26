import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getComments, addComment, likeComment, unlikeComment, getCommentLikes } from '../../services/commentService';

import ToastProvider from '../ToastProvider/ToastProvider';

import CommentsPopup from './CommentsPopup';

jest.mock('../../services/commentService');

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useNavigate: () => mockNavigate,
}));

const loggedInUser = { _id: 'user1', username: 'johndoe' };

const buildComment = (id, text, overrides = {}) => ({
	_id: id,
	text,
	likes: [],
	userId: { _id: 'user3', username: 'alice' },
	replies: [],
	...overrides,
});

const topComments = [buildComment('c1', 'Most liked comment', { likes: ['u8', 'u9'] }), buildComment('c2', 'Newest comment')];

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const renderPopup = ({
	user = loggedInUser,
	entry = '/user/user2/posts#post1',
	onClose = jest.fn(),
	onCommentsLoaded = jest.fn(),
	endSession = jest.fn(),
} = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: user ? 'token123' : null, loggedInUser: user, endSession }}>
			<ToastProvider>
				<MemoryRouter initialEntries={[entry]}>
					<CommentsPopup userPostId='post1' onClose={onClose} onCommentsLoaded={onCommentsLoaded} />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onClose, onCommentsLoaded, endSession };
};

const getCommentTexts = (container) =>
	Array.from(container.querySelectorAll('.comments-popup-list > .comment .comment-text')).map((element) => element.textContent);

describe('CommentsPopup', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('focus', () => {
		it('does not focus the main Add a comment box when the popup opens', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup();

			await screen.findByText('Most liked comment');

			expect(screen.getByPlaceholderText('Add a comment...')).not.toHaveFocus();
		});

		it('focuses a reply box once it is opened from a comment', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);

			expect(screen.getByPlaceholderText('Write a reply...')).toHaveFocus();
		});
	});

	describe('loading comments', () => {
		it('shows the Comments title', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup();

			expect(screen.getByRole('heading', { name: 'Comments' })).toBeInTheDocument();
			await screen.findByText('Most liked comment');
		});

		it('requests the comments of the post with the token', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup();

			await screen.findByText('Most liked comment');
			expect(getComments).toHaveBeenCalledWith({ userPostId: 'post1', jwtToken: 'token123' });
		});

		it('shows a spinner while the comments load', async () => {
			const request = buildDeferred();

			getComments.mockReturnValue(request.promise);
			const { container } = renderPopup();

			expect(container.ownerDocument.querySelector('.loading-spinner')).toBeInTheDocument();

			request.resolve(topComments);
			await screen.findByText('Most liked comment');
			expect(container.ownerDocument.querySelector('.loading-spinner')).not.toBeInTheDocument();
		});

		it('lists the comments in the order the server returned them', async () => {
			getComments.mockResolvedValue(topComments);
			const { container } = renderPopup();

			await screen.findByText('Most liked comment');
			expect(getCommentTexts(container.ownerDocument.body)).toEqual(['Most liked comment', 'Newest comment']);
		});

		it('reports the loaded comments to the post card', async () => {
			getComments.mockResolvedValue(topComments);
			const { onCommentsLoaded } = renderPopup();

			await waitFor(() => expect(onCommentsLoaded).toHaveBeenCalledWith(topComments));
		});

		it('shows an empty message when the post has no comments', async () => {
			getComments.mockResolvedValue([]);
			renderPopup();

			expect(await screen.findByText('No comments yet. Be the first to comment.')).toBeInTheDocument();
		});

		it('keeps the comment box enabled when the comments loaded', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup();

			await screen.findByText('Most liked comment');
			expect(screen.getByPlaceholderText('Add a comment...')).toBeEnabled();
		});
	});

	describe('when the comments fail to load', () => {
		beforeEach(() => {
			getComments.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
		});

		it('shows "Couldn\'t load comments" with a Try again button inline', async () => {
			renderPopup();

			expect(await screen.findByText("Couldn't load comments")).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
		});

		it('keeps the Comments title and Close button', async () => {
			renderPopup();

			await screen.findByText("Couldn't load comments");
			expect(screen.getByRole('heading', { name: 'Comments' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
		});

		it('disables the comment box and its Post button', async () => {
			renderPopup();

			await screen.findByText("Couldn't load comments");
			expect(screen.getByPlaceholderText('Add a comment...')).toBeDisabled();
			expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
		});

		it('shows no toast and does not end the session', async () => {
			const { endSession } = renderPopup();

			await screen.findByText("Couldn't load comments");
			expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
			expect(endSession).not.toHaveBeenCalled();
		});

		it('does not report anything to the post card', async () => {
			const { onCommentsLoaded } = renderPopup();

			await screen.findByText("Couldn't load comments");
			expect(onCommentsLoaded).not.toHaveBeenCalled();
		});

		it('loads the comments again when Try again is clicked', async () => {
			renderPopup();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));
		});

		it('shows the comments and enables the box when the retry succeeds', async () => {
			getComments.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce(topComments);
			renderPopup();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			expect(await screen.findByText('Most liked comment')).toBeInTheDocument();
			expect(screen.queryByText("Couldn't load comments")).not.toBeInTheDocument();
			expect(screen.getByPlaceholderText('Add a comment...')).toBeEnabled();
		});

		it('keeps the error when the retry fails again', async () => {
			renderPopup();

			userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

			await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));
			expect(await screen.findByText("Couldn't load comments")).toBeInTheDocument();
			expect(screen.getByPlaceholderText('Add a comment...')).toBeDisabled();
		});
	});

	describe('adding a comment', () => {
		it('sends the text for the post with the token', async () => {
			getComments.mockResolvedValue(topComments);
			addComment.mockResolvedValue({ _id: 'c3' });
			renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.type(screen.getByPlaceholderText('Add a comment...'), 'Nice shot');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() => expect(addComment).toHaveBeenCalledWith({ userPostId: 'post1', text: 'Nice shot', jwtToken: 'token123' }));
		});

		it('reloads the comments and shows the new one', async () => {
			const withNew = [...topComments, buildComment('c3', 'Nice shot')];

			getComments.mockResolvedValueOnce(topComments).mockResolvedValueOnce(withNew);
			addComment.mockResolvedValue({ _id: 'c3' });
			renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.type(screen.getByPlaceholderText('Add a comment...'), 'Nice shot');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			expect(await screen.findByText('Nice shot', { selector: '.comment-text' })).toBeInTheDocument();
			expect(getComments).toHaveBeenCalledTimes(2);
		});

		it('reports the reloaded comments to the post card', async () => {
			const withNew = [...topComments, buildComment('c3', 'Nice shot')];

			getComments.mockResolvedValueOnce(topComments).mockResolvedValueOnce(withNew);
			addComment.mockResolvedValue({ _id: 'c3' });
			const { onCommentsLoaded } = renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.type(screen.getByPlaceholderText('Add a comment...'), 'Nice shot');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() => expect(onCommentsLoaded).toHaveBeenLastCalledWith(withNew));
		});

		it('replaces the empty message once the first comment is added', async () => {
			getComments.mockResolvedValueOnce([]).mockResolvedValueOnce([buildComment('c3', 'First!')]);
			addComment.mockResolvedValue({ _id: 'c3' });
			renderPopup();

			await screen.findByText('No comments yet. Be the first to comment.');
			userEvent.type(screen.getByPlaceholderText('Add a comment...'), 'First!');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			expect(await screen.findByText('First!', { selector: '.comment-text' })).toBeInTheDocument();
			expect(screen.queryByText('No comments yet. Be the first to comment.')).not.toBeInTheDocument();
		});

		it('sends no request for a box that holds only spaces', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.type(screen.getByPlaceholderText('Add a comment...'), '   ');

			expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
			expect(addComment).not.toHaveBeenCalled();
		});

		it('shows the add-comment fallback copy under the box when the request fails', async () => {
			getComments.mockResolvedValue(topComments);
			addComment.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.type(screen.getByPlaceholderText('Add a comment...'), 'Nice shot');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			expect(await screen.findByText("Couldn't post your comment. Try again.")).toBeInTheDocument();
			expect(getComments).toHaveBeenCalledTimes(1);
		});

		it.each([
			['COMMENT_TEXT_REQUIRED', 400, "Comment can't be empty"],
			['POST_NOT_FOUND', 404, 'This post no longer exists'],
		])('shows the %s copy under the box', async (code, status, copy) => {
			getComments.mockResolvedValue(topComments);
			addComment.mockRejectedValue({ code, status });
			renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.type(screen.getByPlaceholderText('Add a comment...'), 'Nice shot');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			expect(await screen.findByText(copy)).toBeInTheDocument();
		});

		describe('when the comment is saved but the reload fails', () => {
			const datedComments = [
				buildComment('c1', 'Most liked comment', { likes: ['u8', 'u9'], createdAt: '2024-01-01T00:00:00.000Z' }),
				buildComment('c2', 'Older comment', { createdAt: '2024-02-01T00:00:00.000Z' }),
			];
			const savedComment = buildComment('c3', 'Nice shot', { createdAt: '2024-06-01T00:00:00.000Z', parentCommentId: null });

			const postComment = (text) => {
				userEvent.type(screen.getByPlaceholderText('Add a comment...'), text);
				userEvent.click(screen.getByRole('button', { name: 'Post' }));
			};

			beforeEach(() => {
				getComments.mockResolvedValueOnce(datedComments).mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
				addComment.mockResolvedValue(savedComment);
			});

			it('keeps the current list and adds the new comment to it', async () => {
				const { container } = renderPopup();

				await screen.findByText('Most liked comment');
				postComment('Nice shot');

				expect(await screen.findByText('Nice shot', { selector: '.comment-text' })).toBeInTheDocument();
				expect(getCommentTexts(container.ownerDocument.body)).toEqual(['Most liked comment', 'Nice shot', 'Older comment']);
			});

			it('shows no load error and no form message', async () => {
				renderPopup();

				await screen.findByText('Most liked comment');
				postComment('Nice shot');
				await screen.findByText('Nice shot', { selector: '.comment-text' });

				expect(screen.queryByText("Couldn't load comments")).not.toBeInTheDocument();
				expect(screen.queryByText("Couldn't post your comment. Try again.")).not.toBeInTheDocument();
				expect(document.querySelector('.add-comment-form-error')).not.toBeInTheDocument();
				expect(document.querySelector('.comments-popup-message')).not.toBeInTheDocument();
				expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
			});

			it('keeps the form usable and clears the typed text', async () => {
				renderPopup();

				await screen.findByText('Most liked comment');
				postComment('Nice shot');
				await screen.findByText('Nice shot', { selector: '.comment-text' });

				await waitFor(() => expect(screen.getByPlaceholderText('Add a comment...')).toHaveValue(''));
				expect(screen.getByPlaceholderText('Add a comment...')).toBeEnabled();
			});

			it('lets the user post another comment afterwards', async () => {
				addComment
					.mockResolvedValueOnce(savedComment)
					.mockResolvedValueOnce(buildComment('c4', 'Second one', { createdAt: '2024-07-01T00:00:00.000Z' }));
				const { container } = renderPopup();

				await screen.findByText('Most liked comment');
				postComment('Nice shot');
				await screen.findByText('Nice shot', { selector: '.comment-text' });
				await waitFor(() => expect(screen.getByPlaceholderText('Add a comment...')).toHaveValue(''));
				postComment('Second one');

				expect(await screen.findByText('Second one', { selector: '.comment-text' })).toBeInTheDocument();
				expect(addComment).toHaveBeenCalledTimes(2);
				expect(getCommentTexts(container.ownerDocument.body)).toEqual(['Most liked comment', 'Second one', 'Nice shot', 'Older comment']);
			});

			it('reports the locally updated list to the post card', async () => {
				const { onCommentsLoaded } = renderPopup();

				await screen.findByText('Most liked comment');
				postComment('Nice shot');

				await waitFor(() =>
					expect(onCommentsLoaded).toHaveBeenLastCalledWith([datedComments[0], { ...savedComment, replies: [] }, datedComments[1]]),
				);
			});

			it('replaces the empty message when the first comment is added', async () => {
				getComments.mockReset();
				getComments.mockResolvedValueOnce([]).mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
				renderPopup();

				await screen.findByText('No comments yet. Be the first to comment.');
				postComment('Nice shot');

				expect(await screen.findByText('Nice shot', { selector: '.comment-text' })).toBeInTheDocument();
				expect(screen.queryByText('No comments yet. Be the first to comment.')).not.toBeInTheDocument();
				expect(screen.queryByText("Couldn't load comments")).not.toBeInTheDocument();
			});
		});

		it('ends the session when adding fails with UNAUTHENTICATED', async () => {
			getComments.mockResolvedValue(topComments);
			addComment.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.type(screen.getByPlaceholderText('Add a comment...'), 'Nice shot');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByText("Couldn't post your comment. Try again.")).not.toBeInTheDocument();
		});
	});

	describe('liking a comment', () => {
		it('reloads the comments after a like', async () => {
			const liked = [buildComment('c1', 'Most liked comment', { likes: ['u8', 'u9', 'user1'] }), topComments[1]];

			getComments.mockResolvedValueOnce(topComments).mockResolvedValueOnce(liked);
			likeComment.mockResolvedValue({});
			renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[0]);

			expect(await screen.findByText('3 likes')).toBeInTheDocument();
			expect(likeComment).toHaveBeenCalledWith({ commentId: 'c1', jwtToken: 'token123' });
		});

		describe('when the like is saved but the reload fails', () => {
			const loadFailure = { code: 'INTERNAL_ERROR', status: 500 };

			const top = buildComment('c1', 'Top', { likes: ['u8', 'u9'], createdAt: '2024-01-01T00:00:00.000Z' });
			const newer = buildComment('c2', 'Newer', { createdAt: '2024-03-01T00:00:00.000Z' });
			const older = buildComment('c3', 'Older', { createdAt: '2024-02-01T00:00:00.000Z' });

			const getTopLevelTexts = () =>
				Array.from(document.querySelectorAll('.comments-popup-list > .comment > .comment-row .comment-text')).map(
					(element) => element.textContent,
				);

			const getTopLevelLikeLabels = () =>
				Array.from(document.querySelectorAll('.comments-popup-list > .comment > .comment-row .comment-util-label')).map(
					(element) => element.textContent,
				);

			const getReplyLikeLabels = () =>
				Array.from(document.querySelectorAll('.comment-reply .comment-util-label')).map((element) => element.textContent);

			it('applies the like to the current list without reloading it', async () => {
				getComments.mockResolvedValueOnce([top, newer, older]).mockRejectedValue(loadFailure);
				likeComment.mockResolvedValue({});
				renderPopup();

				await screen.findByText('Top');
				userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[2]);

				await waitFor(() => expect(getTopLevelLikeLabels()).toEqual(['2 likes', '1 like', '0 likes']));
				expect(getComments).toHaveBeenCalledTimes(2);
			});

			it('moves the liked comment up when the like gives it more likes than the others', async () => {
				getComments.mockResolvedValueOnce([top, newer, older]).mockRejectedValue(loadFailure);
				likeComment.mockResolvedValue({});
				renderPopup();

				await screen.findByText('Top');
				userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[2]);

				await waitFor(() => expect(getTopLevelTexts()).toEqual(['Top', 'Older', 'Newer']));
			});

			it('removes the like locally when the user unlikes and re-sorts', async () => {
				const mine = buildComment('c1', 'Mine', { likes: ['u8', 'user1'], createdAt: '2024-01-01T00:00:00.000Z' });
				const rival = buildComment('c2', 'Rival', { likes: ['u8'], createdAt: '2024-05-01T00:00:00.000Z' });

				getComments.mockResolvedValueOnce([mine, rival]).mockRejectedValue(loadFailure);
				unlikeComment.mockResolvedValue({});
				renderPopup();

				await screen.findByText('Mine');
				expect(getTopLevelTexts()).toEqual(['Mine', 'Rival']);
				userEvent.click(screen.getByRole('button', { name: 'Unlike comment' }));

				await waitFor(() => expect(getTopLevelTexts()).toEqual(['Rival', 'Mine']));
				expect(getTopLevelLikeLabels()).toEqual(['1 like', '1 like']);
				expect(screen.getAllByRole('button', { name: 'Like comment' })).toHaveLength(2);
			});

			it('applies a like on a reply to that reply only', async () => {
				const parent = buildComment('c1', 'Parent', {
					replies: [buildComment('r1', 'A reply', { createdAt: '2024-01-02T00:00:00.000Z', parentCommentId: 'c1' })],
				});

				getComments.mockResolvedValueOnce([parent]).mockRejectedValue(loadFailure);
				likeComment.mockResolvedValue({});
				renderPopup();

				await screen.findByText('Parent');
				userEvent.click(screen.getByRole('button', { name: 'View replies' }));
				userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[1]);

				await waitFor(() => expect(getReplyLikeLabels()).toEqual(['1 like']));
				expect(getTopLevelLikeLabels()).toEqual(['0 likes']);
				expect(likeComment).toHaveBeenCalledWith({ commentId: 'r1', jwtToken: 'token123' });
			});

			it('reports the locally updated list to the post card', async () => {
				getComments.mockResolvedValueOnce([top, newer, older]).mockRejectedValue(loadFailure);
				likeComment.mockResolvedValue({});
				const { onCommentsLoaded } = renderPopup();

				await screen.findByText('Top');
				userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[2]);

				await waitFor(() => expect(onCommentsLoaded).toHaveBeenLastCalledWith([top, { ...older, likes: ['user1'] }, newer]));
			});

			it('shows no load error, no like error and no toast', async () => {
				getComments.mockResolvedValueOnce([top, newer, older]).mockRejectedValue(loadFailure);
				likeComment.mockResolvedValue({});
				renderPopup();

				await screen.findByText('Top');
				userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[2]);
				await waitFor(() => expect(getTopLevelLikeLabels()).toEqual(['2 likes', '1 like', '0 likes']));

				expect(screen.queryByText("Couldn't load comments")).not.toBeInTheDocument();
				expect(screen.queryByText("Couldn't update your like. Try again.")).not.toBeInTheDocument();
				expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
				expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
			});

			it('keeps the comment box enabled', async () => {
				getComments.mockResolvedValueOnce([top, newer, older]).mockRejectedValue(loadFailure);
				likeComment.mockResolvedValue({});
				renderPopup();

				await screen.findByText('Top');
				userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[2]);
				await waitFor(() => expect(getTopLevelLikeLabels()).toEqual(['2 likes', '1 like', '0 likes']));

				expect(screen.getByPlaceholderText('Add a comment...')).toBeEnabled();
			});

			it('still shows the like error toast and no local like when the like request itself fails', async () => {
				getComments.mockResolvedValueOnce([top, newer, older]).mockRejectedValue(loadFailure);
				likeComment.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
				renderPopup();

				await screen.findByText('Top');
				userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[2]);

				expect(await screen.findByText("Couldn't update your like. Try again.")).toBeInTheDocument();
				expect(getTopLevelLikeLabels()).toEqual(['2 likes', '0 likes', '0 likes']);
			});
		});

		describe('when fallbacks overlap because several reloads fail', () => {
			const top = buildComment('c1', 'Top', { likes: ['u8', 'u9'], createdAt: '2024-01-01T00:00:00.000Z' });
			const other = buildComment('c2', 'Other', { createdAt: '2024-02-01T00:00:00.000Z' });
			const savedComment = buildComment('c9', 'Brand new', { createdAt: '2024-06-01T00:00:00.000Z', parentCommentId: null });
			const savedReply = buildComment('r9', 'Reply text', { createdAt: '2024-06-02T00:00:00.000Z', parentCommentId: 'c2' });

			const getTopLevelTexts = () =>
				Array.from(document.querySelectorAll('.comments-popup-list > .comment > .comment-row .comment-text')).map(
					(element) => element.textContent,
				);

			const getTopLevelLikeLabels = () =>
				Array.from(document.querySelectorAll('.comments-popup-list > .comment > .comment-row .comment-util-label')).map(
					(element) => element.textContent,
				);

			const getReplyTexts = () => Array.from(document.querySelectorAll('.comment-reply .comment-text')).map((element) => element.textContent);

			const givenTwoPendingReloads = () => {
				const firstReload = buildDeferred();
				const secondReload = buildDeferred();

				getComments.mockResolvedValueOnce([top, other]).mockReturnValueOnce(firstReload.promise).mockReturnValueOnce(secondReload.promise);

				return { firstReload, secondReload };
			};

			const postMainComment = () => {
				userEvent.type(screen.getByPlaceholderText('Add a comment...'), 'Brand new');
				userEvent.click(screen.getByRole('button', { name: 'Post' }));
			};

			const likeOther = () => userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[1]);

			it('builds the second fallback on the first when a comment is added and then a like is made', async () => {
				const { firstReload, secondReload } = givenTwoPendingReloads();

				addComment.mockResolvedValue(savedComment);
				likeComment.mockResolvedValue({});
				renderPopup();

				await screen.findByText('Top');
				postMainComment();
				await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));
				likeOther();
				await waitFor(() => expect(getComments).toHaveBeenCalledTimes(3));

				firstReload.reject({ code: 'INTERNAL_ERROR', status: 500 });
				await waitFor(() => expect(getTopLevelTexts()).toContain('Brand new'));
				secondReload.reject({ code: 'INTERNAL_ERROR', status: 500 });

				await waitFor(() => expect(getTopLevelLikeLabels()).toContain('1 like'));
				expect(getTopLevelTexts()).toEqual(['Top', 'Other', 'Brand new']);
				expect(getTopLevelLikeLabels()).toEqual(['2 likes', '1 like', '0 likes']);
			});

			it('keeps the added comment when the like fallback runs first', async () => {
				const { firstReload, secondReload } = givenTwoPendingReloads();

				addComment.mockResolvedValue(savedComment);
				likeComment.mockResolvedValue({});
				renderPopup();

				await screen.findByText('Top');
				postMainComment();
				await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));
				likeOther();
				await waitFor(() => expect(getComments).toHaveBeenCalledTimes(3));

				secondReload.reject({ code: 'INTERNAL_ERROR', status: 500 });
				await waitFor(() => expect(getTopLevelLikeLabels()).toContain('1 like'));
				firstReload.reject({ code: 'INTERNAL_ERROR', status: 500 });

				await waitFor(() => expect(getTopLevelTexts()).toContain('Brand new'));
				expect(getTopLevelTexts()).toEqual(['Top', 'Other', 'Brand new']);
				expect(getTopLevelLikeLabels()).toEqual(['2 likes', '1 like', '0 likes']);
			});

			it('keeps both a comment and a reply when both are added before their reloads fail', async () => {
				const { firstReload, secondReload } = givenTwoPendingReloads();

				addComment.mockResolvedValueOnce(savedComment).mockResolvedValueOnce(savedReply);
				renderPopup();

				await screen.findByText('Top');
				postMainComment();
				await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));

				userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[1]);
				userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Reply text');
				userEvent.click(screen.getAllByRole('button', { name: 'Post' })[0]);
				await waitFor(() => expect(getComments).toHaveBeenCalledTimes(3));

				firstReload.reject({ code: 'INTERNAL_ERROR', status: 500 });
				await waitFor(() => expect(getTopLevelTexts()).toContain('Brand new'));
				secondReload.reject({ code: 'INTERNAL_ERROR', status: 500 });

				await waitFor(() => expect(getReplyTexts()).toEqual(['Reply text']));
				expect(getTopLevelTexts()).toEqual(['Top', 'Brand new', 'Other']);
			});

			it('shows no load error after overlapping fallbacks', async () => {
				const { firstReload, secondReload } = givenTwoPendingReloads();

				addComment.mockResolvedValue(savedComment);
				likeComment.mockResolvedValue({});
				renderPopup();

				await screen.findByText('Top');
				postMainComment();
				await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));
				likeOther();
				await waitFor(() => expect(getComments).toHaveBeenCalledTimes(3));

				firstReload.reject({ code: 'INTERNAL_ERROR', status: 500 });
				secondReload.reject({ code: 'INTERNAL_ERROR', status: 500 });

				await waitFor(() => expect(getTopLevelLikeLabels()).toContain('1 like'));
				expect(screen.queryByText("Couldn't load comments")).not.toBeInTheDocument();
				expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
			});
		});

		it('shows a toast when the like fails', async () => {
			getComments.mockResolvedValue(topComments);
			likeComment.mockRejectedValue({ code: 'COMMENT_NOT_FOUND', status: 404 });
			renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[0]);

			expect(await screen.findByText('This comment no longer exists')).toBeInTheDocument();
		});
	});

	describe('as a guest', () => {
		it('lets the guest read every comment, requesting them without a token', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup({ user: null });

			expect(await screen.findByText('Most liked comment')).toBeInTheDocument();
			expect(screen.getByText('Newest comment')).toBeInTheDocument();
			expect(getComments).toHaveBeenCalledWith({ userPostId: 'post1', jwtToken: null });
		});

		it('sends the guest to /log-in with the same URL, hash included, when the comment box is clicked', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup({ user: null, entry: '/user/user2/posts#post1' });

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getByPlaceholderText('Add a comment...'));

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
		});

		it('sends the guest to /log-in when a comment heart is clicked', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup({ user: null });

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[0]);

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
			expect(likeComment).not.toHaveBeenCalled();
		});

		it('sends the guest to /log-in when Reply is clicked', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup({ user: null });

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
		});

		it('shows Post disabled, and clicking it adds no comment and does not redirect', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup({ user: null });

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
			expect(mockNavigate).not.toHaveBeenCalled();
			expect(addComment).not.toHaveBeenCalled();
		});
	});

	describe('closing', () => {
		it('calls onClose when the Close button is clicked', async () => {
			getComments.mockResolvedValue(topComments);
			const { onClose } = renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('calls onClose when Escape is pressed', async () => {
			getComments.mockResolvedValue(topComments);
			const { onClose } = renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.keyboard('{esc}');

			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	describe('replies', () => {
		describe('when the reply is saved but the reload fails', () => {
			const parentWithReply = buildComment('c1', 'Parent', {
				createdAt: '2024-01-01T00:00:00.000Z',
				replies: [buildComment('r1', 'oldest reply', { createdAt: '2024-01-02T00:00:00.000Z', parentCommentId: 'c1' })],
			});
			const otherComment = buildComment('c2', 'Other comment', { createdAt: '2024-01-03T00:00:00.000Z' });
			const savedReply = buildComment('r2', 'Thanks', { createdAt: '2024-06-01T00:00:00.000Z', parentCommentId: 'c1' });

			const getReplyTexts = () => Array.from(document.querySelectorAll('.comment-reply .comment-text')).map((element) => element.textContent);

			const postReply = () => {
				userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);
				userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
				userEvent.click(screen.getAllByRole('button', { name: 'Post' })[0]);
			};

			beforeEach(() => {
				getComments.mockResolvedValueOnce([parentWithReply, otherComment]).mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
				addComment.mockResolvedValue(savedReply);
			});

			it('passes the saved reply to the reload', async () => {
				renderPopup();

				await screen.findByText('Parent');
				postReply();

				await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2));
				expect(addComment).toHaveBeenCalledWith({
					userPostId: 'post1',
					text: '@alice Thanks',
					parentCommentId: 'c1',
					mentionedUserId: 'user3',
					jwtToken: 'token123',
				});
			});

			it('appends the reply after the existing replies and shows the replies', async () => {
				renderPopup();

				await screen.findByText('Parent');
				postReply();

				await waitFor(() => expect(getReplyTexts()).toEqual(['oldest reply', 'Thanks']));
			});

			it('keeps the other comments in place', async () => {
				renderPopup();

				await screen.findByText('Parent');
				postReply();
				await waitFor(() => expect(getReplyTexts()).toEqual(['oldest reply', 'Thanks']));

				const topLevelTexts = Array.from(document.querySelectorAll('.comments-popup-list > .comment > .comment-row .comment-text')).map(
					(element) => element.textContent,
				);

				expect(topLevelTexts).toEqual(['Parent', 'Other comment']);
			});

			it('shows no load error, no form message and no toast', async () => {
				renderPopup();

				await screen.findByText('Parent');
				postReply();
				await waitFor(() => expect(getReplyTexts()).toEqual(['oldest reply', 'Thanks']));

				expect(screen.queryByText("Couldn't load comments")).not.toBeInTheDocument();
				expect(screen.queryByText("Couldn't post your reply. Try again.")).not.toBeInTheDocument();
				expect(document.querySelector('.add-comment-form-error')).not.toBeInTheDocument();
				expect(document.querySelector('.comments-popup-message')).not.toBeInTheDocument();
				expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
			});

			it('keeps the main comment box usable', async () => {
				renderPopup();

				await screen.findByText('Parent');
				postReply();
				await waitFor(() => expect(getReplyTexts()).toEqual(['oldest reply', 'Thanks']));

				expect(screen.getByPlaceholderText('Add a comment...')).toBeEnabled();
			});

			it('reports the locally updated list to the post card', async () => {
				const { onCommentsLoaded } = renderPopup();

				await screen.findByText('Parent');
				postReply();

				await waitFor(() =>
					expect(onCommentsLoaded).toHaveBeenLastCalledWith([
						{ ...parentWithReply, replies: [...parentWithReply.replies, savedReply] },
						otherComment,
					]),
				);
			});
		});

		it('replies to a reply under the top-level comment, prefilled with and mentioning the author of that reply', async () => {
			const reply = buildComment('r1', 'a reply', { userId: { _id: 'user4', username: 'bob' }, parentCommentId: 'c1' });

			getComments.mockResolvedValue([buildComment('c1', 'Parent', { replies: [reply] })]);
			addComment.mockResolvedValue(buildComment('r2', '@bob Agreed', { parentCommentId: 'c1' }));
			renderPopup();

			await screen.findByText('Parent');
			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[1]);

			expect(screen.getByPlaceholderText('Write a reply...')).toHaveValue('@bob ');

			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Agreed');
			userEvent.click(screen.getAllByRole('button', { name: 'Post' })[0]);

			await waitFor(() =>
				expect(addComment).toHaveBeenCalledWith({
					userPostId: 'post1',
					text: '@bob Agreed',
					parentCommentId: 'c1',
					mentionedUserId: 'user4',
					jwtToken: 'token123',
				}),
			);
		});

		it('shows a saved mention in a loaded reply as a link to the profile', async () => {
			const reply = buildComment('r1', '@alice thanks', { parentCommentId: 'c1', mentionedUserId: { _id: 'user3', username: 'alice' } });

			getComments.mockResolvedValue([buildComment('c1', 'Parent', { replies: [reply] })]);
			renderPopup();

			await screen.findByText('Parent');
			userEvent.click(screen.getByRole('button', { name: 'View replies' }));

			expect(document.querySelector('.comment-reply .comment-mention')).toHaveAttribute('href', '/user/user3');
		});

		it('shows the replies of a comment oldest first after "View replies" is clicked', async () => {
			const withReplies = [
				buildComment('c1', 'Parent', {
					replies: [buildComment('r1', 'oldest reply'), buildComment('r2', 'newest reply')],
				}),
			];

			getComments.mockResolvedValue(withReplies);
			renderPopup();

			await screen.findByText('Parent');
			userEvent.click(screen.getByRole('button', { name: 'View replies' }));

			const replyTexts = Array.from(document.querySelectorAll('.comment-reply .comment-text')).map((element) => element.textContent);

			expect(replyTexts).toEqual(['oldest reply', 'newest reply']);
		});
	});

	describe('the likes list of a comment', () => {
		const likers = [
			{ _id: 'user9', username: 'newestliker' },
			{ _id: 'user8', username: 'olderliker' },
		];

		const openLikes = async () => {
			getComments.mockResolvedValue(topComments);
			getCommentLikes.mockResolvedValue(likers);

			const rendered = renderPopup();

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getByRole('button', { name: '2 likes' }));
			await screen.findByText('newestliker');

			return rendered;
		};

		it('opens over the comments popup, which stays rendered underneath', async () => {
			await openLikes();

			expect(screen.getByRole('heading', { name: 'Likes' })).toBeInTheDocument();
			expect(screen.getByRole('heading', { name: 'Comments' })).toBeInTheDocument();
			expect(screen.getByText('Newest comment')).toBeInTheDocument();
		});

		it('loads the likes of the clicked comment', async () => {
			await openLikes();

			expect(getCommentLikes).toHaveBeenCalledTimes(1);
			expect(getCommentLikes).toHaveBeenCalledWith(expect.objectContaining({ commentId: 'c1', jwtToken: 'token123' }));
		});

		it('shows a comment with no likes as plain text, so only comments with likes open a list', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup();

			await screen.findByText('Most liked comment');

			expect(screen.getByText('0 likes')).toBeInTheDocument();
			expect(screen.getAllByRole('button', { name: /\blikes?$/ })).toHaveLength(1);
		});

		it('closes only the likes popup with its Close button and returns to the comments, which are not reloaded', async () => {
			const { onClose } = await openLikes();

			userEvent.click(within(screen.getByRole('heading', { name: 'Likes' }).closest('.popup-body')).getByRole('button', { name: 'Close' }));

			expect(screen.queryByRole('heading', { name: 'Likes' })).not.toBeInTheDocument();
			expect(screen.getByText('Most liked comment')).toBeInTheDocument();
			expect(onClose).not.toHaveBeenCalled();
			expect(getComments).toHaveBeenCalledTimes(1);
		});

		it('closes only the likes popup on Escape', async () => {
			const { onClose } = await openLikes();

			userEvent.keyboard('{Escape}');

			expect(screen.queryByRole('heading', { name: 'Likes' })).not.toBeInTheDocument();
			expect(screen.getByRole('heading', { name: 'Comments' })).toBeInTheDocument();
			expect(onClose).not.toHaveBeenCalled();
		});

		it('closes the comments popup on Escape once the likes popup is gone', async () => {
			const { onClose } = await openLikes();

			userEvent.keyboard('{Escape}');
			userEvent.keyboard('{Escape}');

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes the comments popup as well when an account is clicked', async () => {
			const { onClose } = await openLikes();

			userEvent.click(screen.getByRole('link', { name: /olderliker/ }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('links the accounts to their profiles', async () => {
			await openLikes();

			expect(screen.getByRole('link', { name: /newestliker/ })).toHaveAttribute('href', '/user/user9');
			expect(screen.getByRole('link', { name: /olderliker/ })).toHaveAttribute('href', '/user/user8');
		});

		it('is open to a guest', async () => {
			getComments.mockResolvedValue(topComments);
			getCommentLikes.mockResolvedValue(likers);
			renderPopup({ user: null });

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getByRole('button', { name: '2 likes' }));

			expect(await screen.findByText('newestliker')).toBeInTheDocument();
			expect(mockNavigate).not.toHaveBeenCalled();
		});
	});
});
