import { useCallback, useContext, useState } from 'react';
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';

import ToastContext from '../../contexts/ToastContext';
import useLoadMoreOnScroll from '../../hooks/useLoadMoreOnScroll';
import usePopularPosts from '../../hooks/usePopularPosts';
import { ERROR_CODES } from '../../constants/errorCodes';
import { ERROR_MESSAGES, LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';
import { POPULAR_POSTS_PATH, POPULAR_POSTS_VIEW_PATH } from '../../constants/popularPosts';

import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import PageLoadError from '../PageLoadError/PageLoadError';

const PopularPostsLayout = () => {
	const { showToast } = useContext(ToastContext);

	const navigate = useNavigate();
	const { hash } = useLocation();
	const isPostsViewOpen = Boolean(useMatch(POPULAR_POSTS_VIEW_PATH));

	const [firstPostId] = useState(() => (isPostsViewOpen ? hash.slice(1) : ''));

	const showMissingFirstPost = useCallback(() => {
		showToast(ERROR_MESSAGES[ERROR_CODES.POST_NOT_FOUND]);

		navigate(POPULAR_POSTS_PATH, { replace: true });
	}, [showToast, navigate]);

	const { posts, isLoading, hasLoadFailed, isLoadingMore, hasLoadMoreFailed, canLoadMore, reload, loadMore, updatePost } = usePopularPosts({
		firstPostId,
		onFirstPostMissing: showMissingFirstPost,
	});

	useLoadMoreOnScroll({ onLoadMore: loadMore, isEnabled: canLoadMore });

	if (hasLoadFailed) {
		return <PageLoadError onRetryClick={reload} isRetrying={isLoading} messages={LOAD_ERROR_MESSAGES.POPULAR} />;
	}

	if (isLoading) {
		return <LoadingSpinner isFullPage />;
	}

	const outletContext = { posts, updatePost, isLoadingMore, hasLoadMoreFailed, onRetryLoadMoreClick: loadMore };

	return <Outlet context={outletContext} />;
};

export default PopularPostsLayout;
