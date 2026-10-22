import { useCallback, useContext, useEffect, useState } from 'react';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getFollowedUsersPosts } from '../../services/userPostService';
import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';
import { isUnauthenticatedError } from '../../utils/errors';

import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import PageLoadError from '../PageLoadError/PageLoadError';
import StoriesTray from '../StoriesTray/StoriesTray';
import UserPost from '../UserPost/UserPost';

import './FeedView.css';

const FeedView = () => {
	const [posts, setPosts] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [hasLoadFailed, setHasLoadFailed] = useState(false);
	const [reloadCount, setReloadCount] = useState(0);

	const { jwtToken, endSession } = useContext(LoggedInUserContext);

	useEffect(() => {
		let isCurrentRequest = true;

		setIsLoading(true);

		getFollowedUsersPosts({ jwtToken })
			.then((result) => {
				if (!isCurrentRequest) {
					return;
				}

				setPosts(result);
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
	}, [jwtToken, endSession, reloadCount]);

	const retryLoad = () => {
		setReloadCount((count) => count + 1);
	};

	const updatePost = useCallback((postId, changes) => {
		setPosts((state) => state.map((post) => (post._id === postId ? { ...post, ...changes } : post)));
	}, []);

	if (hasLoadFailed) {
		return <PageLoadError onRetryClick={retryLoad} isRetrying={isLoading} messages={LOAD_ERROR_MESSAGES.FEED} />;
	}

	if (isLoading) {
		return <LoadingSpinner isFullPage />;
	}

	if (!posts.length) {
		return (
			<section className='feed-empty'>
				<StoriesTray />

				<div className='feed-empty-message'>
					<h1 className='feed-empty-title'>Your feed is empty</h1>

					<p className='feed-empty-description'>Follow people to see their posts here</p>
				</div>
			</section>
		);
	}

	return (
		<section className='feed-wrapper'>
			<StoriesTray />

			<div className='feed-posts'>
				{posts.map((post) => (
					<UserPost key={post._id} userPostData={post} author={post.userId} onPostChange={updatePost} />
				))}
			</div>
		</section>
	);
};

export default FeedView;
