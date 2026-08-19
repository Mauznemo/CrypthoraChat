<script lang="ts">
	import { onMount } from 'svelte';
	import Slider from '../Slider.svelte';
	import { createPlaybackController } from '$lib/utils/mediaPlayback';

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
	let lastVolume = 1;
	let isMuted = $state(muted);
	let showControls = $state(true);
	let isFullscreen = $state(false);
	let hideControlsTimeout: NodeJS.Timeout;

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	const playback = createPlaybackController(() => videoElement);

	function togglePlayPause() {
		void playback.toggle();
	}

	function handleVolumeChange(value: number) {
		localStorage.setItem('volume', value.toString());
		volume = value;
		if (videoElement) {
			videoElement.volume = volume;
			isMuted = volume === 0;
		}
	}

	function toggleMute() {
		if (!videoElement) return;

		isMuted = !isMuted;
		videoElement.muted = isMuted;

		if (isMuted) {
			lastVolume = volume;
			volume = 0;
			videoElement.volume = 0;
		} else {
			volume = lastVolume;
			videoElement.volume = volume;
		}
	}

	function handleSeek(value: number) {
		currentTime = value;
		if (videoElement) {
			videoElement.currentTime = value;
		}
	}

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

	function showControlsTemporarily() {
		showControls = true;
		clearTimeout(hideControlsTimeout);
		hideControlsTimeout = setTimeout(() => {
			if (isPlaying) {
				showControls = false;
			}
		}, 3000);
	}

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
	class="group relative h-full w-full overflow-hidden rounded-lg bg-black {className}"
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
		class="h-full w-full"
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
			<Slider
				class="w-full"
				min={0}
				max={duration || 0}
				bind:value={currentTime}
				onInput={handleSeek}
				ariaLabel="Video progress"
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
						<IconMdiPause class="size-7" />
					{:else}
						<IconMdiPlay class="size-7" />
					{/if}
				</button>

				<!-- Volume Control -->
				<div class="flex items-center space-x-2">
					<button
						onclick={toggleMute}
						class="cursor-pointer p-1 text-gray-300 transition-colors hover:text-white"
						aria-label={isMuted ? 'Unmute' : 'Mute'}
					>
						<div class="size-6">
							{#if isMuted || volume === 0}
								<IconMdiVolumeMute class="size-6" />
							{:else if volume > 0.6}
								<IconMdiVolumeHigh class="size-6" />
							{:else if volume > 0.3}
								<IconMdiVolumeMedium class="size-6" />
							{:else}
								<IconMdiVolumeLow class="size-6" />
							{/if}
						</div>
					</button>

					<Slider
						class="w-20"
						min={0}
						max={1}
						step={0.1}
						bind:value={volume}
						onInput={handleVolumeChange}
						ariaLabel="Volume control"
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
						<IconMdiFullscreenExit class="size-6" />
					{:else}
						<IconMdiFullscreen class="size-6" />
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
				<IconMdiPlay class="size-12" />
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
