import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';

import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';

import './PopularPostsFooter.css';

const PopularPostsFooter = ({ isLoadingMore, hasLoadMoreFailed, onRetryClick }) => {
	if (hasLoadMoreFailed) {
		return (
			<p className='popular-posts-load-error' role='alert'>
				<span>{LOAD_ERROR_MESSAGES.POPULAR_NEXT_BATCH.MESSAGE}</span>

				<span aria-hidden='true'>·</span>

				<button type='button' className='popular-posts-load-error-retry' onClick={onRetryClick}>
					{LOAD_ERROR_MESSAGES.POPULAR_NEXT_BATCH.RETRY_LABEL}
				</button>
			</p>
		);
	}

	return isLoadingMore ? <LoadingSpinner /> : null;
};

export default PopularPostsFooter;
