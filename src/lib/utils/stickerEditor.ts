import { fileUtils } from '$lib/chat/fileUtils';
import { modalStore } from '$lib/stores/modal.svelte';
import {
	removeBackground as imglyRemoveBackground,
	preload as imglyPreload,
	type Config as ImglyConfig
} from '@imgly/background-removal';

interface RemoveBgOptions {
	model?: 'small' | 'medium';
}

function showProgressModal(currentBytes: number, totalBytes: number) {
	const progress = (currentBytes / totalBytes) * 100;

	if (progress >= 100) {
		modalStore.close();
	}

	const current = fileUtils.formatFileSize(currentBytes);
	const total = fileUtils.formatFileSize(totalBytes);

	const title = 'Downloading Model';
	const content = current + ' of ' + total + ' (' + progress.toFixed(2) + '%) downloaded';
	if (!modalStore.isModalOpen('model-download-progress-modal')) {
		modalStore.open({
			title,
			content,
			id: 'model-download-progress-modal',
			showCloseButton: false,
			dismissible: false
		});
	} else {
		modalStore.updateContent('model-download-progress-modal', content);
	}
}

/**
 * Removes the background from an HTMLImageElement and returns a new HTMLImageElement.
 */
export async function removeBackground(image: HTMLImageElement): Promise<HTMLImageElement> {
	const tempCanvas = document.createElement('canvas');
	tempCanvas.width = image.width;
	tempCanvas.height = image.height;
	const tempCtx = tempCanvas.getContext('2d');
	if (!tempCtx) {
		throw new Error('Failed to get 2D context');
	}
	tempCtx.drawImage(image, 0, 0);

	// const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
	const blobInput: Blob = await new Promise((resolve) =>
		tempCanvas.toBlob((b) => resolve(b!), 'image/png')
	);

	const config: ImglyConfig = {
		debug: true, // enable debug logging in the library
		model: 'isnet_fp16',
		progress: (key, current, total) => {
			console.log(`[imgly bg-removal] Progress for ${key}: ${current} / ${total}`);
			if (key.startsWith('fetch:/models')) {
				showProgressModal(current, total);
			}
		}
	};

	// Optionally, before running, you can try preloading assets
	try {
		console.log('[imgly bg-removal] Preloading model assets...');
		await imglyPreload(config);
		console.log('[imgly bg-removal] Preload complete.');
	} catch (err) {
		console.warn('[imgly bg-removal] Preload failed or skipped:', err);
		// It's fine if preload fails or is unnecessary; the actual call will still download as needed
	}

	// Now invoke removal
	const blob = await imglyRemoveBackground(blobInput, config);

	const resultImage = new Image();
	resultImage.src = URL.createObjectURL(blob);

	await new Promise<void>((resolve, reject) => {
		resultImage.onload = () => {
			console.log('[imgly bg-removal] Result image loaded');
			resolve();
		};
		resultImage.onerror = (e) => {
			console.error('[imgly bg-removal] Error loading result image', e);
			reject(e);
		};
	});

	URL.revokeObjectURL(resultImage.src);

	return resultImage;
}
