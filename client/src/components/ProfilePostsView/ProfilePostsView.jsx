import { useCallback, useRef } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';

import usePostHashSync from '../../hooks/usePostHashSync';

import PostsBar from '../PostsBar/PostsBar';
import UserPost from '../UserPost/UserPost';

import './ProfilePostsView.css';

const INITIAL_HISTORY_ENTRY_KEY = 'default';

const ProfilePostsView = () => {
	const { userData, userPosts, setUserPosts, isLoggedInUserProfile, onEditPostClick, onDeletePostClick } = useOutletContext();

	const postsListRef = useRef(null);

	usePostHashSync(postsListRef);

	const navigate = useNavigate();
	const location = useLocation();

	const goBackToProfile = () => {
		if (location.key === INITIAL_HISTORY_ENTRY_KEY) {
			navigate(`/user/${userData._id}`, { replace: true });

			return;
		}

		navigate(-1);
	};

	const updatePost = useCallback(
		(postId, changes) => {
			setUserPosts((state) => state.map((post) => (post._id === postId ? { ...post, ...changes } : post)));
		},
		[setUserPosts],
	);

	return (
		<section className='profile-posts-view'>
			<PostsBar username={userData.username} onBackClick={goBackToProfile} />

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
