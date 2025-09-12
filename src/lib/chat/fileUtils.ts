const IMAGE_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'gif',
	'webp',
	'svg',
	'bmp',
	'ico',
	'tiff',
	'tif',
	'avif',
	'apng'
]);

export const fileUtils = {
	/** Check if a filename has an image extension */
	isImageFile(filename: string): boolean {
		if (!filename || typeof filename !== 'string') {
			return false;
		}

		const lastDotIndex = filename.lastIndexOf('.');
		if (lastDotIndex === -1) {
			return false;
		}

		const extension = filename.substring(lastDotIndex + 1).toLowerCase();
		return IMAGE_EXTENSIONS.has(extension);
	},

	/** Get the file extension from a filename */
	getFileExtension(filename: string): string | null {
		if (!filename || typeof filename !== 'string') {
			return null;
		}

		const lastDotIndex = filename.lastIndexOf('.');
		if (lastDotIndex === -1) {
			return null;
		}

		return filename.substring(lastDotIndex + 1).toLowerCase();
	}
};
