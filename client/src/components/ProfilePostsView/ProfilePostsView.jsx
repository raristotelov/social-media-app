import { useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';

import useGoBackOrTo from '../../hooks/useGoBackOrTo';
import usePostHashSync from '../../hooks/usePostHashSync';

import PostsBar from '../PostsBar/PostsBar';
import UserPost from '../UserPost/UserPost';

import './ProfilePostsView.css';

const ProfilePostsView = () => {
	const { userData, userPosts, setUserPosts, isLoggedInUserProfile, onEditPostClick, onDeletePostClick } = useOutletContext();

	const postsListRef = useRef(null);

	usePostHashSync(postsListRef);

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
