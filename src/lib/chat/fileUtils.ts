const IMAGE_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'jfif',
	'pjpeg',
	'pjp',
	'apng',
	'png',
	'gif',
	'webp',
	'bmp',
	'ico',
	'cur',
	'avif'
]);

const IMAGE_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/bmp',
	'image/x-icon',
	'image/avif',
	'image/apng',
	'image/svg+xml'
]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'm4p', 'webm', 'mov']);

const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'mp3', 'm4a', 'oga', 'ogg', 'opus', 'wav']);

const AUDIO_MIME_TYPES = new Set([
	'audio/aac',
	'audio/mpeg',
	'audio/mp3',
	'audio/flac',
	'audio/x-flac',
	'audio/mp4',
	'audio/ogg',
	'audio/opus',
	'audio/wav',
	'audio/x-wav',
	'audio/x-pn-wav',
	'audio/webm'
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

	isImageExtension(extension: string): boolean {
		return IMAGE_EXTENSIONS.has(extension);
	},

	isImageMimeType(mimeType: string): boolean {
		return IMAGE_MIME_TYPES.has(mimeType);
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

	isVideoExtension(extension: string): boolean {
		return VIDEO_EXTENSIONS.has(extension);
	},

	isVideoMimeType(mimeType: string): boolean {
		return VIDEO_MIME_TYPES.has(mimeType);
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

	isAudioExtension(extension: string): boolean {
		return AUDIO_EXTENSIONS.has(extension);
	},

	isAudioMimeType(mimeType: string): boolean {
		return AUDIO_MIME_TYPES.has(mimeType);
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
	},

	async getMediaDimensions(
		file: File,
		forcedType?: 'image' | 'video'
	): Promise<{ width: number; height: number }> {
		if (forcedType) {
			if (forcedType === 'image') {
				return getImageDimensions(file);
			} else if (forcedType === 'video') {
				return getVideoDimensions(file);
			} else {
				throw new Error(`Unsupported forced type: ${forcedType}`);
			}
		}

		const fileType = file.type.split('/')[0];

		if (fileType === 'image') {
			return getImageDimensions(file);
		} else if (fileType === 'video') {
			return getVideoDimensions(file);
		} else {
			throw new Error(`Unsupported file type: ${file.type}`);
		}
	},

	async getPreviewURL(
		file: File | Blob,
		expectedType: 'image' | 'video' | 'audio'
	): Promise<string> {
		const url = URL.createObjectURL(file);

		try {
			switch (expectedType) {
				case 'image':
					const imageResult = await tryLoadAsImage(url);
					if (imageResult.success) {
						return url;
					}
					throw new Error('File is not an image');

				case 'video':
					const videoResult = await tryLoadAsVideo(url);
					if (videoResult.success) {
						return url;
					}
					throw new Error('File is not a video');

				case 'audio':
					const audioResult = await tryLoadAsAudio(url);
					if (audioResult.success) {
						return url;
					}
					throw new Error('File is not an audio');

				default:
					URL.revokeObjectURL(url);
					throw new Error('Unsupported file type');
			}
		} catch (error) {
			URL.revokeObjectURL(url);
			throw new Error('Failed to load file: ' + error);
		}
	},

	async isValidMediaFile(
		file: File
	): Promise<{ success: boolean; type?: 'image' | 'video' | 'audio' }> {
		const url = URL.createObjectURL(file);
		try {
			const imageResult = await tryLoadAsImage(url);
			if (imageResult.success) {
				URL.revokeObjectURL(url);
				return { success: true, type: 'image' };
			}

			const videoResult = await tryLoadAsVideo(url);
			if (videoResult.success) {
				URL.revokeObjectURL(url);
				return { success: true, type: 'video' };
			}

			const audioResult = await tryLoadAsAudio(url);
			if (audioResult.success) {
				URL.revokeObjectURL(url);
				return { success: true, type: 'audio' };
			}

			URL.revokeObjectURL(url);
			return { success: false };
		} catch (error) {
			URL.revokeObjectURL(url);
			return { success: false };
		}
	}
};

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);

		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve({
				width: img.naturalWidth,
				height: img.naturalHeight
			});
		};

		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};

		img.src = url;
	});
}

function getVideoDimensions(file: File): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		const url = URL.createObjectURL(file);

		video.onloadedmetadata = () => {
			URL.revokeObjectURL(url);
			resolve({
				width: video.videoWidth,
				height: video.videoHeight
			});
		};

		video.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load video'));
		};

		video.src = url;
	});
}

function tryLoadAsImage(url: string): Promise<{ success: boolean }> {
	return new Promise((resolve) => {
		const img = new Image();
		const timeout = setTimeout(() => {
			img.src = '';
			resolve({ success: false });
		}, 3000);

		img.onload = () => {
			clearTimeout(timeout);
			resolve({ success: true });
		};

		img.onerror = () => {
			clearTimeout(timeout);
			resolve({ success: false });
		};

		img.src = url;
	});
}

function tryLoadAsVideo(url: string): Promise<{ success: boolean }> {
	return new Promise((resolve) => {
		const video = document.createElement('video');
		const timeout = setTimeout(() => {
			video.src = '';
			resolve({ success: false });
		}, 3000);

		video.onloadedmetadata = () => {
			clearTimeout(timeout);
			const isValid = video.videoWidth > 0 && video.videoHeight > 0;
			resolve({ success: isValid });
		};

		video.onerror = () => {
			clearTimeout(timeout);
			resolve({ success: false });
		};

		video.src = url;
		video.load();
	});
}

function tryLoadAsAudio(url: string): Promise<{ success: boolean }> {
	return new Promise((resolve) => {
		const audio = new Audio();
		const timeout = setTimeout(() => {
			audio.src = '';
			resolve({ success: false });
		}, 3000);

		audio.onloadedmetadata = () => {
			clearTimeout(timeout);
			const isValid = audio.duration > 0 && !isNaN(audio.duration);
			resolve({ success: isValid });
		};

		audio.onerror = () => {
			clearTimeout(timeout);
			resolve({ success: false });
		};

		audio.src = url;
		audio.load();
	});
}
