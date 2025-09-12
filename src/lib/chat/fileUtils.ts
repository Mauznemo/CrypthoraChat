const IMAGE_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'gif',
	'webp',
	'bmp',
	'ico',
	'tiff',
	'tif',
	'avif',
	'apng'
]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'mov', 'webm', 'ogv', 'avi', 'mpeg', 'mpg']);

const AUDIO_EXTENSIONS = new Set(['mp3', 'ogg', 'wav', 'flac']);

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

	/** Check if a filename has a video extension */
	isVideoFile(filename: string): boolean {
		if (!filename || typeof filename !== 'string') {
			return false;
		}

		const lastDotIndex = filename.lastIndexOf('.');
		if (lastDotIndex === -1) {
			return false;
		}

		const extension = filename.substring(lastDotIndex + 1).toLowerCase();
		return VIDEO_EXTENSIONS.has(extension);
	},

	/** Check if a filename has an audio extension */
	isAudioFile(filename: string): boolean {
		if (!filename || typeof filename !== 'string') {
			return false;
		}

		const lastDotIndex = filename.lastIndexOf('.');
		if (lastDotIndex === -1) {
			return false;
		}

		const extension = filename.substring(lastDotIndex + 1).toLowerCase();
		return AUDIO_EXTENSIONS.has(extension);
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
	},

	async downloadFile(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);

		fileUtils.downloadFileFromUrl(url, filename);

		setTimeout(() => URL.revokeObjectURL(url), 1000);
	},

	async downloadFileFromUrl(url: string, filename: string) {
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	},

	formatFileSize(bytes: number, decimals = 2): string {
		if (bytes === 0) return '0 B';

		const k = 1024;
		const sizes = ['B', 'kB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const size = bytes / Math.pow(k, i);

		return `${size.toFixed(decimals)} ${sizes[i]}`;
	}
};
