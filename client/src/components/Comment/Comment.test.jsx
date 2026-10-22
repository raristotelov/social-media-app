import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { likeComment, unlikeComment, addComment } from '../../services/commentService';

import ToastProvider from '../ToastProvider/ToastProvider';

import Comment from './Comment';

jest.mock('../../services/commentService');

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useNavigate: () => mockNavigate,
}));

const loggedInUser = { _id: 'user1', username: 'johndoe' };

const author = { _id: 'user3', username: 'alice', profilePicture: { imageUrl: 'https://example.com/alice.jpg' } };

const baseComment = { _id: 'c1', text: 'Great photo', likes: [], userId: author, replies: [] };

const replies = [
	{ _id: 'r1', text: 'first reply', likes: [], userId: { _id: 'user4', username: 'bob' } },
	{ _id: 'r2', text: 'second reply', likes: [], userId: { _id: 'user5', username: 'carol' } },
];

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const renderComment = ({
	comment = baseComment,
	user = loggedInUser,
	onReload = jest.fn().mockResolvedValue(undefined),
	entry = '/user/user2/posts#post1',
	endSession = jest.fn(),
} = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser: user, endSession }}>
			<ToastProvider>
				<MemoryRouter initialEntries={[entry]}>
					<Comment comment={comment} userPostId='post1' onReload={onReload} />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onReload, endSession };
};

const getReplyTexts = (container) => Array.from(container.querySelectorAll('.comment-reply .comment-text')).map((element) => element.textContent);

