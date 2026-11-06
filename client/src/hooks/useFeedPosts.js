import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { getFollowedUsersPosts } from '../services/userPostService';
import { isUnauthenticatedError } from '../utils/errors';

const useFeedPosts = () => {
	const [posts, setPosts] = useState([]);
	const [hasMore, setHasMore] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [hasLoadFailed, setHasLoadFailed] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasLoadMoreFailed, setHasLoadMoreFailed] = useState(false);
	const [reloadCount, setReloadCount] = useState(0);

	const { endSession } = useContext(LoggedInUserContext);

	const nextCursorRef = useRef(null);
	const hasLoadedRef = useRef(false);
	const isLoadingMoreRef = useRef(false);
	const loadGenerationRef = useRef(0);

	useEffect(() => {
		let isCurrentRequest = true;

		loadGenerationRef.current += 1;

		if (!hasLoadedRef.current) {
			setIsLoading(true);
		}

		getFollowedUsersPosts()
			.then((result) => {
				if (!isCurrentRequest) {
					return;
				}

				hasLoadedRef.current = true;
				nextCursorRef.current = result.nextCursor;

				setPosts(result.posts);
				setHasMore(result.hasMore);
				setHasLoadFailed(false);
				setHasLoadMoreFailed(false);
			})
			.catch((error) => {
				if (!isCurrentRequest) {
					return;
				}

				if (isUnauthenticatedError(error)) {
					endSession();

					return;
				}

				if (!hasLoadedRef.current) {
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
	}, [reloadCount, endSession]);

	const reload = useCallback(() => {
		setReloadCount((count) => count + 1);
	}, []);

	const loadMore = useCallback(async () => {
		if (!hasMore || isLoadingMoreRef.current) {
			return;
		}

		const loadGeneration = loadGenerationRef.current;

		isLoadingMoreRef.current = true;

		setIsLoadingMore(true);
		setHasLoadMoreFailed(false);

		try {
			const result = await getFollowedUsersPosts({ cursor: nextCursorRef.current });

			if (loadGeneration !== loadGenerationRef.current) {
				return;
			}

			nextCursorRef.current = result.nextCursor;

			setPosts((state) => [...state, ...result.posts.filter((post) => !state.some((loadedPost) => loadedPost._id === post._id))]);
			setHasMore(result.hasMore);
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				endSession();
			} else if (loadGeneration === loadGenerationRef.current) {
				setHasLoadMoreFailed(true);
			}
		} finally {
			isLoadingMoreRef.current = false;

			setIsLoadingMore(false);
		}
	}, [hasMore, endSession]);

	const updatePost = useCallback((postId, changes) => {
		setPosts((state) => state.map((post) => (post._id === postId ? { ...post, ...changes } : post)));
	}, []);

	const canLoadMore = hasMore && !isLoading && !hasLoadFailed && !isLoadingMore && !hasLoadMoreFailed;

	return { posts, isLoading, hasLoadFailed, isLoadingMore, hasLoadMoreFailed, canLoadMore, reload, loadMore, updatePost };
};

export default useFeedPosts;
