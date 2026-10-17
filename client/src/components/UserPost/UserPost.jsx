import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import useLoginRedirect from '../../hooks/useLoginRedirect';
import usePostActionsMenu from '../../hooks/usePostActionsMenu';
import { likeUserPost, unlikeUserPost } from '../../services/userPostService';
import { addComment } from '../../services/commentService';
import { ACTION_FALLBACK_MESSAGES } from '../../constants/errorMessages';
import { countCommentsAndReplies, getPreviewComments } from '../../utils/comments';
import { getErrorMessage, isUnauthenticatedError } from '../../utils/errors';

import AddCommentForm from '../AddCommentForm/AddCommentForm';
import CommentsPopup from '../CommentsPopup/CommentsPopup';
import PostActionsMenu from '../PostActionsMenu/PostActionsMenu';
import PostCaption from '../PostCaption/PostCaption';
import ProfilePicture from '../ProfilePicture/ProfilePicture';
import CommentOutlineIcon from '../icons/CommentOutline';
import HeartIcon from '../icons/Heart';
import PostActionsIcon from '../icons/PostActions';

import './UserPost.css';

const HEART_PULSE_DURATION_MS = 500;

const UserPost = ({ userPostData, author, showActions = false, onEditClick, onDeleteClick, onPostChange }) => {
	const [isHeartPulsing, setIsHeartPulsing] = useState(false);
	const [isCommentsPopupOpen, setIsCommentsPopupOpen] = useState(false);
	const isUpdatingLikeRef = useRef(false);
	const heartPulseTimeoutRef = useRef(null);

	const { jwtToken, loggedInUser, endSession } = useContext(LoggedInUserContext);
	const { showToast } = useContext(ToastContext);
	const redirectToLogin = useLoginRedirect();
	const { isMenuOpen, menuContainerRef, toggleMenu, closeMenu } = usePostActionsMenu();

	const { _id: userPostId, likes = [], commentsCount = 0, previewComments = [], caption, imageUrl } = userPostData;

	const hasLikedUserPost = likes.includes(loggedInUser?._id);

	useEffect(() => {
		return () => {
			clearTimeout(heartPulseTimeoutRef.current);
		};
	}, []);

	const triggerHeartPulse = () => {
		setIsHeartPulsing(true);

		heartPulseTimeoutRef.current = setTimeout(() => setIsHeartPulsing(false), HEART_PULSE_DURATION_MS);
	};

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
			const updatedUserPost = hasLikedUserPost
				? await unlikeUserPost({ userPostToUnlikeId: userPostId, jwtToken })
				: await likeUserPost({ userPostToLikeId: userPostId, jwtToken });

			onPostChange(userPostId, { likes: updatedUserPost.likes });

			if (!hasLikedUserPost) {
				triggerHeartPulse();
			}
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

	const updateFromLoadedComments = useCallback(
		(loadedComments) => {
			onPostChange(userPostId, {
				commentsCount: countCommentsAndReplies(loadedComments),
				previewComments: getPreviewComments(loadedComments),
			});
		},
		[onPostChange, userPostId],
	);

	const submitComment = async (text) => {
		const addedComment = await addComment({ userPostId, text, jwtToken });

		onPostChange(userPostId, {
			commentsCount: commentsCount + 1,
			previewComments: getPreviewComments([...previewComments, addedComment]),
		});
	};

	const editClickHandler = () => {
		closeMenu();
		onEditClick(userPostData);
	};

	const deleteClickHandler = () => {
		closeMenu();
		onDeleteClick(userPostData);
	};

	return (
		<article className='user-post' id={userPostId}>
			<header className='user-post-header'>
				<Link to={`/user/${author._id}`} className='user-post-author'>
					<ProfilePicture imageUrl={author.profilePicture?.imageUrl} className='user-post-avatar' />

					<span className='user-post-username'>{author.username}</span>
				</Link>

				{showActions ? (
					<div className='user-post-actions' ref={menuContainerRef}>
						<button
							type='button'
							className='user-post-actions-button'
							aria-label='Post actions'
							aria-expanded={isMenuOpen}
							onClick={toggleMenu}
						>
							<PostActionsIcon iconColorProp='currentColor' />
						</button>

						{isMenuOpen ? (
							<PostActionsMenu onEditClick={editClickHandler} onDeleteClick={deleteClickHandler} onClose={closeMenu} />
						) : null}
					</div>
				) : null}
			</header>

			<div className='user-post-image'>
				<img src={imageUrl} alt='post' />
			</div>

			<div className='user-post-footer'>
				<div className='user-post-stats'>
					<div className='user-post-stat'>
						<button
							type='button'
							className={isHeartPulsing ? 'user-post-like-button user-post-like-button-pulse' : 'user-post-like-button'}
							aria-label={hasLikedUserPost ? 'Unlike post' : 'Like post'}
							aria-pressed={hasLikedUserPost}
							onClick={toggleLike}
						>
							<HeartIcon
								fillColorProp={hasLikedUserPost ? 'var(--brand-red)' : 'none'}
								iconColorProp={hasLikedUserPost ? 'var(--brand-red)' : 'var(--text-primary)'}
							/>
						</button>

						<span>{`${likes.length} ${likes.length === 1 ? 'like' : 'likes'}`}</span>
					</div>

					<button type='button' className='user-post-stat user-post-comments-button' onClick={() => setIsCommentsPopupOpen(true)}>
						<CommentOutlineIcon iconColorProp='var(--text-primary)' />

						<span>{`${commentsCount} ${commentsCount === 1 ? 'comment' : 'comments'}`}</span>
					</button>
				</div>

				{caption ? <PostCaption username={author.username} caption={caption} /> : null}

				{previewComments.length ? (
					<div className='user-post-previews'>
						{previewComments.map((comment) => (
							<p key={comment._id} className='user-post-preview'>
								<span className='user-post-preview-username'>{comment.userId?.username}</span>

								{` ${comment.text}`}
							</p>
						))}
					</div>
				) : null}

				<AddCommentForm onSubmit={submitComment} />
			</div>

			{isCommentsPopupOpen ? (
				<CommentsPopup userPostId={userPostId} onClose={() => setIsCommentsPopupOpen(false)} onCommentsLoaded={updateFromLoadedComments} />
			) : null}
		</article>
	);
};

export default UserPost;
