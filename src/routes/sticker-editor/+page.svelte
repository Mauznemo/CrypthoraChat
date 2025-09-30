<script lang="ts">
	interface CanvasObject {
		type: 'image' | 'text';
		x: number;
		y: number;
		width: number;
		height: number;
		rotation: number;
		selected: boolean;
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
			// White background
			ctx.fillStyle = 'white';
			ctx.fillRect(-object.width / 2, -object.height / 2, object.width, object.height);

			// Black text
			ctx.fillStyle = 'black';
			ctx.font = `${object.fontSize || 24}px sans-serif`;
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
		if (!canvas) return;

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

		if (isDragging) {
			selectedObj.x += dx;
			selectedObj.y += dy;
			dragStart = { x: pos.x, y: pos.y };
			render();
		} else if (isResizing && resizeHandle !== null && resizeStart) {
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
			const localVecX = vecX * cos - vecY * sin;
			const localVecY = vecX * sin + vecY * cos;

			// New dimensions
			const newWidth = Math.abs(localVecX);
			const newHeight = Math.abs(localVecY);

			// Keep center at opposite corner + half the vector
			const halfVecX = vecX / 2;
			const halfVecY = vecY / 2;

			selectedObj.width = Math.max(20, newWidth);
			selectedObj.height = Math.max(20, newHeight);
			selectedObj.x = oppositeCorner.x + halfVecX;
			selectedObj.y = oppositeCorner.y + halfVecY;

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

	function handleDocumentPointerUp() {
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

				// Maintain aspect ratio
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
					img
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
		const text = prompt('Enter text:');
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
			fontSize
		};
		objects.push(obj);
		render();
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
</script>

<svelte:window
	onmousemove={handleDocumentPointerMove}
	onmouseup={handleDocumentPointerUp}
	ontouchmove={handleDocumentPointerMove}
	ontouchend={handleDocumentPointerUp}
/>

<div class="min-h-screen bg-gray-900 p-8 text-white">
	<div class="mx-auto max-w-4xl">
		<h1 class="mb-6 text-3xl font-bold">Image Editor</h1>

		<div class="mb-6 flex gap-4">
			<button
				onclick={handleImportClick}
				class="rounded-full bg-teal-600/40 px-4 py-2 font-medium frosted-glass transition-colors hover:bg-teal-500/40"
			>
				Import Image
			</button>
			<button
				onclick={handleAddText}
				class="rounded-full bg-teal-600/40 px-4 py-2 font-medium frosted-glass transition-colors hover:bg-teal-500/40"
			>
				Add Text
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
				class="h-full w-full border-2 border-gray-600 bg-gray-700"
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

				{#each corners as corner, i}
					<div
						class="absolute h-4 w-4 cursor-pointer touch-none rounded-full border-2 border-blue-500 bg-white"
						style="left: {corner.x * scale + offsetX - 8}px; top: {corner.y * scale +
							offsetY -
							8}px; cursor: {i % 2 === 0 ? 'nwse-resize' : 'nesw-resize'};"
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
		</div>
	</div>
</div>
