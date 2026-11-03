import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';

import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';

import './LoadMoreFooter.css';

const LoadMoreFooter = ({ isLoadingMore, hasLoadMoreFailed, onRetryClick }) => {
	if (hasLoadMoreFailed) {
		return (
			<p className='load-more-error' role='alert'>
				<span>{LOAD_ERROR_MESSAGES.NEXT_BATCH.MESSAGE}</span>

				<span aria-hidden='true'>·</span>

				<button type='button' className='load-more-error-retry' onClick={onRetryClick}>
					{LOAD_ERROR_MESSAGES.NEXT_BATCH.RETRY_LABEL}
				</button>
			</p>
		);
	}

	return isLoadingMore ? <LoadingSpinner /> : null;
};

export default LoadMoreFooter;
