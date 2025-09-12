<script lang="ts">
	import { onMount } from 'svelte';

	const {
		src,
		class: className = '',
		autoplay = false,
		muted = false,
		loop = false
	}: {
		src: string;
		class?: string;
		autoplay?: boolean;
		muted?: boolean;
		loop?: boolean;
	} = $props();

	let videoElement = $state<HTMLVideoElement>();
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let isMuted = $state(muted);
	let showControls = $state(true);
	let isFullscreen = $state(false);
	let hideControlsTimeout: NodeJS.Timeout;

	// Format time helper
	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Play/Pause toggle
	function togglePlayPause() {
		if (!videoElement) return;

		if (isPlaying) {
			videoElement.pause();
		} else {
			videoElement.play();
		}
	}

	// Volume control
	function handleVolumeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		volume = parseFloat(target.value);
		localStorage.setItem('volume', volume.toString());
		if (videoElement) {
			videoElement.volume = volume;
			isMuted = volume === 0;
		}
	}

	// Mute toggle
	function toggleMute() {
		if (!videoElement) return;

		isMuted = !isMuted;
		videoElement.muted = isMuted;

		if (isMuted) {
			videoElement.volume = 0;
		} else {
			videoElement.volume = volume;
		}
	}

	// Seek functionality
	function handleSeek(event: Event) {
		const target = event.target as HTMLInputElement;
		const seekTime = parseFloat(target.value);
		currentTime = seekTime;
		if (videoElement) {
			videoElement.currentTime = seekTime;
		}
	}

	// Fullscreen toggle
	async function toggleFullscreen() {
		if (!videoElement) return;

		try {
			if (isFullscreen) {
				await document.exitFullscreen();
			} else {
				await videoElement.requestFullscreen();
			}
		} catch (error) {
			console.warn('Fullscreen not supported');
		}
	}

	// Auto-hide controls
	function showControlsTemporarily() {
		showControls = true;
		clearTimeout(hideControlsTimeout);
		hideControlsTimeout = setTimeout(() => {
			if (isPlaying) {
				showControls = false;
			}
		}, 3000);
	}

	// Video event handlers
	function handleLoadedMetadata() {
		if (videoElement) {
			duration = videoElement.duration;
			volume = videoElement.volume;
		}
	}

	function handleTimeUpdate() {
		if (videoElement) {
			currentTime = videoElement.currentTime;
		}
	}

	function handlePlay() {
		isPlaying = true;
	}

	function handlePause() {
		isPlaying = false;
		showControls = true;
	}

	function handleFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	onMount(() => {
		volume = parseFloat(localStorage.getItem('volume') || '1');
		if (videoElement) {
			videoElement.volume = volume;
			isMuted = volume === 0;
		}
	});

	$effect(() => {
		return () => {
			clearTimeout(hideControlsTimeout);
		};
	});
</script>

<div
	class="group relative overflow-hidden rounded-lg bg-black {className}"
	role="region"
	aria-label="Video player"
	onmousemove={showControlsTemporarily}
	onmouseleave={() => isPlaying && (showControls = false)}
