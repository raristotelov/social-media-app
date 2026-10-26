import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';

import Button from '../Button/Button';

import './PageLoadError.css';

const PageLoadError = ({ onActionClick, isRetrying = false, messages = LOAD_ERROR_MESSAGES.PROFILE }) => {
	return (
		<section className='page-load-error'>
			<h1 className='page-load-error-heading'>{messages.HEADING}</h1>

			<p className='page-load-error-description'>{messages.DESCRIPTION}</p>

			<div className='page-load-error-action'>
				<Button type='button' label={messages.ACTION_LABEL} onClick={onActionClick} disabled={isRetrying} />
			</div>
		</section>
	);
};

export default PageLoadError;
