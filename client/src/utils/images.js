import {
	ACCEPTED_IMAGE_TYPES,
	MAX_IMAGE_LONG_EDGE,
	RESIZED_IMAGE_BACKGROUND,
	RESIZED_IMAGE_EXTENSION,
	RESIZED_IMAGE_QUALITY,
	RESIZED_IMAGE_TYPE,
} from '../constants/validation';

const MIN_IMAGE_EDGE = 1;

export const isAcceptedImageType = (file) => ACCEPTED_IMAGE_TYPES.includes(file?.type);

const getResizedFileName = (fileName) => {
	const extensionStart = fileName.lastIndexOf('.');
	const baseName = extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName;

	return `${baseName}.${RESIZED_IMAGE_EXTENSION}`;
};

const canvasToBlob = (canvas) =>
	new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error('Could not encode the resized image'));
				}
			},
			RESIZED_IMAGE_TYPE,
			RESIZED_IMAGE_QUALITY,
		);
	});

export const resizeImage = async (imageFile) => {
	const bitmap = await createImageBitmap(imageFile);

	try {
		const longEdge = Math.max(bitmap.width, bitmap.height);

		// Images within the limit are sent untouched: re-encoding would lose quality and can make small PNG/WebP files larger.
		if (longEdge <= MAX_IMAGE_LONG_EDGE) {
			return imageFile;
		}

		const scale = MAX_IMAGE_LONG_EDGE / longEdge;

		const canvas = document.createElement('canvas');
		canvas.width = Math.max(MIN_IMAGE_EDGE, Math.round(bitmap.width * scale));
		canvas.height = Math.max(MIN_IMAGE_EDGE, Math.round(bitmap.height * scale));

		const context = canvas.getContext('2d');
		context.fillStyle = RESIZED_IMAGE_BACKGROUND;
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

		const blob = await canvasToBlob(canvas);

		return new File([blob], getResizedFileName(imageFile.name), { type: RESIZED_IMAGE_TYPE });
	} finally {
		bitmap.close();
	}
};