describe('Comment', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('content', () => {
		it('shows the comment text and the username of its author', () => {
			renderComment();

			expect(screen.getByText('Great photo')).toBeInTheDocument();
			expect(screen.getByText('alice')).toBeInTheDocument();
		});

		it('links the username to the profile of the author', () => {
			renderComment();

			expect(screen.getByRole('link', { name: 'alice' })).toHaveAttribute('href', '/user/user3');
		});

		it('links the avatar to the profile of the author', () => {
			const { container } = renderComment();

			expect(container.querySelector('.comment-avatar-link')).toHaveAttribute('href', '/user/user3');
		});

		it('shows the like count with the singular label for one like', () => {
			renderComment({ comment: { ...baseComment, likes: ['user9'] } });

			expect(screen.getByText('1 like')).toBeInTheDocument();
		});

		it('shows the like count with the plural label otherwise', () => {
			renderComment({ comment: { ...baseComment, likes: ['user8', 'user9'] } });

			expect(screen.getByText('2 likes')).toBeInTheDocument();
		});

		it('shows "0 likes" for a comment nobody liked', () => {
			renderComment();

			expect(screen.getByText('0 likes')).toBeInTheDocument();
		});

		it('does not fail for a comment whose author was deleted', () => {
			renderComment({ comment: { ...baseComment, userId: null } });

			expect(screen.getByText('Great photo')).toBeInTheDocument();
			expect(screen.queryByRole('link')).not.toBeInTheDocument();
		});
	});

	describe('replies', () => {
		it('hides the replies until "View replies" is clicked', () => {
			const { container } = renderComment({ comment: { ...baseComment, replies } });

			expect(getReplyTexts(container)).toEqual([]);
			expect(screen.getByRole('button', { name: 'View replies' })).toBeInTheDocument();
		});

		it('shows the replies in the order given, oldest first, after "View replies" is clicked', () => {
			const { container } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));

			expect(getReplyTexts(container)).toEqual(['first reply', 'second reply']);
		});

		it('swaps "View replies" for "Hide replies" once the replies are shown', () => {
			renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));

			expect(screen.queryByRole('button', { name: 'View replies' })).not.toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Hide replies' })).toBeInTheDocument();
		});

		it('hides the replies again when "Hide replies" is clicked', () => {
			const { container } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(screen.getByRole('button', { name: 'Hide replies' }));

			expect(getReplyTexts(container)).toEqual([]);
		});

		it('offers no "View replies" for a comment without replies', () => {
			renderComment();

			expect(screen.queryByRole('button', { name: 'View replies' })).not.toBeInTheDocument();
		});

		it('offers Reply on the comment and on each of its replies, and "View replies" only on the comment', () => {
			renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));

			expect(screen.getAllByRole('button', { name: 'Reply' })).toHaveLength(3);
			expect(screen.queryByRole('button', { name: 'View replies' })).not.toBeInTheDocument();
		});

		it('offers no "View replies" or "Hide replies" on a reply', () => {
			const { container } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));

			expect(container.querySelectorAll('.comment-reply .comment-replies')).toHaveLength(0);
			expect(screen.getAllByRole('button', { name: 'Hide replies' })).toHaveLength(1);
		});
	});

	describe('the mention in a reply', () => {
		const mentionedAlice = { _id: 'user3', username: 'alice' };

		const renderWithReply = (reply) => {
			const rendered = renderComment({
				comment: { ...baseComment, replies: [{ _id: 'r1', likes: [], userId: { _id: 'user4', username: 'bob' }, ...reply }] },
			});

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));

			return rendered;
		};

		it('shows the leading @username as a link to the profile of the mentioned user', () => {
			const { container } = renderWithReply({ text: '@alice thanks', mentionedUserId: mentionedAlice });

			const mention = container.querySelector('.comment-reply .comment-mention');

			expect(mention).toHaveTextContent('@alice');
			expect(mention).toHaveAttribute('href', '/user/user3');
		});

		it('keeps the rest of the reply as plain text after the link', () => {
			const { container } = renderWithReply({ text: '@alice thanks a lot', mentionedUserId: mentionedAlice });

			const text = container.querySelector('.comment-reply .comment-text');

			expect(text).toHaveTextContent('@alice thanks a lot');
			expect(text.querySelectorAll('a')).toHaveLength(1);
			expect(text.lastChild.textContent).toBe(' thanks a lot');
		});

		it('links a reply that is only the mention', () => {
			const { container } = renderWithReply({ text: '@alice', mentionedUserId: mentionedAlice });

			expect(container.querySelector('.comment-reply .comment-mention')).toHaveAttribute('href', '/user/user3');
		});

		it('shows a plain reply as plain text when no user is mentioned', () => {
			const { container } = renderWithReply({ text: '@alice thanks', mentionedUserId: null });

			expect(container.querySelector('.comment-reply .comment-mention')).not.toBeInTheDocument();
			expect(container.querySelector('.comment-reply .comment-text')).toHaveTextContent('@alice thanks');
		});

		it('shows a reply without the field as plain text', () => {
			const { container } = renderWithReply({ text: '@alice thanks' });

			expect(container.querySelector('.comment-reply .comment-mention')).not.toBeInTheDocument();
		});

		it('shows the reply as plain text when it no longer starts with the @username of the mentioned user', () => {
			const { container } = renderWithReply({ text: 'thanks @alice', mentionedUserId: mentionedAlice });

			expect(container.querySelector('.comment-reply .comment-mention')).not.toBeInTheDocument();
			expect(container.querySelector('.comment-reply .comment-text')).toHaveTextContent('thanks @alice');
		});

		it('shows the reply as plain text when it starts with a different @name', () => {
			const { container } = renderWithReply({ text: '@carol thanks', mentionedUserId: mentionedAlice });

			expect(container.querySelector('.comment-reply .comment-mention')).not.toBeInTheDocument();
		});

		it('shows the reply as plain text when the mentioned user is only an id, not populated', () => {
			const { container } = renderWithReply({ text: '@alice thanks', mentionedUserId: 'user3' });

			expect(container.querySelector('.comment-reply .comment-mention')).not.toBeInTheDocument();
			expect(container.querySelector('.comment-reply .comment-text')).toHaveTextContent('@alice thanks');
		});

		it('lets a guest follow the mention link', () => {
			const { container } = renderComment({
				user: null,
				comment: {
					...baseComment,
					replies: [
						{ _id: 'r1', text: '@alice hi', likes: [], userId: { _id: 'user4', username: 'bob' }, mentionedUserId: mentionedAlice },
					],
				},
			});

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));

			expect(container.querySelector('.comment-mention')).toHaveAttribute('href', '/user/user3');
			expect(mockNavigate).not.toHaveBeenCalled();
		});
	});

	describe('liking a comment', () => {
		it('likes the comment and then reloads the comments', async () => {
			likeComment.mockResolvedValue({});
			const { onReload } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
			expect(likeComment).toHaveBeenCalledWith({ commentId: 'c1', jwtToken: 'token123' });
			expect(unlikeComment).not.toHaveBeenCalled();
		});

		it('reloads without a comment and describes the like it just made', async () => {
			likeComment.mockResolvedValue({ _id: 'c1', likes: ['user1'] });
			const { onReload } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
			expect(onReload).toHaveBeenCalledWith(undefined, { commentId: 'c1', userId: 'user1', isLiked: true });
		});

		it('describes the unlike it just made with isLiked false', async () => {
			unlikeComment.mockResolvedValue({});
			const { onReload } = renderComment({ comment: { ...baseComment, likes: ['user1'] } });

			userEvent.click(screen.getByRole('button', { name: 'Unlike comment' }));

			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
			expect(onReload).toHaveBeenCalledWith(undefined, { commentId: 'c1', userId: 'user1', isLiked: false });
		});

		it('describes a like on a reply with the id of the reply', async () => {
			likeComment.mockResolvedValue({});
			const { onReload } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[1]);

			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
			expect(onReload).toHaveBeenCalledWith(undefined, { commentId: 'r1', userId: 'user1', isLiked: true });
		});

		it('shows no toast when the like was saved and the reload that follows is handled by the parent', async () => {
			likeComment.mockResolvedValue({});
			const { onReload } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
			expect(screen.queryByText("Couldn't update your like. Try again.")).not.toBeInTheDocument();
		});

		it('unlikes a comment the user already liked', async () => {
			unlikeComment.mockResolvedValue({});
			const { onReload } = renderComment({ comment: { ...baseComment, likes: ['user1'] } });

			userEvent.click(screen.getByRole('button', { name: 'Unlike comment' }));

			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
			expect(unlikeComment).toHaveBeenCalledWith({ commentId: 'c1', jwtToken: 'token123' });
			expect(likeComment).not.toHaveBeenCalled();
		});

		it('marks the heart as pressed only for a comment the user liked', () => {
			renderComment({ comment: { ...baseComment, likes: ['user1'] } });

			expect(screen.getByRole('button', { name: 'Unlike comment' })).toHaveAttribute('aria-pressed', 'true');
		});

		it('does not mark the heart as pressed for a comment liked by someone else', () => {
			renderComment({ comment: { ...baseComment, likes: ['user9'] } });

			expect(screen.getByRole('button', { name: 'Like comment' })).toHaveAttribute('aria-pressed', 'false');
		});

		it('sends one request when the heart is clicked twice before the first returns', async () => {
			const request = buildDeferred();

			likeComment.mockReturnValue(request.promise);
			const { onReload } = renderComment();

			userEvent.dblClick(screen.getByRole('button', { name: 'Like comment' }));

			expect(likeComment).toHaveBeenCalledTimes(1);

			request.resolve({});
			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
		});

		it('allows liking again after the previous request finished', async () => {
			likeComment.mockResolvedValue({});
			const { onReload } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));
			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			await waitFor(() => expect(likeComment).toHaveBeenCalledTimes(2));
		});

		it('shows the like fallback copy as a toast when the request fails', async () => {
			likeComment.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { onReload } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			expect(await screen.findByText("Couldn't update your like. Try again.")).toBeInTheDocument();
			expect(onReload).not.toHaveBeenCalled();
		});

		it('shows the like fallback copy as a toast when the failure is not a request error', async () => {
			likeComment.mockRejectedValue(new Error('network down'));
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			expect(await screen.findByText("Couldn't update your like. Try again.")).toBeInTheDocument();
		});

		it('shows the COMMENT_NOT_FOUND copy as a toast when the comment no longer exists', async () => {
			likeComment.mockRejectedValue({ code: 'COMMENT_NOT_FOUND', status: 404 });
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			expect(await screen.findByText('This comment no longer exists')).toBeInTheDocument();
		});

		it('shows the like fallback copy as a toast when unliking fails', async () => {
			unlikeComment.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderComment({ comment: { ...baseComment, likes: ['user1'] } });

			userEvent.click(screen.getByRole('button', { name: 'Unlike comment' }));

			expect(await screen.findByText("Couldn't update your like. Try again.")).toBeInTheDocument();
		});

		it('ends the session and shows no toast when the like fails with UNAUTHENTICATED', async () => {
			likeComment.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByText("Couldn't update your like. Try again.")).not.toBeInTheDocument();
		});

		it('allows liking again after a failure', async () => {
			likeComment.mockRejectedValueOnce({ code: 'INTERNAL_ERROR', status: 500 }).mockResolvedValueOnce({});
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));
			await screen.findByText("Couldn't update your like. Try again.");
			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			await waitFor(() => expect(likeComment).toHaveBeenCalledTimes(2));
		});

		it('likes a reply the same way', async () => {
			likeComment.mockResolvedValue({});
			const { onReload } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[1]);

			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
			expect(likeComment).toHaveBeenCalledWith({ commentId: 'r1', jwtToken: 'token123' });
		});
	});

	describe('replying', () => {
		it('opens a reply box when Reply is clicked', () => {
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));

			expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();
		});

		it('puts the cursor in the reply box as soon as it opens', () => {
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));

			expect(screen.getByPlaceholderText('Write a reply...')).toHaveFocus();
		});

		it('puts the cursor after the mention in the reply box', () => {
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));

			expect(screen.getByPlaceholderText('Write a reply...').selectionStart).toBe('@alice '.length);
		});

		it('focuses the reply box opened under a reply', () => {
			const { container } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(within(container.querySelectorAll('.comment-reply')[0]).getByRole('button', { name: 'Reply' }));

			expect(screen.getByPlaceholderText('Write a reply...')).toHaveFocus();
		});

		it('prefills the reply box with the @username of the author of the comment', () => {
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));

			expect(screen.getByPlaceholderText('Write a reply...')).toHaveValue('@alice ');
		});

		it('keeps Post disabled while the box holds only the mention', () => {
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));

			expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
		});

		it('enables Post once text follows the mention', () => {
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');

			expect(screen.getByRole('button', { name: 'Post' })).toBeEnabled();
		});

		it('prefills the reply box of a reply with the @username of the author of that reply', () => {
			const { container } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(within(container.querySelectorAll('.comment-reply')[0]).getByRole('button', { name: 'Reply' }));

			expect(screen.getByPlaceholderText('Write a reply...')).toHaveValue('@bob ');
		});

		it('opens the reply box under the reply that was clicked', () => {
			const { container } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(within(container.querySelectorAll('.comment-reply')[1]).getByRole('button', { name: 'Reply' }));

			expect(within(container.querySelectorAll('.comment-reply')[1]).getByPlaceholderText('Write a reply...')).toHaveValue('@carol ');
			expect(within(container.querySelectorAll('.comment-reply')[0]).queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
		});

		it('closes the reply box when Reply is clicked again', () => {
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.click(screen.getByRole('button', { name: 'Reply' }));

			expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
		});

		it('keeps Post disabled while the reply is empty or only spaces', () => {
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), '   ');

			expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
		});

		it('sends the reply to the comment, with the id of the mentioned author', async () => {
			addComment.mockResolvedValue({ _id: 'r9' });
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() =>
				expect(addComment).toHaveBeenCalledWith({
					userPostId: 'post1',
					text: '@alice Thanks',
					parentCommentId: 'c1',
					mentionedUserId: 'user3',
					jwtToken: 'token123',
				}),
			);
		});

		it('sends a reply on a reply under the top-level comment, mentioning the author of that reply', async () => {
			addComment.mockResolvedValue({ _id: 'r9' });
			const { container } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(within(container.querySelectorAll('.comment-reply')[0]).getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Agreed');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

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

		it('keeps the replies shown and closes the reply box after a reply on a reply', async () => {
			const savedReply = { _id: 'r9', text: '@bob Agreed', parentCommentId: 'c1', likes: [] };

			addComment.mockResolvedValue(savedReply);
			const { container, onReload } = renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(within(container.querySelectorAll('.comment-reply')[0]).getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Agreed');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() => expect(onReload).toHaveBeenCalledWith(savedReply));
			await waitFor(() => expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument());
			expect(getReplyTexts(container)).toEqual(['first reply', 'second reply']);
		});

		it('sends no mentioned user when the mention was removed from the start of the reply', async () => {
			addComment.mockResolvedValue({ _id: 'r9' });
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.clear(screen.getByPlaceholderText('Write a reply...'));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() =>
				expect(addComment).toHaveBeenCalledWith({
					userPostId: 'post1',
					text: 'Thanks',
					parentCommentId: 'c1',
					mentionedUserId: null,
					jwtToken: 'token123',
				}),
			);
		});

		it('sends no mentioned user when the mention is no longer at the start of the reply', async () => {
			addComment.mockResolvedValue({ _id: 'r9' });
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.clear(screen.getByPlaceholderText('Write a reply...'));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks @alice');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() => expect(addComment).toHaveBeenCalledWith(expect.objectContaining({ text: 'Thanks @alice', mentionedUserId: null })));
		});

		it('sends no mentioned user when the author of the comment was deleted', async () => {
			addComment.mockResolvedValue({ _id: 'r9' });
			renderComment({ comment: { ...baseComment, userId: null } });

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.clear(screen.getByPlaceholderText('Write a reply...'));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), '@undefined hi');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() => expect(addComment).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserId: null })));
		});

		it('reloads the comments and closes the reply box after a successful reply', async () => {
			addComment.mockResolvedValue({ _id: 'r9' });
			const { onReload } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument());
		});

		it('passes the saved reply to the reload', async () => {
			const savedReply = { _id: 'r9', text: 'Thanks', parentCommentId: 'c1', likes: [] };

			addComment.mockResolvedValue(savedReply);
			const { onReload } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() => expect(onReload).toHaveBeenCalledWith(savedReply));
		});

		it('shows the replies after a successful reply', async () => {
			addComment.mockResolvedValue({ _id: 'r9' });
			renderComment({ comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			expect(await screen.findByRole('button', { name: 'Hide replies' })).toBeInTheDocument();
		});

		it('shows the reply fallback copy under the box when the request fails', async () => {
			addComment.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			expect(await screen.findByText("Couldn't post your reply. Try again.")).toBeInTheDocument();
		});

		it.each([
			['COMMENT_TEXT_REQUIRED', 400, "Comment can't be empty"],
			['COMMENT_NOT_FOUND', 404, 'This comment no longer exists'],
			['POST_NOT_FOUND', 404, 'This post no longer exists'],
		])('shows the %s copy under the box when the reply is rejected', async (code, status, copy) => {
			addComment.mockRejectedValue({ code, status });
			renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			expect(await screen.findByText(copy)).toBeInTheDocument();
		});

		it('keeps the reply box and the typed text open after a failure', async () => {
			addComment.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { onReload } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));
			await screen.findByText("Couldn't post your reply. Try again.");

			expect(screen.getByPlaceholderText('Write a reply...')).toHaveValue('@alice Thanks');
			expect(onReload).not.toHaveBeenCalled();
		});

		it('ends the session and shows no message when the reply fails with UNAUTHENTICATED', async () => {
			addComment.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderComment();

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));
			userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Thanks');
			userEvent.click(screen.getByRole('button', { name: 'Post' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByText("Couldn't post your reply. Try again.")).not.toBeInTheDocument();
		});
	});

	describe('as a guest', () => {
		it('shows the comment and its heart and Reply controls', () => {
			renderComment({ user: null });

			expect(screen.getByText('Great photo')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Like comment' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
		});

		it('sends the guest to /log-in with the current URL, hash included, when the heart is clicked', () => {
			renderComment({ user: null });

			userEvent.click(screen.getByRole('button', { name: 'Like comment' }));

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
			expect(likeComment).not.toHaveBeenCalled();
		});

		it('sends the guest to /log-in with the current URL when Reply is clicked', () => {
			renderComment({ user: null });

			userEvent.click(screen.getByRole('button', { name: 'Reply' }));

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
			expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
		});

		it('sends the guest to /log-in when Reply on a reply is clicked, opening no reply box', () => {
			const { container } = renderComment({ user: null, comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(within(container.querySelectorAll('.comment-reply')[0]).getByRole('button', { name: 'Reply' }));

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
			expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
		});

		it('sends the guest to /log-in when the heart of a reply is clicked', () => {
			renderComment({ user: null, comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));
			userEvent.click(screen.getAllByRole('button', { name: 'Like comment' })[1]);

			expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post1' } });
			expect(likeComment).not.toHaveBeenCalled();
		});

		it('still lets the guest view the replies', () => {
			const { container } = renderComment({ user: null, comment: { ...baseComment, replies } });

			userEvent.click(screen.getByRole('button', { name: 'View replies' }));

			expect(getReplyTexts(container)).toEqual(['first reply', 'second reply']);
			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it('still lets the guest open the profile of the author', () => {
			renderComment({ user: null });

			expect(screen.getByRole('link', { name: 'alice' })).toHaveAttribute('href', '/user/user3');
		});
	});
});
