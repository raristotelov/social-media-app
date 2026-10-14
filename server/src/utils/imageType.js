const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];
const WEBP_SIGNATURE_OFFSET = 8;

const IMAGE_TYPES = Object.freeze({
	JPEG: 'image/jpeg',
	PNG: 'image/png',
	WEBP: 'image/webp',
});

const startsWith = (buffer, signature, offset = 0) =>
	buffer.length >= offset + signature.length && signature.every((byte, index) => buffer[offset + index] === byte);

const detectImageType = (buffer) => {
	if (!Buffer.isBuffer(buffer)) {
		return null;
	}

	if (startsWith(buffer, JPEG_SIGNATURE)) {
		return IMAGE_TYPES.JPEG;
	}

	if (startsWith(buffer, PNG_SIGNATURE)) {
		return IMAGE_TYPES.PNG;
	}

	if (startsWith(buffer, RIFF_SIGNATURE) && startsWith(buffer, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)) {
		return IMAGE_TYPES.WEBP;
	}

	return null;
};

module.exports = {
	IMAGE_TYPES,
	detectImageType,
};
