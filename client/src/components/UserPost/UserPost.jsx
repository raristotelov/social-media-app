import { useState, useContext } from 'react';

import Comment from '../Comment/Comment';
import CommentIcon from '../icons/Comment';
import ArrowDownIcon from '../icons/ArrowDown';
import HeartIcon from '../icons/Heart';

import { likeUserPost, unlikeUserPost } from '../../services/userPostService';
import { getComments, addComment } from '../../services/commentService';
import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import Popup from '../Popup/Popup';

import './UserPost.css';

const UserPost = (props) => {
	const [isHeartPulsing, setIsHeartPulsing] = useState(false);
	const [isCommentsPopupOpen, setIsCommentsPopupOpen] = useState(false);
	const [comments, setComments] = useState([]);
	const [newComment, setNewComment] = useState('');

	const { userPostData } = props;

	const userPostAuthor = userPostData.userId;

	const { jwtToken, loggedInUser, setLoggedInUser } = useContext(LoggedInUserContext);

	const [commentsCount, setCommentsCount] = useState(userPostData.commentsCount || 0);

	const triggerPulse = () => {
		setIsHeartPulsing(true);
		setTimeout(() => setIsHeartPulsing(false), 500);
	};

	const onLikeUserPostHandler = async ({ userPostToLikeId }) => {
		try {
			const updatedUserPostData = await likeUserPost({ userPostToLikeId, jwtToken });

			// TODO make this better
			setLoggedInUser((currLoggedInUser) => {
				const followedUsersPosts = currLoggedInUser.followedUsersPosts;

				const currUserPost = followedUsersPosts.find((userPost) => userPost._id === updatedUserPostData._id);

				currUserPost.likes = updatedUserPostData.likes;

				return {
					...currLoggedInUser,
					followedUsersPosts: [...followedUsersPosts.filter((userPost) => userPost._id !== updatedUserPostData._id), currUserPost].sort(
						(a, b) => b.createdAt - a.createdAt,
					),
				};
			});

			triggerPulse();
		} catch (error) {
			console.log('error', error);
		}
	};

	const onUnlikeUserPostHandler = async ({ userPostToUnlikeId }) => {
		try {
			const updatedUserPostData = await unlikeUserPost({ userPostToUnlikeId, jwtToken });

			// TODO make this better
			setLoggedInUser((currLoggedInUser) => {
				const followedUsersPosts = currLoggedInUser.followedUsersPosts;

				const currUserPost = followedUsersPosts.find((userPost) => userPost._id === updatedUserPostData._id);

				currUserPost.likes = updatedUserPostData.likes;

				return {
					...currLoggedInUser,
					followedUsersPosts: [...followedUsersPosts.filter((userPost) => userPost._id !== updatedUserPostData._id), currUserPost].sort(
						(a, b) => b.createdAt - a.createdAt,
					),
				};
			});
		} catch (error) {
			console.log('error', error);
		}
	};

	const loadComments = async () => {
		try {
			const fetchedComments = await getComments({ userPostId: userPostData._id, jwtToken });

			setComments(fetchedComments);

			const total = fetchedComments.reduce((sum, comment) => sum + 1 + (comment.replies ? comment.replies.length : 0), 0);
			setCommentsCount(total);
		} catch (error) {
			console.log('Something went wrong while loading comments', error);
		}
	};

	const openCommentsPopup = () => {
		setIsCommentsPopupOpen(true);
		loadComments();
	};

	const closeCommentsPopup = () => {
		setIsCommentsPopupOpen(false);
	};

	const onAddCommentSubmit = async (e) => {
		e.preventDefault();

		if (!newComment.trim()) {
			return;
		}

		try {
			await addComment({ userPostId: userPostData._id, text: newComment, jwtToken });

			setNewComment('');

			await loadComments();
		} catch (error) {
			console.log('Something went wrong while adding a comment', error);
		}
	};

	const loggedInUserHasLikedUserPost = userPostData.likes.includes(loggedInUser?._id);

	const addCommentForm = (
		<form className='add-comment-textarea-wrapper' onSubmit={onAddCommentSubmit}>
			<input
				type='text'
				className='add-comment-input'
				placeholder='Add a comment...'
				value={newComment}
				onChange={(e) => setNewComment(e.target.value)}
			/>
		</form>
	);

	return (
		<div className='post-wrapper'>
			<div className='account-details'>
				<img src='https://i.pinimg.com/736x/30/df/1c/30df1cb8981338d42ed2722ab74cb51e.jpg' alt='post-img' />

				<span>{userPostAuthor.username}</span>
			</div>

			<div className='post-image-wrapper'>
				<img src={`${userPostData.imageUrl}`} alt='post-img' />
			</div>

			<div className='like-action-wrapper'>
				<button
					onClick={
						loggedInUserHasLikedUserPost
							? () => onUnlikeUserPostHandler({ userPostToUnlikeId: userPostData._id })
							: () => onLikeUserPostHandler({ userPostToLikeId: userPostData._id })
					}
					className={`like-btn ${isHeartPulsing ? 'heart-pulse' : ''}`}
					onMouseLeave={!loggedInUserHasLikedUserPost ? triggerPulse : () => {}}
				>
					<HeartIcon
						fillColorProp={loggedInUserHasLikedUserPost ? '#F64D4D' : 'none'}
						iconColorProp={loggedInUserHasLikedUserPost ? '#F64D4D' : null}
					/>
				</button>

				<span>
					{userPostData.likes.length}

					{userPostData.likes.length === 1 ? ' like' : ' likes'}
				</span>
			</div>

			{userPostData.caption ? (
				<div className='post-caption'>
					<span className='post-caption-username'>{userPostAuthor.username}</span>

					{` ${userPostData.caption}`}
				</div>
			) : null}

			<div className='comments-section'>
				<div className='comments-section-toggle-wrapper' onClick={openCommentsPopup}>
					<div className='comments-count-section'>
						<CommentIcon />

						<span>
							{commentsCount}

							{commentsCount === 1 ? ' comment' : ' comments'}
						</span>
					</div>

					<button className='toggle-comments-btn'>
						<ArrowDownIcon />
					</button>
				</div>
			</div>

			{addCommentForm}

			{isCommentsPopupOpen ? (
				<Popup onClosePopupClick={closeCommentsPopup}>
					<div className='comments-wrapper'>
						{comments.length ? (
							comments.map((comment) => (
								<Comment key={comment._id} comment={comment} userPostId={userPostData._id} onReload={loadComments} />
							))
						) : (
							<p className='no-comments-text'>No comments yet. Be the first to comment.</p>
						)}
					</div>

					{addCommentForm}
				</Popup>
			) : null}
		</div>
	);
};

export default UserPost;
