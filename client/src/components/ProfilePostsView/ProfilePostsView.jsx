import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';

import useGoBackOrTo from '../../hooks/useGoBackOrTo';
import usePostHashSync from '../../hooks/usePostHashSync';
import { NOTIFICATION_TARGET_STATE_KEY } from '../../constants/notifications';

import PostsBar from '../PostsBar/PostsBar';
import UserPost from '../UserPost/UserPost';

import './ProfilePostsView.css';

const ProfilePostsView = () => {
	const { userData, userPosts, setUserPosts, isLoggedInUserProfile, onEditPostClick, onDeletePostClick } = useOutletContext();

	const postsListRef = useRef(null);
	const scrolledNotificationTargetRef = useRef(null);

	usePostHashSync(postsListRef);

	const { state: locationState } = useLocation();
	const notificationTarget = locationState?.[NOTIFICATION_TARGET_STATE_KEY];

	useEffect(() => {
		if (!notificationTarget || scrolledNotificationTargetRef.current === notificationTarget) {
			return;
		}

		const targetPostElement = document.getElementById(notificationTarget.postId);

		if (targetPostElement) {
			scrolledNotificationTargetRef.current = notificationTarget;

			targetPostElement.scrollIntoView();
		}
	}, [notificationTarget, userPosts]);

	const goBackToProfile = useGoBackOrTo(`/user/${userData._id}`);

	const updatePost = useCallback(
		(postId, changes) => {
			setUserPosts((state) => state.map((post) => (post._id === postId ? { ...post, ...changes } : post)));
		},
		[setUserPosts],
	);

	return (
		<section className='profile-posts-view'>
			<PostsBar subtitle={userData.username} onBackClick={goBackToProfile} />

			<div className='profile-posts-list' ref={postsListRef}>
				{userPosts.map((post) => (
					<UserPost
						key={post._id}
						userPostData={post}
						author={userData}
						commentsOpenRequest={
							notificationTarget?.shouldOpenComments && notificationTarget.postId === post._id ? notificationTarget : null
						}
						showActions={isLoggedInUserProfile}
						onEditClick={onEditPostClick}
						onDeleteClick={onDeletePostClick}
						onPostChange={updatePost}
					/>
				))}
			</div>
		</section>
	);
};

export default ProfilePostsView;
