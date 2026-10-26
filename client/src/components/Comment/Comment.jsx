import { useContext, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import useLoginRedirect from '../../hooks/useLoginRedirect';
import { likeComment, unlikeComment, addComment } from '../../services/commentService';
import { ACTION_FALLBACK_MESSAGES } from '../../constants/errorMessages';
import { USER_LIST_TYPES } from '../../constants/userLists';
import { getErrorMessage, isUnauthenticatedError } from '../../utils/errors';

import AddCommentForm from '../AddCommentForm/AddCommentForm';
import ProfilePicture from '../ProfilePicture/ProfilePicture';
import UserListPopup from '../UserListPopup/UserListPopup';
import HeartIcon from '../icons/Heart';

import './Comment.css';

const AuthorLink = ({ authorId, className, children }) => {
	if (!authorId) {
		return <span className={className}>{children}</span>;
	}

	return (
		<Link to={`/user/${authorId}`} className={className}>
			{children}
		</Link>
	);
};

const Comment = ({ comment, userPostId, onReload, onCloseComments, isReply = false, parentCommentId = null }) => {
	const [showReplies, setShowReplies] = useState(false);
	const [isReplying, setIsReplying] = useState(false);
	const [isLikesPopupOpen, setIsLikesPopupOpen] = useState(false);
	const isUpdatingLikeRef = useRef(false);

	const { jwtToken, loggedInUser, endSession } = useContext(LoggedInUserContext);
	const { showToast } = useContext(ToastContext);
	const redirectToLogin = useLoginRedirect();

	const author = comment.userId || {};
	const likes = comment.likes || [];
	const hasLikedComment = likes.includes(loggedInUser?._id);
	const likesLabel = `${likes.length} ${likes.length === 1 ? 'like' : 'likes'}`;
	const replies = comment.replies || [];

	const replyMention = `@${author.username}`;

	const mentionedUser = comment.mentionedUserId;
	const savedMention = mentionedUser ? `@${mentionedUser.username}` : null;
	const hasSavedMention = Boolean(savedMention) && comment.text.startsWith(savedMention);

	const toggleLike = async () => {
		if (!loggedInUser) {
			redirectToLogin();

			return;
		}

		if (isUpdatingLikeRef.current) {
			return;
		}

		isUpdatingLikeRef.current = true;

		try {
			if (hasLikedComment) {
				await unlikeComment({ commentId: comment._id, jwtToken });
			} else {
				await likeComment({ commentId: comment._id, jwtToken });
			}

			await onReload(undefined, { commentId: comment._id, userId: loggedInUser._id, isLiked: !hasLikedComment });
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				endSession();
			} else {
				showToast(getErrorMessage(error, ACTION_FALLBACK_MESSAGES.UPDATE_LIKE));
			}
		} finally {
			isUpdatingLikeRef.current = false;
		}
	};

	const toggleReplyForm = () => {
		if (!loggedInUser) {
			redirectToLogin();

			return;
		}

		setIsReplying((state) => !state);
	};

	const submitReply = async (text) => {
		const addedReply = await addComment({
			userPostId,
			text,
			parentCommentId: isReply ? parentCommentId : comment._id,
			mentionedUserId: author._id && text.trim().startsWith(replyMention) ? author._id : null,
			jwtToken,
		});

		setIsReplying(false);

		if (!isReply) {
			setShowReplies(true);
		}

		await onReload(addedReply);
	};

	const classNames = isReply ? 'comment comment-reply' : 'comment';

	return (
		<div className={classNames}>
			<div className='comment-row'>
				<AuthorLink authorId={author._id} className='comment-avatar-link'>
					<ProfilePicture imageUrl={author.profilePicture?.imageUrl} className='comment-avatar' />
				</AuthorLink>

				<div className='comment-content'>
					<AuthorLink authorId={author._id} className='comment-username'>
						{author.username}
					</AuthorLink>

					<p className='comment-text'>
						{hasSavedMention ? (
							<>
								<Link to={`/user/${mentionedUser._id}`} className='comment-mention'>
									{savedMention}
								</Link>

								{comment.text.slice(savedMention.length)}
							</>
						) : (
							comment.text
						)}
					</p>

					<div className='comment-utils'>
						<button
							type='button'
							className='comment-like-button'
							aria-label={hasLikedComment ? 'Unlike comment' : 'Like comment'}
							aria-pressed={hasLikedComment}
							onClick={toggleLike}
						>
							<HeartIcon
								fillColorProp={hasLikedComment ? 'var(--brand-red)' : 'none'}
								iconColorProp={hasLikedComment ? 'var(--brand-red)' : 'var(--text-primary)'}
							/>
						</button>

						{likes.length ? (
							<button type='button' className='comment-util-label comment-util-button' onClick={() => setIsLikesPopupOpen(true)}>
								{likesLabel}
							</button>
						) : (
							<span className='comment-util-label'>{likesLabel}</span>
						)}

						<button type='button' className='comment-util-button' onClick={toggleReplyForm}>
							Reply
						</button>

						{!isReply && replies.length && !showReplies ? (
							<button type='button' className='comment-util-button' onClick={() => setShowReplies(true)}>
								View replies
							</button>
						) : null}
					</div>

					{isReplying ? (
						<AddCommentForm
							onSubmit={submitReply}
							placeholder='Write a reply...'
							initialText={`${replyMention} `}
							shouldFocusOnMount
							fallbackMessage={ACTION_FALLBACK_MESSAGES.ADD_REPLY}
						/>
					) : null}
				</div>
			</div>

			{!isReply && showReplies ? (
				<div className='comment-replies'>
					<button type='button' className='comment-hide-replies' onClick={() => setShowReplies(false)}>
						<span className='comment-hide-replies-line' aria-hidden='true' />
						Hide replies
					</button>

					{replies.map((reply) => (
						<Comment
							key={reply._id}
							comment={reply}
							userPostId={userPostId}
							onReload={onReload}
							onCloseComments={onCloseComments}
							isReply
							parentCommentId={comment._id}
						/>
					))}
				</div>
			) : null}

			{isLikesPopupOpen ? (
				<UserListPopup
					commentId={comment._id}
					listType={USER_LIST_TYPES.COMMENT_LIKES}
					onClose={() => setIsLikesPopupOpen(false)}
					onAccountClick={onCloseComments}
				/>
			) : null}
		</div>
	);
};

export default Comment;
