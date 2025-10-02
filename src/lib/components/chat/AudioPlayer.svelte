<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import Icon from '@iconify/svelte';
	import Slider from '../Slider.svelte';

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
	let lastVolume = 1;
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

	function handleVolumeChange(value: number) {
		localStorage.setItem('audioVolume', value.toString());
		if (audioElement) {
			audioElement.volume = value;
			isMuted = value === 0;
		}
	}

	function toggleMute() {
		if (!audioElement) return;

		isMuted = !isMuted;
		audioElement.muted = isMuted;

		if (isMuted) {
			lastVolume = volume;
			volume = 0;
			audioElement.volume = 0;
		} else {
			volume = lastVolume;
			audioElement.volume = volume;
		}
	}

	function handleSeek(value: number) {
		const seekTime = value;
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

<div class="h-[200px] rounded-xl bg-gray-800/40 p-4 sm:p-6 {className}">
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
			class="mt-10 shrink-0 cursor-pointer rounded-full bg-accent-600/40 p-2 text-white frosted-glass-shadow transition-all duration-200 hover:scale-110 hover:bg-accent-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 md:mt-0 md:p-4"
			aria-label={isPlaying ? 'Pause' : 'Play'}
		>
			{#if isLoading}
				<LoadingSpinner size="2rem" />
			{:else if isPlaying}
				<Icon icon="mdi:pause" class="size-8" />
			{:else}
				<Icon icon="mdi:play" class="size-8" />
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
				<Slider
					class="w-full"
					min={0}
					max={duration || 0}
					bind:value={currentTime}
					disabled={isLoading}
					ariaLabel="Audio progress"
					onInput={handleSeek}
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
	<div class="hidden items-center justify-center space-x-3 md:flex">
		<button
			onclick={toggleMute}
			class="cursor-pointer p-1 text-slate-400 transition-colors hover:text-white"
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

		<Slider
			class="w-full max-w-32"
			min={0}
			max={1}
			step={0.05}
			bind:value={volume}
			ariaLabel="Volume control"
			onInput={handleVolumeChange}
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
