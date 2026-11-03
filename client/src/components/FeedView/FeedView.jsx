import { useEffect, useState } from 'react';

import useFeedPosts from '../../hooks/useFeedPosts';
import useLoadMoreOnScroll from '../../hooks/useLoadMoreOnScroll';
import useMediaQuery from '../../hooks/useMediaQuery';
import useStoryTray from '../../hooks/useStoryTray';
import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';
import { DESKTOP_MEDIA_QUERY } from '../../constants/layout';
import { CAROUSEL_POSTS_BEFORE } from '../../constants/suggestions';

import EmptyFeedSuggestions from '../EmptyFeedSuggestions/EmptyFeedSuggestions';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import PageLoadError from '../PageLoadError/PageLoadError';
import LoadMoreFooter from '../LoadMoreFooter/LoadMoreFooter';
import StoriesTray from '../StoriesTray/StoriesTray';
import SuggestionsCarousel from '../SuggestionsCarousel/SuggestionsCarousel';
import SuggestionsSidebar from '../SuggestionsSidebar/SuggestionsSidebar';
import UserPost from '../UserPost/UserPost';

import './FeedView.css';

const CAROUSEL_KEY = 'suggestions-carousel';

const FeedView = () => {
	const [isEmptyFeedVisit, setIsEmptyFeedVisit] = useState(false);

	const {
		posts,
		isLoading,
		hasLoadFailed,
		isLoadingMore,
		hasLoadMoreFailed,
		canLoadMore,
		reload: reloadPosts,
		loadMore,
		updatePost,
	} = useFeedPosts();
	const { entries: trayEntries, isLoaded: isTrayLoaded, reload: reloadTray } = useStoryTray();
	const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

	useLoadMoreOnScroll({ onLoadMore: loadMore, isEnabled: canLoadMore });

	useEffect(() => {
		if (!isLoading && !hasLoadFailed && !posts.length) {
			setIsEmptyFeedVisit(true);
		}
	}, [isLoading, hasLoadFailed, posts.length]);

	if (hasLoadFailed) {
		return <PageLoadError onActionClick={reloadPosts} isRetrying={isLoading} messages={LOAD_ERROR_MESSAGES.FEED} />;
	}

	const postItems = posts.map((post) => <UserPost key={post._id} userPostData={post} author={post.userId} onPostChange={updatePost} />);

	if (!isEmptyFeedVisit && !isDesktop) {
		const carouselIndex = Math.min(postItems.length, CAROUSEL_POSTS_BEFORE);

		postItems.splice(carouselIndex, 0, <SuggestionsCarousel key={CAROUSEL_KEY} />);
	}

	return (
		<section className={isEmptyFeedVisit ? 'feed-empty' : 'feed-wrapper'}>
			<StoriesTray entries={trayEntries} isLoaded={isTrayLoaded} reload={reloadTray} />

			{isLoading ? <LoadingSpinner /> : null}

			{isEmptyFeedVisit ? (
				<div className='feed-empty-message'>
					<h1 className='feed-empty-title'>Your feed is empty</h1>

					<p className='feed-empty-description'>Follow people to see their posts here</p>
				</div>
			) : null}

			{isEmptyFeedVisit ? <EmptyFeedSuggestions onFollowChange={reloadPosts} /> : null}

			{!isLoading && posts.length ? <div className='feed-posts'>{postItems}</div> : null}

			{!isLoading && posts.length ? (
				<LoadMoreFooter isLoadingMore={isLoadingMore} hasLoadMoreFailed={hasLoadMoreFailed} onRetryClick={loadMore} />
			) : null}

			{!isLoading && !isEmptyFeedVisit && isDesktop ? <SuggestionsSidebar /> : null}
		</section>
	);
};

export default FeedView;