>
	<video
		bind:this={videoElement}
		{src}
		{autoplay}
		muted={isMuted}
		{loop}
		class="h-full max-h-[600px] w-full"
		onloadedmetadata={handleLoadedMetadata}
		ontimeupdate={handleTimeUpdate}
		onplay={handlePlay}
		onpause={handlePause}
		onclick={togglePlayPause}
	>
		<track kind="captions" src="" label="No captions available" />
	</video>

	<!-- Custom Controls -->
	<div
		class="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 transition-opacity duration-300 {showControls
			? 'opacity-100'
			: 'opacity-0'}"
	>
		<!-- Progress Bar -->
		<div class="mb-4">
			<input
				type="range"
				min="0"
				max={duration || 0}
				value={currentTime}
				oninput={handleSeek}
				class="slider h-5 w-full cursor-pointer appearance-none rounded-full bg-white/30"
				style="background: linear-gradient(to right, #d1d5dc 0%, #d1d5dc calc({duration
					? (currentTime / duration) * 100
					: 0}% * (100% - 20px) / 100% + 10px), rgba(255,255,255,0.3) calc({duration
					? (currentTime / duration) * 100
					: 0}% * (100% - 20px) / 100% + 10px), rgba(255,255,255,0.3) 100%)"
			/>
		</div>

		<!-- Control Buttons -->
		<div class="flex items-center justify-between">
			<!-- Left controls -->
			<div class="flex items-center space-x-4">
				<!-- Play/Pause Button -->
				<button
					onclick={togglePlayPause}
					class="p-1 text-gray-300 transition-colors hover:text-white"
					aria-label={isPlaying ? 'Pause' : 'Play'}
				>
					{#if isPlaying}
						<svg class="size-7" fill="currentColor" viewBox="0 0 24 24">
							<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
						</svg>
					{:else}
						<svg class="size-7" fill="currentColor" viewBox="0 0 24 24">
							<path d="M8 5v14l11-7z" />
						</svg>
					{/if}
				</button>

				<!-- Volume Control -->
				<div class="flex items-center space-x-2">
					<button
						onclick={toggleMute}
						class="p-1 text-gray-300 transition-colors hover:text-white"
						aria-label={isMuted ? 'Unmute' : 'Mute'}
					>
						{#if isMuted || volume === 0}
							<svg class="size-6" fill="currentColor" viewBox="0 0 24 24">
								<path
									d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
								/>
							</svg>
						{:else if volume > 0.5}
							<svg class="size-6" fill="currentColor" viewBox="0 0 24 24">
								<path
									d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
								/>
							</svg>
						{:else}
							<svg class="size-6" fill="currentColor" viewBox="0 0 24 24">
								<path
									d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"
								/>
							</svg>
						{/if}
					</button>

					<input
						type="range"
						min="0"
						max="1"
						step="0.1"
						value={isMuted ? 0 : volume}
						oninput={handleVolumeChange}
						class="slider h-5 w-20 cursor-pointer appearance-none rounded-full bg-white/30"
						style="background: linear-gradient(to right, #d1d5dc 0%, #d1d5dc {(isMuted
							? 0
							: volume) *
							80 +
							10}%, rgba(255,255,255,0.3) {(isMuted ? 0 : volume) * 80 +
							10}%, rgba(255,255,255,0.3) 100%)"
					/>
				</div>

				<!-- Time Display -->
				<div class="font-mono text-sm text-white">
					{formatTime(currentTime)} / {formatTime(duration)}
				</div>
			</div>

			<!-- Right controls -->
			<div class="flex items-center space-x-2">
				<!-- Fullscreen Button -->
				<button
					onclick={toggleFullscreen}
					class="p-1 text-white transition-colors hover:text-white"
					aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
				>
					{#if isFullscreen}
						<svg class="size-6" fill="currentColor" viewBox="0 0 24 24">
							<path
								d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
							/>
						</svg>
					{:else}
						<svg class="size-6" fill="currentColor" viewBox="0 0 24 24">
							<path
								d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
							/>
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Loading/Play Overlay -->
	{#if !isPlaying}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<button
				onclick={togglePlayPause}
				class="pointer-events-auto rounded-full bg-black/50 p-4 text-white transition-all duration-200 hover:scale-110 hover:bg-black/70"
				aria-label="Play video"
			>
				<svg class="h-12 w-12" fill="currentColor" viewBox="0 0 24 24">
					<path d="M8 5v14l11-7z" />
				</svg>
			</button>
		</div>
	{/if}
</div>

<!-- Add fullscreen change listener -->
<svelte:document onfullscreenchange={handleFullscreenChange} />

<style>
	/* Custom slider styles */
	.slider::-webkit-slider-thumb {
		appearance: none;
		background: #d1d5dc;
		border-radius: 50%;
		width: 20px;
		height: 20px;
	}

	.slider::-moz-range-thumb {
		background: #d1d5dc;
		border-radius: 50%;
		width: 20px;
		height: 20px;
	}
</style>
