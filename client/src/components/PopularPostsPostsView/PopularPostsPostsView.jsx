import { useRef } from 'react';
import { useOutletContext } from 'react-router-dom';

import useGoBackOrTo from '../../hooks/useGoBackOrTo';
import usePostHashSync from '../../hooks/usePostHashSync';
import { POPULAR_POSTS_BAR_LABEL, POPULAR_POSTS_PATH } from '../../constants/popularPosts';

import PopularPostsFooter from '../PopularPostsFooter/PopularPostsFooter';
import PostsBar from '../PostsBar/PostsBar';
import UserPost from '../UserPost/UserPost';

const PopularPostsPostsView = () => {
	const { posts, updatePost, isLoadingMore, hasLoadMoreFailed, onRetryLoadMoreClick } = useOutletContext();

	const postsListRef = useRef(null);

	usePostHashSync(postsListRef);

	const goBackToPopularPosts = useGoBackOrTo(POPULAR_POSTS_PATH);

	return (
		<section className='profile-posts-view'>
			<PostsBar subtitle={POPULAR_POSTS_BAR_LABEL} onBackClick={goBackToPopularPosts} />

			<div className='profile-posts-list' ref={postsListRef}>
				{posts.map((post) => (
					<UserPost key={post._id} userPostData={post} author={post.userId} onPostChange={updatePost} />
				))}
			</div>

			<PopularPostsFooter isLoadingMore={isLoadingMore} hasLoadMoreFailed={hasLoadMoreFailed} onRetryClick={onRetryLoadMoreClick} />
		</section>
	);
};

export default PopularPostsPostsView;
