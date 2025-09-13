import { fileUtils } from '$lib/chat/fileUtils';

export interface CompressionOptions {
	quality?: number;
	maxWidth?: number;
	maxHeight?: number;
	maintainAspectRatio?: boolean;
}

export async function convertToWebP(file: File, options: CompressionOptions = {}): Promise<Blob> {
	const { quality = 0.8, maxWidth, maxHeight, maintainAspectRatio = true } = options;

	return new Promise((resolve, reject) => {
		const img = new Image();
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');

		if (!ctx) {
			reject(new Error('Could not get canvas context'));
			return;
		}

		img.onload = () => {
			let { width, height } = img;

			if (maxWidth || maxHeight) {
				const aspectRatio = width / height;

				if (maxWidth && width > maxWidth) {
					width = maxWidth;
					if (maintainAspectRatio) height = width / aspectRatio;
				}

				if (maxHeight && height > maxHeight) {
					height = maxHeight;
					if (maintainAspectRatio) width = height * aspectRatio;
				}
			}

			canvas.width = width;
			canvas.height = height;

			ctx.drawImage(img, 0, 0, width, height);

			canvas.toBlob(
				(blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error('Failed to convert image to WebP'));
					}
				},
				'image/webp',
				quality
			);
		};

		img.onerror = () => {
			reject(new Error('Failed to load image'));
		};

		img.src = URL.createObjectURL(file);
	});
}

export function blobToFile(blob: Blob, fileName: string): File {
	return new File([blob], fileName.replace(/\.[^/.]+$/, '.webp'), {
		type: 'image/webp'
	});
}

export function isCompressible(file: File): boolean {
	if (file.type === 'image/webp' && file.size < 1024 * 1024 * 5) return false; // No need to compress again

	if (file.type === 'image/gif') {
		return false;
	}

	return fileUtils.isImageFile(file.name);
}

export async function compressImage(file: File) {
	if (!isCompressible(file)) return file;

	try {
		const webpBlob = await convertToWebP(file, {
			quality: 0.8,
			maxWidth: 1920,
			maxHeight: 1080,
			maintainAspectRatio: true
		});

		const webpFile = blobToFile(webpBlob, file.name);

		console.log('Original size:', file.size);
		console.log('Compressed size:', webpFile.size);
		console.log(
			'Compression ratio:',
			(((file.size - webpFile.size) / file.size) * 100).toFixed(1) + '%'
		);

		return webpFile;
	} catch (error) {
		console.error('Image conversion failed:', error);
		throw error;
	}
}
