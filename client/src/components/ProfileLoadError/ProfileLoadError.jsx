import { LOAD_ERROR_MESSAGES } from '../../constants/errorMessages';

import Button from '../Button/Button';

import './ProfileLoadError.css';

const ProfileLoadError = ({ onRetryClick, isRetrying = false }) => {
	return (
		<section className='profile-load-error'>
			<h1 className='profile-load-error-heading'>{LOAD_ERROR_MESSAGES.PROFILE.HEADING}</h1>

			<p className='profile-load-error-description'>{LOAD_ERROR_MESSAGES.PROFILE.DESCRIPTION}</p>

			<div className='profile-load-error-action'>
				<Button type='button' label={LOAD_ERROR_MESSAGES.PROFILE.RETRY_LABEL} onClick={onRetryClick} disabled={isRetrying} />
			</div>
		</section>
	);
};

export default ProfileLoadError;
