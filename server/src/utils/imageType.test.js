const { IMAGE_TYPES, detectImageType } = require('./imageType');

const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const WEBP_BYTES = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20];

describe('detectImageType', () => {
	it('detects a JPEG from its magic bytes', () => {
		expect(detectImageType(Buffer.from(JPEG_BYTES))).toBe(IMAGE_TYPES.JPEG);
	});

	it('detects a PNG from its magic bytes', () => {
		expect(detectImageType(Buffer.from(PNG_BYTES))).toBe(IMAGE_TYPES.PNG);
	});

	it('detects a WebP from its RIFF container and WEBP marker', () => {
		expect(detectImageType(Buffer.from(WEBP_BYTES))).toBe(IMAGE_TYPES.WEBP);
	});

	it('exposes the three accepted MIME types', () => {
		expect(IMAGE_TYPES).toEqual({ JPEG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp' });
	});

	it('rejects a text file renamed to .jpg because only the content is checked', () => {
		expect(detectImageType(Buffer.from('this is just a text file named photo.jpg'))).toBeNull();
	});

	it('rejects a GIF', () => {
		expect(detectImageType(Buffer.from('GIF89a\x01\x00\x01\x00', 'binary'))).toBeNull();
	});

	it('rejects a PDF', () => {
		expect(detectImageType(Buffer.from('%PDF-1.7\n'))).toBeNull();
	});

	it('rejects a RIFF container that is not WebP (e.g. WAV)', () => {
		const wavBytes = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];

		expect(detectImageType(Buffer.from(wavBytes))).toBeNull();
	});

	it('rejects a truncated JPEG signature', () => {
		expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
	});

	it('rejects a truncated PNG signature', () => {
		expect(detectImageType(Buffer.from(PNG_BYTES.slice(0, 7)))).toBeNull();
	});

	it('rejects a RIFF header too short to contain the WEBP marker', () => {
		expect(detectImageType(Buffer.from(WEBP_BYTES.slice(0, 10)))).toBeNull();
	});

	it('rejects an empty buffer', () => {
		expect(detectImageType(Buffer.alloc(0))).toBeNull();
	});

	it.each([[undefined], [null], ['not a buffer'], [{ length: 10 }], [new Uint8Array(JPEG_BYTES)]])('rejects a non-Buffer value (%p)', (value) => {
		expect(detectImageType(value)).toBeNull();
	});
});
