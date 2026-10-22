import { useRef, useState } from 'react';

import { ACTION_FALLBACK_MESSAGES, VALIDATION_MESSAGES } from '../../constants/errorMessages';
import { MAX_CAPTION_LENGTH, UPLOAD_FIELDS } from '../../constants/validation';
import { CREATE_MODES } from '../../constants/stories';
import { getFormErrors, isUnauthenticatedError } from '../../utils/errors';

import Button from '../Button/Button';
import ImageInput from '../ImageInput/ImageInput';
import PictureFrameIcon from '../icons/PictureFrameIcon';

import './AddImagePostForm.css';

const AddImagePostForm = ({ mode = CREATE_MODES.POST, submitHandler, onCancelClick }) => {
	const [uploadedImage, setUploadedImage] = useState(null);
	const [caption, setCaption] = useState('');
	const [pictureError, setPictureError] = useState('');
	const [captionError, setCaptionError] = useState('');
	const [formError, setFormError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isSubmittingRef = useRef(false);

	const isStory = mode === CREATE_MODES.STORY;

	const pictureChangeHandler = (image) => {
		setUploadedImage(image);
		setPictureError('');
		setFormError('');
	};

	const captionChangeHandler = (e) => {
		setCaption(e.target.value);
		setCaptionError('');
		setFormError('');
	};

	const onSubmit = async (e) => {
		e.preventDefault();

		if (isSubmittingRef.current) {
			return;
		}

		if (!uploadedImage) {
			setPictureError(VALIDATION_MESSAGES.PICTURE_REQUIRED);

			return;
		}

		setPictureError('');
		setCaptionError('');
		setFormError('');
		isSubmittingRef.current = true;
		setIsSubmitting(true);

		try {
			await submitHandler(uploadedImage, caption);
		} catch (error) {
			if (isUnauthenticatedError(error)) {
				return;
			}

			const { fieldErrors, formError: submitFormError } = getFormErrors(
				error,
				[UPLOAD_FIELDS.POST_IMAGE, UPLOAD_FIELDS.POST_CAPTION],
				ACTION_FALLBACK_MESSAGES.UPLOAD_PICTURE,
			);

			setPictureError(fieldErrors[UPLOAD_FIELDS.POST_IMAGE]?.[0] ?? '');
			setCaptionError(fieldErrors[UPLOAD_FIELDS.POST_CAPTION]?.[0] ?? '');
			setFormError(submitFormError);
		} finally {
			isSubmittingRef.current = false;
			setIsSubmitting(false);
		}
	};

	return (
		<form id='add-image-post-form' onSubmit={onSubmit} className={isStory ? 'add-image-post-form is-story' : 'add-image-post-form'}>
			<div className={`add-image-post-image-wrapper ${pictureError ? 'has-error' : ''}`.trim()}>
				<ImageInput
					onChange={pictureChangeHandler}
					onInvalidFile={setPictureError}
					PlaceHolderImageProp={PictureFrameIcon}
					placeholderText='Choose a Picture'
					iconWidthProp={90}
					iconHeightProp={90}
					fontSizeProp={20}
					hasBlurredBackdrop={isStory}
				/>

				{pictureError ? <span className='field-error'>{pictureError}</span> : null}
			</div>

			{isStory ? null : (
				<textarea
					className={captionError ? 'caption-input has-error' : 'caption-input'}
					placeholder='Write a caption...'
					value={caption}
					maxLength={MAX_CAPTION_LENGTH}
					onChange={captionChangeHandler}
					aria-invalid={Boolean(captionError)}
				/>
			)}

			{captionError ? <span className='field-error caption-error'>{captionError}</span> : null}

			{formError ? (
				<p className='form-error add-image-post-error' role='alert'>
					{formError}
				</p>
			) : null}

			<div className='button-row'>
				<Button type='submit' label='Share' disabled={isSubmitting} />

				<Button type='button' label='Cancel' variant='secondary' onClick={onCancelClick} />
			</div>
		</form>
	);
};

export default AddImagePostForm;
