import { useState } from 'react';

import { ACTION_FALLBACK_MESSAGES, VALIDATION_MESSAGES } from '../../constants/errorMessages';
import { getErrorMessage, isUnauthenticatedError } from '../../utils/errors';

import Button from '../Button/Button';
import ImageInput from '../ImageInput/ImageInput';
import PictureFrameIcon from '../icons/PictureFrameIcon';

import './AddImagePostForm.css';

const AddImagePostForm = ({ addImagePostHandler, onCancelClick }) => {
	const [uploadedImage, setUploadedImage] = useState(null);
	const [caption, setCaption] = useState('');
	const [pictureError, setPictureError] = useState('');
	const [formError, setFormError] = useState('');

	const pictureChangeHandler = (image) => {
		setUploadedImage(image);
		setPictureError('');
		setFormError('');
	};

	const captionChangeHandler = (e) => {
		setCaption(e.target.value);
		setFormError('');
	};

	const onSubmit = async (e) => {
		e.preventDefault();

		if (!uploadedImage) {
			setPictureError(VALIDATION_MESSAGES.PICTURE_REQUIRED);

			return;
		}

		setFormError('');

		try {
			await addImagePostHandler(uploadedImage, caption);
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				return;
			}

			setFormError(getErrorMessage(error, ACTION_FALLBACK_MESSAGES.UPLOAD_PICTURE));
		}
	};

	return (
		<form id='add-image-post-form' onSubmit={onSubmit} className='add-image-post-form'>
			<div className={`add-image-post-image-wrapper ${pictureError ? 'has-error' : ''}`.trim()}>
				<ImageInput
					onChange={pictureChangeHandler}
					PlaceHolderImageProp={PictureFrameIcon}
					placeholderText='Choose a Picture'
					iconWidthProp={90}
					iconHeightProp={90}
					fontSizeProp={20}
				/>

				{pictureError ? <span className='field-error'>{pictureError}</span> : null}
			</div>

			<textarea className='caption-input' placeholder='Write a caption...' value={caption} onChange={captionChangeHandler} />

			{formError ? (
				<p className='form-error add-image-post-error' role='alert'>
					{formError}
				</p>
			) : null}

			<div className='button-row'>
				<Button type='submit' label='Submit' />

				<Button type='button' label='Cancel' variant='secondary' onClick={onCancelClick} />
			</div>
		</form>
	);
};

export default AddImagePostForm;
