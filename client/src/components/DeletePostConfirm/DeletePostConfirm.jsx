import Button from '../Button/Button';

import './DeletePostConfirm.css';

const DeletePostConfirm = ({ onDeleteClick, onCancelClick, isDeleting = false, errorMessage = '' }) => {
	return (
		<div className='delete-post-confirm'>
			<p className='delete-post-message'>This post and its comments will be permanently deleted. This cannot be undone.</p>

			{errorMessage ? <p className='form-error'>{errorMessage}</p> : null}

			<div className='delete-post-actions'>
				<Button type='button' label='Delete' onClick={onDeleteClick} disabled={isDeleting} />

				<Button type='button' label='Cancel' variant='secondary' onClick={onCancelClick} />
			</div>
		</div>
	);
};

export default DeletePostConfirm;
