import { useOutletContext } from 'react-router';

import { POPULAR_EMPTY_MESSAGE, POPULAR_POSTS_VIEW_PATH } from '../../constants/popularPosts';

import LoadMoreFooter from '../LoadMoreFooter/LoadMoreFooter';
import UserProfilePost from '../UserProfilePost/UserProfilePost';

import './PopularPostsView.css';

const PopularPostsView = () => {
	const { posts, isLoadingMore, hasLoadMoreFailed, onRetryLoadMoreClick } = useOutletContext();

	if (!posts.length) {
		return (
			<section className='popular-posts-wrapper popular-posts-wrapper-empty'>
				<h1 className='feed-empty-title'>{POPULAR_EMPTY_MESSAGE}</h1>
			</section>
		);
	}

	return (
		<section className='popular-posts-wrapper'>
			<div className='popular-posts-grid'>
				{posts.map((post) => (
					<UserProfilePost key={post._id} post={post} to={`${POPULAR_POSTS_VIEW_PATH}#${post._id}`} />
				))}
			</div>

			<LoadMoreFooter isLoadingMore={isLoadingMore} hasLoadMoreFailed={hasLoadMoreFailed} onRetryClick={onRetryLoadMoreClick} />
		</section>
	);
};

export default PopularPostsView;
