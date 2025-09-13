<script lang="ts">
	import Icon from '@iconify/svelte';
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
					class="cursor-pointer p-1 text-gray-300 transition-colors hover:text-white"
					aria-label={isPlaying ? 'Pause' : 'Play'}
				>
					{#if isPlaying}
						<Icon icon="mdi:pause" class="size-7" />
					{:else}
						<Icon icon="mdi:play" class="size-7" />
					{/if}
				</button>

				<!-- Volume Control -->
				<div class="flex items-center space-x-2">
					<button
						onclick={toggleMute}
						class="cursor-pointer p-1 text-gray-300 transition-colors hover:text-white"
						aria-label={isMuted ? 'Unmute' : 'Mute'}
					>
						{#if isMuted || volume === 0}
							<Icon icon="mdi:volume-mute" class="size-6" />
						{:else if volume > 0.6}
							<Icon icon="mdi:volume-high" class="size-6" />
						{:else if volume > 0.3}
							<Icon icon="mdi:volume-medium" class="size-6" />
						{:else}
							<Icon icon="mdi:volume-low" class="size-6" />
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
					class="cursor-pointer p-1 text-white transition-colors hover:text-white"
					aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
				>
					{#if isFullscreen}
						<Icon icon="mdi:fullscreen-exit" class="size-6" />
					{:else}
						<Icon icon="mdi:fullscreen" class="size-6" />
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
				class="pointer-events-auto cursor-pointer rounded-full bg-black/50 p-4 text-white transition-all duration-200 hover:scale-110 hover:bg-black/70"
				aria-label="Play video"
			>
				<Icon icon="mdi:play" class="size-12" />
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
