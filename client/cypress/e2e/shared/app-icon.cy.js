const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IMAGE_CONTENT_TYPE = /^image\//;
const MANIFEST_CONTENT_TYPE = /json/;

const bytesOf = (body) => Array.from(body, (char) => char.charCodeAt(0));

const readUint32 = (bytes, offset) => bytes[offset] * 2 ** 24 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];

const readPngSize = (body) => {
	const bytes = bytesOf(body);

	return {
		signature: bytes.slice(0, 8),
		width: readUint32(bytes, 16),
		height: readUint32(bytes, 20),
	};
};

const readIcoSizes = (body) => {
	const bytes = bytesOf(body);
	const count = bytes[4] + (bytes[5] << 8);

	return Array.from({ length: count }, (_, index) => {
		const entry = 6 + index * 16;

		return `${bytes[entry] || 256}x${bytes[entry + 1] || 256}`;
	});
};

const requestAsset = (url) =>
	cy.request({ url, encoding: 'binary' }).then((response) => {
		expect(response.status).to.eq(200);

		return response;
	});

const resolveFromRoot = (path) => new URL(path, `${Cypress.config('baseUrl')}/`).href;

describe('app icon', () => {
	it('loads every icon and the manifest linked from the document head', () => {
		cy.visit('/');

		cy.get('head link[rel="icon"], head link[rel="apple-touch-icon"], head link[rel="manifest"]').then(($links) => {
			const links = $links.toArray().map((link) => ({
				rel: link.getAttribute('rel'),
				href: link.href,
			}));

			expect(links.map((link) => link.rel)).to.have.members(['icon', 'apple-touch-icon', 'manifest']);

			links.forEach(({ rel, href }) => {
				requestAsset(href).then((response) => {
					const expected = rel === 'manifest' ? MANIFEST_CONTENT_TYPE : IMAGE_CONTENT_TYPE;

					expect(response.headers['content-type'], href).to.match(expected);
				});
			});
		});
	});

	it('serves the favicon with the 16, 32 and 48 pixel images', () => {
		requestAsset(resolveFromRoot('favicon.ico')).then((response) => {
			expect(response.headers['content-type']).to.match(IMAGE_CONTENT_TYPE);
			expect(readIcoSizes(response.body)).to.have.members(['16x16', '32x32', '48x48']);
		});
	});

	it('lists three manifest icons that load as images matching their declared sizes', () => {
		cy.request(resolveFromRoot('manifest.json')).then(({ body: manifest }) => {
			expect(manifest.icons.map((icon) => icon.src)).to.have.members(['favicon.ico', 'logo192.png', 'logo512.png']);

			manifest.icons.forEach((icon) => {
				requestAsset(resolveFromRoot(icon.src)).then((response) => {
					expect(response.headers['content-type'], icon.src).to.match(IMAGE_CONTENT_TYPE);

					if (icon.type === 'image/png') {
						const { signature, width, height } = readPngSize(response.body);

						expect(signature, `${icon.src} signature`).to.deep.eq(PNG_SIGNATURE);
						expect(`${width}x${height}`, icon.src).to.eq(icon.sizes);
					} else {
						expect(readIcoSizes(response.body), icon.src).to.have.members(icon.sizes.split(' '));
					}
				});
			});
		});
	});

	it('marks the two PNG manifest icons as any maskable', () => {
		cy.request(resolveFromRoot('manifest.json')).then(({ body }) => {
			const pngIcons = body.icons.filter((icon) => icon.type === 'image/png');

			expect(pngIcons).to.have.length(2);
			pngIcons.forEach((icon) => expect(icon.purpose, icon.src).to.eq('any maskable'));
		});
	});
});
