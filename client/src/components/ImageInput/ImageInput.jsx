import { useState, useEffect, useRef, Fragment } from 'react';

import PictureFrameIcon from '../icons/PictureFrameIcon';

import './ImageInput.css';

const defaultIconWidth = 90;
const defaultIconHeight = 90;
const defaultFontSize = 22;

const ImageInput = (props) => {
	const [uploadedImage, setUploadedImage] = useState(null);
	const [imagePreview, setImagePreview] = useState(null);

	const inputRef = useRef(null);

	const { onChange, initialValue, placeholderText, isRoundImage, PlaceHolderImageProp, iconWidthProp, iconHeightProp, fontSizeProp } = props;

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
		setUploadedImage(e.target.files[0]);
		onChange(e.target.files[0]);
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

				<input type='file' id='picture' name='picture' onChange={onChangeHandler} ref={inputRef} />
			</div>

			<div className={getPreviewWrapperClasses()}>
				<img src={imagePreview} alt='preview' />

				<button
					onClick={(e) => {
						e.preventDefault();
						inputRef.current.click();
					}}
					className='image-change-button'
				>
					Change
				</button>
			</div>
		</Fragment>
	);
};

export default ImageInput;
