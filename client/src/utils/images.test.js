import { isAcceptedImageType, resizeImage } from './images';

const buildImage = (name = 'photo.png', type = 'image/png') => new File(['(image)'], name, { type });

describe('isAcceptedImageType', () => {
	it.each([['image/jpeg'], ['image/png'], ['image/webp']])('accepts %s', (type) => {
		expect(isAcceptedImageType(buildImage('file', type))).toBe(true);
	});

	it.each([['image/gif'], ['image/svg+xml'], ['image/heic'], ['application/pdf'], ['text/plain'], ['']])('rejects %p', (type) => {
		expect(isAcceptedImageType(buildImage('file', type))).toBe(false);
	});

	it.each([[undefined], [null]])('rejects %p without throwing', (file) => {
		expect(isAcceptedImageType(file)).toBe(false);
	});
});

describe('resizeImage', () => {
	let bitmap;
	let context;
	let canvasWidthHeight;
	let toBlobSpy;
	let getContextSpy;

	const givenBitmap = (width, height) => {
		bitmap = { width, height, close: jest.fn() };
		global.createImageBitmap = jest.fn().mockResolvedValue(bitmap);
	};

	beforeEach(() => {
		context = { fillStyle: '', fillRect: jest.fn(), drawImage: jest.fn() };
		canvasWidthHeight = null;

		getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() {
			canvasWidthHeight = { width: this.width, height: this.height };

			return context;
		});
		toBlobSpy = jest
			.spyOn(HTMLCanvasElement.prototype, 'toBlob')
			.mockImplementation((callback) => callback(new Blob(['(resized)'], { type: 'image/jpeg' })));
	});

	afterEach(() => {
		getContextSpy.mockRestore();
		toBlobSpy.mockRestore();
		delete global.createImageBitmap;
	});

	describe('an image within the limit', () => {
		it.each([
			['exactly 2048 wide', 2048, 1000],
			['exactly 2048 tall', 1000, 2048],
			['exactly 2048 on both edges', 2048, 2048],
			['smaller than the limit', 800, 600],
			['a single pixel', 1, 1],
		])('returns the original file untouched when it is %s', async (_name, width, height) => {
			givenBitmap(width, height);
			const original = buildImage();

			const result = await resizeImage(original);

			expect(result).toBe(original);
			expect(toBlobSpy).not.toHaveBeenCalled();
			expect(getContextSpy).not.toHaveBeenCalled();
		});

		it('decodes the original file to measure it', async () => {
			givenBitmap(800, 600);
			const original = buildImage();

			await resizeImage(original);

			expect(global.createImageBitmap).toHaveBeenCalledWith(original);
		});

		it('releases the decoded bitmap', async () => {
			givenBitmap(800, 600);

			await resizeImage(buildImage());

			expect(bitmap.close).toHaveBeenCalledTimes(1);
		});
	});

	describe('an image over the limit', () => {
		it('scales a wide image so its width becomes 2048 and keeps the aspect ratio', async () => {
			givenBitmap(4096, 2048);

			await resizeImage(buildImage());

			expect(canvasWidthHeight).toEqual({ width: 2048, height: 1024 });
			expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 1024);
		});

		it('scales a tall image so its height becomes 2048 and keeps the aspect ratio', async () => {
			givenBitmap(3000, 6000);

			await resizeImage(buildImage());

			expect(canvasWidthHeight).toEqual({ width: 1024, height: 2048 });
		});

		it('scales a square image to 2048 by 2048', async () => {
			givenBitmap(5000, 5000);

			await resizeImage(buildImage());

			expect(canvasWidthHeight).toEqual({ width: 2048, height: 2048 });
		});

		it('rounds the short edge to a whole pixel', async () => {
			givenBitmap(4001, 3001);

			await resizeImage(buildImage());

			expect(canvasWidthHeight).toEqual({ width: 2048, height: Math.round(3001 * (2048 / 4001)) });
		});

		it('never lets the short edge of an extreme panorama collapse to zero', async () => {
			givenBitmap(40000, 10);

			await resizeImage(buildImage());

			expect(canvasWidthHeight).toEqual({ width: 2048, height: 1 });
		});

		it('scales an image one pixel over the limit', async () => {
			givenBitmap(2049, 1000);

			await resizeImage(buildImage());

			expect(canvasWidthHeight.width).toBe(2048);
		});

		it('fills a white background first so transparent PNGs do not turn black as JPEG', async () => {
			const callOrder = [];

			givenBitmap(4096, 2048);
			context.fillRect.mockImplementation(() => callOrder.push('fill'));
			context.drawImage.mockImplementation(() => callOrder.push('draw'));

			await resizeImage(buildImage());

			expect(context.fillStyle).toBe('#ffffff');
			expect(context.fillRect).toHaveBeenCalledWith(0, 0, 2048, 1024);
			expect(callOrder).toEqual(['fill', 'draw']);
		});

		it('encodes as JPEG at quality 0.9', async () => {
			givenBitmap(4096, 2048);

			await resizeImage(buildImage());

			expect(toBlobSpy).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
		});

		it('resolves with a JPEG File', async () => {
			givenBitmap(4096, 2048);

			const result = await resizeImage(buildImage('holiday.png'));

			expect(result).toBeInstanceOf(File);
			expect(result.type).toBe('image/jpeg');
		});

		it.each([
			['holiday.png', 'holiday.jpg'],
			['holiday.final.webp', 'holiday.final.jpg'],
			['holiday', 'holiday.jpg'],
			['.hidden', '.hidden.jpg'],
		])('renames %s to %s', async (originalName, expectedName) => {
			givenBitmap(4096, 2048);

			const result = await resizeImage(buildImage(originalName));

			expect(result.name).toBe(expectedName);
		});

		it('releases the decoded bitmap', async () => {
			givenBitmap(4096, 2048);

			await resizeImage(buildImage());

			expect(bitmap.close).toHaveBeenCalledTimes(1);
		});

		it('rejects and still releases the bitmap when the canvas cannot encode the image', async () => {
			givenBitmap(4096, 2048);
			toBlobSpy.mockImplementation((callback) => callback(null));

			await expect(resizeImage(buildImage())).rejects.toThrow('Could not encode the resized image');
			expect(bitmap.close).toHaveBeenCalledTimes(1);
		});
	});

	describe('an image the browser cannot decode', () => {
		it('rejects with the decoding error', async () => {
			const decodeError = new Error('The source image could not be decoded');

			global.createImageBitmap = jest.fn().mockRejectedValue(decodeError);

			await expect(resizeImage(buildImage())).rejects.toBe(decodeError);
		});
	});
});
