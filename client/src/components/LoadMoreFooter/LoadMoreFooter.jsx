import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';

import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';

import './LoadMoreFooter.css';

const LoadMoreFooter = ({ isLoadingMore, hasLoadMoreFailed, onRetryClick, messages = LOAD_ERROR_MESSAGES.NEXT_BATCH }) => {
	if (hasLoadMoreFailed) {
		return (
			<p className='load-more-error' role='alert'>
				<span>{messages.MESSAGE}</span>

				<span aria-hidden='true'>·</span>

				<button type='button' className='load-more-error-retry' onClick={onRetryClick}>
					{messages.RETRY_LABEL}
				</button>
			</p>
		);
	}

	return isLoadingMore ? <LoadingSpinner /> : null;
};

export default LoadMoreFooter;
