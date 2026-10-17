import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getComments, addComment, likeComment } from '../../services/commentService';

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

		it('sends the guest to /log-in when Post is clicked, without adding a comment', async () => {
			getComments.mockResolvedValue(topComments);
			renderPopup({ user: null });

			await screen.findByText('Most liked comment');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
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
});
