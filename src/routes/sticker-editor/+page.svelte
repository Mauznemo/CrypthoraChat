<script lang="ts">
	import { goto } from '$app/navigation';
	import { tryUploadUserSticker } from '$lib/fileUpload/upload';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { blobToFile } from '$lib/utils/imageConverter';
	import { removeBackground } from '$lib/utils/stickerEditor';
	import Icon from '@iconify/svelte';
	import { tick } from 'svelte';
	import { saveUserSticker } from './stickerEditor.remote';
	import { toastStore } from '$lib/stores/toast.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import { t } from 'svelte-i18n';

	interface CanvasObject {
		type: 'image' | 'text';
		x: number;
		y: number;
		width: number;
		height: number;
		rotation: number;
		selected: boolean;
		backgroundRemoved: boolean;
		img?: HTMLImageElement;
		text?: string;
		fontSize?: number;
	}

	let canvas = $state<HTMLCanvasElement | null>(null);
	let canvasContainer = $state<HTMLDivElement | null>(null);
	let ctx = $state<CanvasRenderingContext2D | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	let objects = $state<CanvasObject[]>([]);
	let selectedObj = $state<CanvasObject | null>(null);
	let aspectRatioLocked = $state(true);
	let isDragging = $state(false);
	let isResizing = $state(false);
	let isRotating = $state(false);
	let dragStart = $state({ x: 0, y: 0 });
	let resizeHandle = $state<number | null>(null);
	let resizeStart = $state<{
		width: number;
		height: number;
		rotation: number;
		centerX: number;
		centerY: number;
		fontSize?: number;
	} | null>(null);
	let removingBackground = $state(false);

	$effect(() => {
		if (canvas) {
			ctx = canvas.getContext('2d');
			render();
		}
	});

	$effect(() => {
		if (objects.length > 0 || selectedObj) {
			render();
		}
	});

	function containsPoint(obj: CanvasObject, px: number, py: number): boolean {
		const dx = px - obj.x;
		const dy = py - obj.y;
		const cos = Math.cos(-obj.rotation);
		const sin = Math.sin(-obj.rotation);
		const localX = dx * cos - dy * sin;
		const localY = dx * sin + dy * cos;

		return Math.abs(localX) <= obj.width / 2 && Math.abs(localY) <= obj.height / 2;
	}

	function drawObject(object: CanvasObject) {
		if (!ctx) return;

		ctx.save();
		ctx.translate(object.x, object.y);
		ctx.rotate(object.rotation);

		if (object.type === 'image' && object.img) {
			ctx.drawImage(object.img, -object.width / 2, -object.height / 2, object.width, object.height);
		} else if (object.type === 'text') {
			if (!object.backgroundRemoved) {
				ctx.fillStyle = 'white';
				ctx.beginPath();
				ctx.roundRect(-object.width / 2, -object.height / 2, object.width, object.height, 8);
				ctx.fill();
			}

			ctx.fillStyle = 'black';
			ctx.font = `bold ${object.fontSize || 24}px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(object.text || 'Text', 0, 0);
		}

		ctx.restore();
	}

	function drawSelection(object: CanvasObject) {
		if (!ctx || !object.selected) return;

		ctx.save();
		ctx.translate(object.x, object.y);
		ctx.rotate(object.rotation);

		ctx.strokeStyle = '#3b82f6';
		ctx.lineWidth = 2;
		ctx.strokeRect(-object.width / 2, -object.height / 2, object.width, object.height);

		ctx.restore();
	}

	function render() {
		if (!ctx || !canvas) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		objects.forEach((obj) => {
			drawObject(obj);
			drawSelection(obj);
		});
	}

	function getCornerPositions(obj: CanvasObject) {
		const corners = [
			{ x: -obj.width / 2, y: -obj.height / 2 },
			{ x: obj.width / 2, y: -obj.height / 2 },
			{ x: obj.width / 2, y: obj.height / 2 },
			{ x: -obj.width / 2, y: obj.height / 2 }
		];

		return corners.map((corner) => {
			const cos = Math.cos(obj.rotation);
			const sin = Math.sin(obj.rotation);
			return {
				x: obj.x + (corner.x * cos - corner.y * sin),
				y: obj.y + (corner.x * sin + corner.y * cos)
			};
		});
	}

	function getRotateHandlePosition(obj: CanvasObject) {
		const localX = 0;
		const localY = -obj.height / 2 - 30;
		const cos = Math.cos(obj.rotation);
		const sin = Math.sin(obj.rotation);

		return {
			x: obj.x + (localX * cos - localY * sin),
			y: obj.y + (localX * sin + localY * cos)
		};
	}

	function getPointerPosition(e: MouseEvent | TouchEvent): { x: number; y: number } {
		if ('touches' in e && e.touches.length > 0) {
			return { x: e.touches[0].clientX, y: e.touches[0].clientY };
		}
		return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
	}

	function handleCanvasPointerDown(e: MouseEvent | TouchEvent) {
		if (!canvas || isResizing || isRotating) return; // Prevent new selection while resizing/rotating

		const pos = getPointerPosition(e);
		const rect = canvas.getBoundingClientRect();
		const ratio = canvas.width / rect.width;
		const x = (pos.x - rect.left) * ratio;
		const y = (pos.y - rect.top) * ratio;

		selectedObj = null;

		for (let i = objects.length - 1; i >= 0; i--) {
			if (containsPoint(objects[i], x, y)) {
				selectedObj = objects[i];
				isDragging = true;
				dragStart = { x: pos.x, y: pos.y };
				break;
			}
		}

		objects.forEach((obj) => (obj.selected = obj === selectedObj));
		render();
	}

	function handleDocumentPointerMove(e: MouseEvent | TouchEvent) {
		if (!selectedObj || !canvas) return;

		e.preventDefault(); // Prevent scrolling on mobile

		const rect = canvas.getBoundingClientRect();
		const ratio = canvas.width / rect.width;
		const pos = getPointerPosition(e);
		const dx = (pos.x - dragStart.x) * ratio;
		const dy = (pos.y - dragStart.y) * ratio;

		if (isDragging && selectedObj && !isResizing && !isRotating) {
			selectedObj.x += dx;
			selectedObj.y += dy;
			dragStart = { x: pos.x, y: pos.y };
			render();
		} else if (isResizing && selectedObj && resizeHandle !== null && resizeStart) {
			const mouseX = (pos.x - rect.left) * ratio;
			const mouseY = (pos.y - rect.top) * ratio;

			// Get opposite corner in world space
			const corners = getCornerPositions(selectedObj);
			const oppositeCorner = corners[(resizeHandle + 2) % 4];

			// Calculate vector from opposite corner to mouse
			const vecX = mouseX - oppositeCorner.x;
			const vecY = mouseY - oppositeCorner.y;

			// Rotate vector back to local space
			const cos = Math.cos(-selectedObj.rotation);
			const sin = Math.sin(-selectedObj.rotation);
			let localVecX = vecX * cos - vecY * sin;
			let localVecY = vecX * sin + vecY * cos;

			if (aspectRatioLocked) {
				const origAspect = resizeStart.width / resizeStart.height;
				const proposedAspect = Math.abs(localVecX / localVecY);
				const signX = Math.sign(localVecX);
				const signY = Math.sign(localVecY);
				if (proposedAspect > origAspect) {
					// Constrain width to match height
					localVecX = signX * Math.abs(localVecY) * origAspect;
				} else {
					// Constrain height to match width
					localVecY = (signY * Math.abs(localVecX)) / origAspect;
				}
			}
			// Clamp to minimum size
			const minSize = 20;
			const signX = Math.sign(localVecX);
			const signY = Math.sign(localVecY);
			if (aspectRatioLocked) {
				const proposedWidth = Math.abs(localVecX);
				const proposedHeight = Math.abs(localVecY);
				const scale = proposedWidth / resizeStart.width;
				const minScaleW = minSize / resizeStart.width;
				const minScaleH = minSize / resizeStart.height;
				const minScale = Math.max(minScaleW, minScaleH);
				if (scale < minScale) {
					localVecX = signX * resizeStart.width * minScale;
					localVecY = signY * resizeStart.height * minScale;
				}
			} else {
				localVecX = signX * Math.max(minSize, Math.abs(localVecX));
				localVecY = signY * Math.max(minSize, Math.abs(localVecY));
			}

			// Rotate clamped local vector back to world space
			const cosPos = Math.cos(selectedObj.rotation);
			const sinPos = Math.sin(selectedObj.rotation);
			const clampedVecX = localVecX * cosPos - localVecY * sinPos;
			const clampedVecY = localVecX * sinPos + localVecY * cosPos;

			// New dimensions
			selectedObj.width = Math.abs(localVecX);
			selectedObj.height = Math.abs(localVecY);

			// Keep center at opposite corner + half the clamped vector
			selectedObj.x = oppositeCorner.x + clampedVecX / 2;
			selectedObj.y = oppositeCorner.y + clampedVecY / 2;
			if (selectedObj.type === 'text' && resizeStart.fontSize && resizeStart.width) {
				const widthRatio = selectedObj.width / resizeStart.width;
				selectedObj.fontSize = Math.max(12, Math.floor(resizeStart.fontSize * widthRatio));
			}
			render();
		} else if (isRotating) {
			const scale = rect.width / canvas.width;
			const centerX = rect.left + selectedObj.x * scale;
			const centerY = rect.top + selectedObj.y * scale;

			const angle = Math.atan2(pos.y - centerY, pos.x - centerX);
			const startAngle = Math.atan2(dragStart.y - centerY, dragStart.x - centerX);

			selectedObj.rotation = angle - startAngle + (resizeStart?.rotation || 0);

			render();
		}
	}

	function handleDocumentPointerUp(e: MouseEvent | TouchEvent) {
		if (isResizing || isRotating) {
			e.stopPropagation();
		}
		isDragging = false;
		isResizing = false;
		isRotating = false;
		resizeHandle = null;
		resizeStart = null;
	}

	function handleImportClick() {
		fileInput?.click();
	}

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				const maxSize = 300;
				let width = img.width;
				let height = img.height;

				if (width > maxSize || height > maxSize) {
					if (width > height) {
						height = (height / width) * maxSize;
						width = maxSize;
					} else {
						width = (width / height) * maxSize;
						height = maxSize;
					}
				}

				const obj: CanvasObject = {
					type: 'image',
					x: 256,
					y: 256,
					width,
					height,
					rotation: 0,
					selected: false,
					img,
					backgroundRemoved: false
				};
				objects.push(obj);
				render();
			};
			img.src = event.target?.result as string;
		};
		reader.readAsDataURL(file);

		target.value = '';
	}

	function handleAddText() {
		const text = prompt($t('utils.sticker-editor.enter-text'));
		if (!text) return;

		const fontSize = 24;
		const padding = 20;

		const tempCanvas = document.createElement('canvas');
		const tempCtx = tempCanvas.getContext('2d');
		if (!tempCtx) return;

		tempCtx.font = `${fontSize}px sans-serif`;
		const metrics = tempCtx.measureText(text);
		const textWidth = metrics.width;

		const obj: CanvasObject = {
			type: 'text',
			x: 256,
			y: 256,
			width: textWidth + padding,
			height: fontSize + padding,
			rotation: 0,
			selected: false,
			text,
			fontSize,
			backgroundRemoved: false
		};
		objects.push(obj);
		render();
	}

	function handleDuplicate() {
		if (!selectedObj) return;
		selectedObj.selected = false;
		const newObj = { ...selectedObj };
		newObj.selected = true;
		newObj.x += 20;
		newObj.y += 20;
		objects.push(newObj);
		selectedObj = newObj;
		render();
	}

	async function handleRemoveBackground() {
		if (selectedObj && selectedObj.type === 'text') {
			selectedObj.backgroundRemoved = !selectedObj.backgroundRemoved;
			render();
			return;
		}

		if (localStorage.getItem('showedBgDownloadNotice') === 'true') {
			removeBg();
			return;
		}
		modalStore.confirm(
			$t('utils.sticker-editor.download-model'),
			$t('utils.sticker-editor.download-model-confirm'),
			() => {
				localStorage.setItem('showedBgDownloadNotice', 'true');
				removeBg();
			}
		);
	}

	function handleToggleAspectRatio() {
		aspectRatioLocked = !aspectRatioLocked;
		render();
	}

	function handleDelete() {
		if (!selectedObj) return;
		const index = objects.indexOf(selectedObj);
		if (index === -1) return;
		objects.splice(index, 1);
		selectedObj = null;
		render();
	}

	async function removeBg() {
		if (!selectedObj || !selectedObj.img || selectedObj.backgroundRemoved) return;
		removingBackground = true;
		await tick();
		const newImage = await removeBackground(selectedObj.img);
		const index = objects.indexOf(selectedObj);
		if (index === -1) return;
		objects[index].img = newImage;
		objects[index].backgroundRemoved = true;
		render();
		removingBackground = false;
	}

	function handleCornerPointerDown(e: MouseEvent | TouchEvent, cornerIndex: number) {
		e.stopPropagation();
		if (!selectedObj) return;

		const pos = getPointerPosition(e);
		isResizing = true;
		resizeHandle = cornerIndex;
		dragStart = { x: pos.x, y: pos.y };
		resizeStart = {
			width: selectedObj.width,
			height: selectedObj.height,
			rotation: selectedObj.rotation,
			centerX: selectedObj.x,
			centerY: selectedObj.y,
			fontSize: selectedObj.fontSize
		};
	}

	function handleRotatePointerDown(e: MouseEvent | TouchEvent) {
		e.stopPropagation();
		if (!selectedObj) return;

		const pos = getPointerPosition(e);
		isRotating = true;
		dragStart = { x: pos.x, y: pos.y };

		const rect = canvas!.getBoundingClientRect();
		const scale = rect.width / canvas!.width;
		const centerX = rect.left + selectedObj.x * scale;
		const centerY = rect.top + selectedObj.y * scale;

		resizeStart = {
			width: selectedObj.width,
			height: selectedObj.height,
			rotation: selectedObj.rotation,
			centerX: selectedObj.x,
			centerY: selectedObj.y
		};
	}

	async function handleSaveSticker() {
		if (!canvas) return;
		selectedObj = null;
		objects.forEach((obj) => (obj.selected = false));
		render();
		const blob: Blob = await new Promise((resolve) =>
			canvas?.toBlob((b) => resolve(b!), 'image/webp', 0.8)
		);
		if (!blob) return;

		const file = blobToFile(blob, 'sticker.webp');
		const result = await tryUploadUserSticker(file);

		if (result.success) {
			await saveUserSticker(result.filePath);
			toastStore.success($t('utils.sticker-editor.sticker-saved'));
			goto('/chat');
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Shift') {
			e.preventDefault();
			aspectRatioLocked = false;
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		if (e.key === 'Shift') {
			e.preventDefault();
			aspectRatioLocked = true;
		}
	}
</script>

<svelte:window
	onmousemove={handleDocumentPointerMove}
	onmouseup={handleDocumentPointerUp}
	onpointercancel={handleDocumentPointerUp}
	ontouchmove={handleDocumentPointerMove}
	ontouchend={handleDocumentPointerUp}
	onkeydown={handleKeyDown}
	onkeyup={handleKeyUp}
/>

<div class="min-h-screen bg-gray-900 p-8 text-white">
	<div class="mx-auto max-w-4xl">
		<div class="my-5 flex w-full items-center justify-center gap-2 lg:my-8">
			<BackButton backPath="/chat" />
			<h1 class="mx-5 text-center text-2xl font-bold lg:mx-14 lg:text-4xl">
				{$t('utils.sticker-editor.create-sticker')}
			</h1>
		</div>

		<div class="mb-10 flex w-full flex-wrap items-center justify-center gap-2">
			<button
				onclick={handleImportClick}
				data-tooltip={$t('utils.sticker-editor.add-image')}
				class="rounded-full bg-accent-600/40 px-4 py-2 font-medium frosted-glass transition-colors hover:bg-accent-500/40"
			>
				<Icon icon="mdi:image-plus" class="size-6" />
			</button>
			<button
				onclick={handleImportClick}
				data-tooltip={$t('utils.sticker-editor.add-sticker')}
				class="rounded-full bg-accent-600/40 px-4 py-2 font-medium frosted-glass transition-colors hover:bg-accent-500/40"
			>
				<Icon icon="mdi:sticker-plus-outline" class="size-6" />
			</button>
			<button
				onclick={handleAddText}
				data-tooltip={$t('utils.sticker-editor.add-text')}
				class="rounded-full bg-accent-600/40 px-4 py-2 font-medium frosted-glass transition-colors hover:bg-accent-500/40"
			>
				<Icon icon="mdi:format-text" class="size-6" />
			</button>
			<button
				onclick={handleDuplicate}
				data-tooltip={$t('utils.sticker-editor.duplicate')}
				disabled={!selectedObj}
				class="rounded-full bg-accent-600/40 px-4 py-2 font-medium frosted-glass transition-colors hover:bg-accent-500/40 disabled:bg-gray-500/40 disabled:text-gray-400 disabled:hover:bg-gray-500/40 disabled:hover:text-gray-400"
			>
				<Icon icon="mdi:content-copy" class="size-6" />
			</button>
			<button
				onclick={handleRemoveBackground}
				data-tooltip={$t('utils.sticker-editor.remove-background')}
				disabled={!selectedObj || removingBackground || selectedObj.backgroundRemoved}
				class="rounded-full bg-accent-600/40 px-4 py-2 font-medium frosted-glass transition-colors hover:bg-accent-500/40 disabled:bg-gray-500/40 disabled:text-gray-400 disabled:hover:bg-gray-500/40 disabled:hover:text-gray-400"
			>
				<Icon icon="material-symbols-light:background-replace-rounded" class="size-6" />
			</button>
			<button
				onclick={handleToggleAspectRatio}
				data-tooltip={aspectRatioLocked
					? $t('utils.sticker-editor.unlock-aspect-ratio')
					: $t('utils.sticker-editor.lock-aspect-ratio')}
				disabled={!selectedObj}
				class="rounded-full bg-accent-600/40 px-4 py-2 font-medium frosted-glass transition-colors hover:bg-accent-500/40 disabled:bg-gray-500/40 disabled:text-gray-400 disabled:hover:bg-gray-500/40 disabled:hover:text-gray-400"
			>
				<Icon icon={aspectRatioLocked ? 'mdi:lock' : 'mdi:lock-open-variant'} class="size-6" />
			</button>
			<button
				onclick={handleDelete}
				data-tooltip={$t('common.delete')}
				disabled={!selectedObj}
				class="rounded-full bg-accent-600/40 px-4 py-2 font-medium frosted-glass transition-colors hover:bg-accent-500/40 disabled:bg-gray-500/40 disabled:text-gray-400 disabled:hover:bg-gray-500/40 disabled:hover:text-gray-400"
			>
				<Icon icon="mdi:delete-forever" class="size-6" />
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				class="hidden"
				onchange={handleFileChange}
			/>
		</div>

		<div
			bind:this={canvasContainer}
			class="relative mx-auto aspect-square w-full max-w-[512px] rounded-lg bg-gray-800 p-4"
		>
			<canvas
				bind:this={canvas}
				width="512"
				height="512"
				class="h-full w-full border-2 border-gray-600 bg-gray-700 select-none"
				onmousedown={handleCanvasPointerDown}
				ontouchstart={handleCanvasPointerDown}
			></canvas>

			{#if selectedObj && canvas && canvasContainer}
				{@const corners = getCornerPositions(selectedObj)}
				{@const canvasRect = canvas.getBoundingClientRect()}
				{@const containerRect = canvasContainer.getBoundingClientRect()}
				{@const scale = canvas.clientWidth / canvas.width}
				{@const offsetX = canvasRect.left - containerRect.left}
				{@const offsetY = canvasRect.top - containerRect.top}
				{@const rotatePos = getRotateHandlePosition(selectedObj)}
				{@const rotationDegrees = ((selectedObj.rotation || 0) * 180) / Math.PI}

				{#each corners as corner, i}
					{@const baseAngle = i * 90}
					<!-- 0, 90, 180, 270 for corners 0,1,2,3 -->
					{@const totalAngle = (baseAngle + rotationDegrees) % 360}
					{@const normalizedAngle = ((totalAngle % 180) + 180) % 180}
					<!-- Normalize to 0-180 -->
					{@const cursor =
						normalizedAngle >= 45 && normalizedAngle < 135 ? 'nesw-resize' : 'nwse-resize'}

					<div
						class="resi absolute h-4 w-4 cursor-pointer touch-none rounded-full border-2 border-blue-500 bg-white select-none"
						style="left: {corner.x * scale + offsetX - 8}px; top: {corner.y * scale +
							offsetY -
							8}px; cursor: {cursor};"
						onmousedown={(e) => handleCornerPointerDown(e, i)}
						ontouchstart={(e) => handleCornerPointerDown(e, i)}
						role="button"
						tabindex="0"
					></div>
				{/each}

				<div
					class="absolute h-4 w-4 cursor-grab touch-none rounded-full border-2 border-green-600 bg-green-500"
					style="left: {rotatePos.x * scale + offsetX - 8}px; top: {rotatePos.y * scale +
						offsetY -
						8}px;"
					onmousedown={handleRotatePointerDown}
					ontouchstart={handleRotatePointerDown}
					role="button"
					tabindex="0"
				></div>
			{/if}
			{#if removingBackground}
				<div
					class="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-500/50 text-center backdrop-blur-lg"
				>
					<div>
						<p class="text-lg font-semibold">{$t('utils.sticker-editor.removing-background')}</p>
						<p class="text-xs font-thin text-gray-200">
							{$t('utils.sticker-editor.removing-background-description')}
						</p>
					</div>
				</div>
			{/if}
		</div>
		<div class="flex justify-center">
			<button
				onclick={handleSaveSticker}
				disabled={objects.length === 0}
				class="m-10 mt-7 cursor-pointer rounded-full bg-accent-700/60 px-8 py-4 font-semibold frosted-glass transition-colors hover:bg-accent-600/50 disabled:bg-gray-600/60 disabled:text-gray-400 disabled:hover:bg-gray-600/60 disabled:hover:text-gray-400"
			>
				{$t('utils.sticker-editor.save-sticker')}
			</button>
		</div>
	</div>
</div>
