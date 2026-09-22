import { useState } from 'react';

import Button from '../Button/Button';
import ImageInput from '../ImageInput/ImageInput';
import PictureFrameIcon from '../icons/PictureFrameIcon';

import './AddImagePostForm.css';

const AddImagePostForm = ({ addImagePostHandler, onCancelClick }) => {
	const [uploadedImage, setUploadedImage] = useState(null);
	const [caption, setCaption] = useState('');
	const [pictureError, setPictureError] = useState('');

	const pictureChangeHandler = (image) => {
		setUploadedImage(image);
		setPictureError('');
	};

	const onSubmit = (e) => {
		e.preventDefault();

		if (!uploadedImage) {
			setPictureError('Please choose a picture');

			return;
		}

		addImagePostHandler(uploadedImage, caption);
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

			<textarea className='caption-input' placeholder='Write a caption...' value={caption} onChange={(e) => setCaption(e.target.value)} />

			<div className='button-row'>
				<Button type='submit' label='Submit' />

				<Button type='button' label='Cancel' variant='secondary' onClick={onCancelClick} />
			</div>
		</form>
	);
};

export default AddImagePostForm;
