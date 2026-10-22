import { useState, useEffect, useRef, Fragment } from 'react';

import { ERROR_CODES } from '../../constants/errorCodes';
import { ERROR_MESSAGES } from '../../constants/errorMessages';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../constants/validation';
import { isAcceptedImageType } from '../../utils/images';

import PictureFrameIcon from '../icons/PictureFrameIcon';
import CloseSmallIcon from '../icons/CloseSmall';

import './ImageInput.css';

const defaultIconWidth = 90;
const defaultIconHeight = 90;
const defaultFontSize = 22;

const ImageInput = (props) => {
	const [uploadedImage, setUploadedImage] = useState(null);
	const [imagePreview, setImagePreview] = useState(null);

	const inputRef = useRef(null);

	const {
		onChange,
		onRemove,
		onInvalidFile,
		initialValue,
		placeholderText,
		isRoundImage,
		PlaceHolderImageProp,
		iconWidthProp,
		iconHeightProp,
		fontSizeProp,
		hasBlurredBackdrop,
	} = props;

	useEffect(() => {
		if (initialValue) {
			setUploadedImage(initialValue);
		}
	}, [initialValue]);

	useEffect(() => {
		if (!uploadedImage) {
			setImagePreview(null);
			return;
		}

		if (uploadedImage === initialValue) {
			setImagePreview(uploadedImage);
			return;
		}

		const objectUrl = URL.createObjectURL(uploadedImage);
		setImagePreview(objectUrl);

		// free memory when ever this component is unmounted
		return () => URL.revokeObjectURL(objectUrl);
	}, [uploadedImage, initialValue]);

	const onChangeHandler = (e) => {
		const selectedImage = e.target.files[0];

		if (!selectedImage) {
			return;
		}

		if (!isAcceptedImageType(selectedImage)) {
			inputRef.current.value = '';
			onInvalidFile?.(ERROR_MESSAGES[ERROR_CODES.IMAGE_TYPE_INVALID]);

			return;
		}

		if (selectedImage.size > MAX_IMAGE_BYTES) {
			inputRef.current.value = '';
			onInvalidFile?.(ERROR_MESSAGES[ERROR_CODES.IMAGE_TOO_LARGE]);

			return;
		}

		setUploadedImage(selectedImage);
		onChange(selectedImage);
	};

	const openFilePicker = (e) => {
		e.preventDefault();
		inputRef.current.click();
	};

	const removeImageHandler = () => {
		inputRef.current.value = '';
		setUploadedImage(null);
		onRemove();
	};

	const getImageInputWrapperClasses = () => {
		let imageInputWrapperClasses = 'image-input-wrapper';

		if (isRoundImage) {
			imageInputWrapperClasses = imageInputWrapperClasses.concat(' round-image');
		}

		if (uploadedImage) {
			imageInputWrapperClasses = imageInputWrapperClasses.concat(' hidden');
		}

		return imageInputWrapperClasses;
	};

	const getPreviewWrapperClasses = () => {
		let previewWrapperClasses = 'preview-wrapper';

		if (isRoundImage) {
			previewWrapperClasses = previewWrapperClasses.concat(' round-image');
		}

		if (onRemove) {
			previewWrapperClasses = previewWrapperClasses.concat(' removable');
		}

		if (hasBlurredBackdrop) {
			previewWrapperClasses = previewWrapperClasses.concat(' has-backdrop');
		}

		if (!uploadedImage) {
			previewWrapperClasses = previewWrapperClasses.concat(' hidden');
		}

		return previewWrapperClasses;
	};

	const PlaceHolderImage = PlaceHolderImageProp || PictureFrameIcon;
	const iconWidth = iconWidthProp || defaultIconWidth;
	const iconHeight = iconHeightProp || defaultIconHeight;
	const fontSize = fontSizeProp || defaultFontSize;

	return (
		<Fragment>
			<div className={getImageInputWrapperClasses()}>
				<label htmlFor='picture'>
					<PlaceHolderImage iconColorProp='currentColor' iconWidthProp={iconWidth} iconHeightProp={iconHeight} />

					{placeholderText ? <span style={{ fontSize: `${fontSize}px` }}>{placeholderText}</span> : null}
				</label>

				<input type='file' id='picture' name='picture' accept={ACCEPTED_IMAGE_TYPES.join(',')} onChange={onChangeHandler} ref={inputRef} />
			</div>

			<div className={getPreviewWrapperClasses()}>
				{hasBlurredBackdrop ? (
					<div className='preview-backdrop' aria-hidden='true'>
						<img src={imagePreview} alt='' />
					</div>
				) : null}

				<img src={imagePreview} alt='preview' onClick={openFilePicker} />

				<button onClick={openFilePicker} className='image-change-button'>
					Change
				</button>

				{onRemove ? (
					<button type='button' className='image-remove-button' onClick={removeImageHandler} aria-label='Remove picture'>
						<CloseSmallIcon iconColorProp='currentColor' />
					</button>
				) : null}
			</div>
		</Fragment>
	);
};

export default ImageInput;
