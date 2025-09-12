<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';

	const {
		src,
		class: className = '',
		autoplay = false,
		muted = false,
		loop = false,
		title = 'Audio Track',
		artist = ''
	}: {
		src: string;
		class?: string;
		autoplay?: boolean;
		muted?: boolean;
		loop?: boolean;
		title?: string;
		artist?: string;
	} = $props();

	let audioElement = $state<HTMLAudioElement>();
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let isMuted = $state(muted);
	let isLoading = $state(true);

	function formatTime(seconds: number): string {
		if (!isFinite(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
	function togglePlayPause() {
		if (!audioElement) return;

		if (isPlaying) {
			audioElement.pause();
		} else {
			audioElement.play().catch((error) => {
				console.warn('Audio play failed:', error);
			});
		}
	}

	function handleVolumeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		volume = parseFloat(target.value);
		localStorage.setItem('audioVolume', volume.toString());
		if (audioElement) {
			audioElement.volume = volume;
			isMuted = volume === 0;
		}
	}

	function toggleMute() {
		if (!audioElement) return;

		isMuted = !isMuted;
		audioElement.muted = isMuted;

		if (isMuted) {
			audioElement.volume = 0;
		} else {
			audioElement.volume = volume;
		}
	}

	function handleSeek(event: Event) {
		const target = event.target as HTMLInputElement;
		const seekTime = parseFloat(target.value);
		currentTime = seekTime;
		if (audioElement) {
			audioElement.currentTime = seekTime;
		}
	}

	function skipTime(seconds: number) {
		if (!audioElement) return;
		audioElement.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
	}

	function handleLoadedMetadata() {
		if (audioElement) {
			duration = audioElement.duration;
			volume = audioElement.volume;
			isLoading = false;
		}
	}

	function handleTimeUpdate() {
		if (audioElement) {
			currentTime = audioElement.currentTime;
		}
	}

	function handlePlay() {
		isPlaying = true;
	}

	function handlePause() {
		isPlaying = false;
	}

	function handleEnded() {
		isPlaying = false;
		if (!loop) {
			currentTime = 0;
		}
	}

	function handleLoadStart() {
		isLoading = true;
	}

	function handleCanPlay() {
		isLoading = false;
	}

	onMount(() => {
		volume = parseFloat(localStorage.getItem('audioVolume') || '1');
		if (audioElement) {
			audioElement.volume = volume;
			isMuted = volume === 0;
		}
	});
</script>

<div class="rounded-xl bg-gray-800/40 p-4 md:p-6 {className}">
	<audio
		bind:this={audioElement}
		{src}
		{autoplay}
		muted={isMuted}
		{loop}
		preload="metadata"
		onloadedmetadata={handleLoadedMetadata}
		ontimeupdate={handleTimeUpdate}
		onplay={handlePlay}
		onpause={handlePause}
		onended={handleEnded}
		onloadstart={handleLoadStart}
		oncanplay={handleCanPlay}
	>
		<track kind="captions" src="" label="No captions available" />
	</audio>

	<div class="flex flex-col items-center justify-start gap-4 md:flex-row">
		<!-- Play/Pause Button -->
		<button
			onclick={togglePlayPause}
			disabled={isLoading}
			class="frosted-glass-shadow mt-10 shrink-0 rounded-full bg-teal-600/40 p-2 text-white transition-all duration-200 hover:scale-110 hover:bg-teal-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 md:mt-0 md:p-4"
			aria-label={isPlaying ? 'Pause' : 'Play'}
		>
			{#if isLoading}
				<LoadingSpinner size="2rem" />
			{:else if isPlaying}
				<svg class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
					<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
				</svg>
			{:else}
				<svg class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
					<path d="M8 5v14l11-7z" />
				</svg>
			{/if}
		</button>

		<div class="w-full">
			<!-- Track Info -->
			<div class="mb-1 text-center md:mb-6">
				<h3
					class="text-md absolute top-4 left-4 mb-1 line-clamp-1 pr-12 font-semibold break-all text-white md:relative md:top-0 md:left-0 md:pr-8 md:text-xl"
				>
					{title}
				</h3>
				{#if artist}
					<p class="line-clamp-1 text-sm break-all text-slate-400">
						{artist}
					</p>
				{/if}
			</div>

			<!-- Progress Bar -->
			<div class="mb-1">
				<input
					type="range"
					min="0"
					max={duration || 0}
					value={currentTime}
					oninput={handleSeek}
					disabled={isLoading}
					class="slider h-5 w-full cursor-pointer appearance-none rounded-full bg-white/30 disabled:cursor-not-allowed"
					style="background: linear-gradient(to right, #d1d5dc 0%, #d1d5dc calc({duration
						? (currentTime / duration) * 100
						: 0}% * (100% - 20px) / 100% + 10px), rgba(255,255,255,0.3) calc({duration
						? (currentTime / duration) * 100
						: 0}% * (100% - 20px) / 100% + 10px), rgba(255,255,255,0.3) 100%)"
					aria-label="Audio progress"
				/>

				<!-- Time Display -->
				<div class="mt-0 flex justify-between font-mono text-sm text-slate-400 md:mt-2">
					<span>{formatTime(currentTime)}</span>
					<span>{formatTime(duration)}</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Volume Control -->
	<div class="flex items-center justify-center space-x-3">
		<button
			onclick={toggleMute}
			class="p-1 text-slate-400 transition-colors hover:text-white"
			aria-label={isMuted ? 'Unmute' : 'Mute'}
		>
			{#if isMuted || volume === 0}
				<svg class="size-6" fill="currentColor" viewBox="0 0 24 24">
					<path
						d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
					/>
				</svg>
			{:else if volume > 0.6}
				<svg class="size-6" fill="currentColor" viewBox="0 0 24 24">
					<path
						d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
					/>
				</svg>
			{:else if volume > 0.3}
				<svg class="size-6" fill="currentColor" viewBox="0 0 24 24">
					<path
						d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"
					/>
				</svg>
			{:else}
				<svg class="size-6" fill="currentColor" viewBox="0 0 24 24">
					<path d="M7 9v6h4l5 5V4l-5 5H7z" />
				</svg>
			{/if}
		</button>

		<input
			type="range"
			min="0"
			max="1"
			step="0.05"
			value={isMuted ? 0 : volume}
			oninput={handleVolumeChange}
			class="slider h-5 max-w-32 flex-1 cursor-pointer appearance-none rounded-full bg-white/30"
			style="background: linear-gradient(to right, #d1d5dc 0%, #d1d5dc calc({(isMuted
				? 0
				: volume) * 100}% * (100% - 20px) / 100% + 10px), rgba(255,255,255,0.3) calc({(isMuted
				? 0
				: volume) * 100}% * (100% - 20px) / 100% + 10px), rgba(255,255,255,0.3) 100%)"
			aria-label="Volume control"
		/>

		<span class="text-md w-8 text-center font-mono text-slate-400">
			{Math.round((isMuted ? 0 : volume) * 100)}
		</span>
	</div>
</div>

<style>
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

	.slider:disabled::-webkit-slider-thumb {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
