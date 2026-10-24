import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { getPopularPosts, getNextPopularPosts } from '../services/userPostService';
import { ERROR_CODES } from '../constants/errorCodes';
import { getErrorCode, isUnauthenticatedError } from '../utils/errors';

const usePopularPosts = ({ firstPostId, onFirstPostMissing }) => {
	const [posts, setPosts] = useState([]);
	const [snapshotTime, setSnapshotTime] = useState(null);
	const [hasMore, setHasMore] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [hasLoadFailed, setHasLoadFailed] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasLoadMoreFailed, setHasLoadMoreFailed] = useState(false);
	const [reloadCount, setReloadCount] = useState(0);

	const { jwtToken, endSession } = useContext(LoggedInUserContext);

	const jwtTokenRef = useRef(jwtToken);
	const onFirstPostMissingRef = useRef(onFirstPostMissing);
	const firstPostIdRef = useRef(firstPostId);
	const shownPostIdsRef = useRef([]);
	const isLoadingMoreRef = useRef(false);

	useEffect(() => {
		jwtTokenRef.current = jwtToken;
		onFirstPostMissingRef.current = onFirstPostMissing;
	}, [jwtToken, onFirstPostMissing]);

	useEffect(() => {
		let isCurrentRequest = true;

		setIsLoading(true);

		const loadFirstPage = async () => {
			try {
				return await getPopularPosts({ jwtToken: jwtTokenRef.current, firstPostId: firstPostIdRef.current });
			} catch (error) {
				if (!firstPostIdRef.current || getErrorCode(error) !== ERROR_CODES.POST_NOT_FOUND) {
					throw error;
				}

				if (isCurrentRequest) {
					firstPostIdRef.current = undefined;
					onFirstPostMissingRef.current();
				}

				return getPopularPosts({ jwtToken: jwtTokenRef.current });
			}
		};

		loadFirstPage()
			.then((result) => {
				if (!isCurrentRequest) {
					return;
				}

				shownPostIdsRef.current = result.posts.map((post) => post._id);

				setPosts(result.posts);
				setSnapshotTime(result.snapshotTime);
				setHasMore(result.hasMore);
				setHasLoadFailed(false);
			})
			.catch((error) => {
				if (!isCurrentRequest) {
					return;
				}

				if (isUnauthenticatedError(error)) {
					endSession();

					return;
				}

				setHasLoadFailed(true);
			})
			.finally(() => {
				if (isCurrentRequest) {
					setIsLoading(false);
				}
			});

		return () => {
			isCurrentRequest = false;
		};
	}, [reloadCount, endSession]);

	const reload = useCallback(() => {
		setReloadCount((count) => count + 1);
	}, []);

	const loadMore = useCallback(async () => {
		if (!hasMore || isLoadingMoreRef.current) {
			return;
		}

		isLoadingMoreRef.current = true;

		setIsLoadingMore(true);
		setHasLoadMoreFailed(false);

		try {
			const result = await getNextPopularPosts({
				jwtToken: jwtTokenRef.current,
				snapshotTime,
				shownPostIds: shownPostIdsRef.current,
			});

			shownPostIdsRef.current = [...shownPostIdsRef.current, ...result.posts.map((post) => post._id)];

			setPosts((state) => [...state, ...result.posts]);
			setHasMore(result.hasMore);
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				endSession();
			} else {
				setHasLoadMoreFailed(true);
			}
		} finally {
			isLoadingMoreRef.current = false;

			setIsLoadingMore(false);
		}
	}, [hasMore, snapshotTime, endSession]);

	const updatePost = useCallback((postId, changes) => {
		setPosts((state) => state.map((post) => (post._id === postId ? { ...post, ...changes } : post)));
	}, []);

	const canLoadMore = hasMore && !isLoading && !hasLoadFailed && !isLoadingMore && !hasLoadMoreFailed;

	return { posts, isLoading, hasLoadFailed, isLoadingMore, hasLoadMoreFailed, canLoadMore, reload, loadMore, updatePost };
};

export default usePopularPosts;
