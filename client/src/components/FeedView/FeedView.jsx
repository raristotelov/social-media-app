import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import useMediaQuery from '../../hooks/useMediaQuery';
import useStoryTray from '../../hooks/useStoryTray';
import { getFollowedUsersPosts } from '../../services/userPostService';
import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';
import { DESKTOP_MEDIA_QUERY } from '../../constants/layout';
import { CAROUSEL_POSTS_BEFORE } from '../../constants/suggestions';
import { isUnauthenticatedError } from '../../utils/errors';

import EmptyFeedSuggestions from '../EmptyFeedSuggestions/EmptyFeedSuggestions';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import PageLoadError from '../PageLoadError/PageLoadError';
import StoriesTray from '../StoriesTray/StoriesTray';
import SuggestionsCarousel from '../SuggestionsCarousel/SuggestionsCarousel';
import SuggestionsSidebar from '../SuggestionsSidebar/SuggestionsSidebar';
import UserPost from '../UserPost/UserPost';

import './FeedView.css';

const CAROUSEL_KEY = 'suggestions-carousel';

const FeedView = () => {
	const [posts, setPosts] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [hasLoadFailed, setHasLoadFailed] = useState(false);
	const [isEmptyFeedVisit, setIsEmptyFeedVisit] = useState(false);
	const [reloadCount, setReloadCount] = useState(0);
	const hasLoadedPostsRef = useRef(false);

	const { jwtToken, endSession } = useContext(LoggedInUserContext);
	const { entries: trayEntries, isLoaded: isTrayLoaded, reload: reloadTray } = useStoryTray();
	const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

	const jwtTokenRef = useRef(jwtToken);

	useEffect(() => {
		jwtTokenRef.current = jwtToken;
	}, [jwtToken]);

	useEffect(() => {
		let isCurrentRequest = true;

		if (!hasLoadedPostsRef.current) {
			setIsLoading(true);
		}

		getFollowedUsersPosts({ jwtToken: jwtTokenRef.current })
			.then((result) => {
				if (!isCurrentRequest) {
					return;
				}

				hasLoadedPostsRef.current = true;

				setPosts(result);
				setHasLoadFailed(false);

				if (!result.length) {
					setIsEmptyFeedVisit(true);
				}
			})
			.catch((error) => {
				if (!isCurrentRequest) {
					return;
				}

				if (isUnauthenticatedError(error)) {
					endSession();

					return;
				}

				if (!hasLoadedPostsRef.current) {
					setHasLoadFailed(true);
				}
			})
			.finally(() => {
				if (isCurrentRequest) {
					setIsLoading(false);
				}
			});

		return () => {
			isCurrentRequest = false;
		};
	}, [endSession, reloadCount]);

	const reloadPosts = useCallback(() => {
		setReloadCount((count) => count + 1);
	}, []);

	const updatePost = useCallback((postId, changes) => {
		setPosts((state) => state.map((post) => (post._id === postId ? { ...post, ...changes } : post)));
	}, []);

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

			{!isLoading && !isEmptyFeedVisit && isDesktop ? <SuggestionsSidebar /> : null}
		</section>
	);
};

export default FeedView;
