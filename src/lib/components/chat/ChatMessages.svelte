<script lang="ts">
	import type { Prisma, User } from '$prisma';
	import { onMount } from 'svelte';
	import MyChatMessage from './MyChatMessage.svelte';
	import ChatMessage from './ChatMessage.svelte';
	import type { MessageWithRelations } from '$lib/types';

	interface ToolbarPosition {
		x: number;
		y: number;
	}

	let {
		messages,
		user,
		chatKey,
		messageContainer = $bindable<HTMLDivElement | null>(),
		handleScroll,
		onEdit,
		onReply,
		onDelete,
		onInfo,
		onReaction,
		onUpdateReaction
	}: {
		messages: MessageWithRelations[];
		user: User | null;
		chatKey: CryptoKey;
		messageContainer: HTMLDivElement | null;
		handleScroll: () => void;
		onEdit: (message: MessageWithRelations) => void;
		onReply: (message: MessageWithRelations) => void;
		onDelete: (message: MessageWithRelations) => void;
		onInfo: (message: MessageWithRelations) => void;
		onReaction: (message: MessageWithRelations) => void;
		onUpdateReaction: (
			message: MessageWithRelations,
			emoji: string,
			operation: 'add' | 'remove'
		) => void;
	} = $props();

	// State using Svelte 5 runes
	let activeMessage = $state<MessageWithRelations | null>(null);
	let activeMessageFromMe = $state<boolean>(false);
	let toolbarPosition = $state<ToolbarPosition>({ x: 8, y: 0 });
	let toolbarElement = $state<HTMLDivElement | null>(null);
	let longPressTimer = $state<ReturnType<typeof setTimeout> | null>(null);
	let hideTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	const isTouchDevice = $state(() => {
		if (typeof window === 'undefined') return false;
		// Check for fine pointer (mouse) as primary input method
		const hasFinePrimaryPointer = window.matchMedia('(pointer: fine)').matches;
		// Check if touch is available as a secondary input
		const hasTouchCapability = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		// Consider it a touch device only if fine pointer is not primary or touch points > 1
		return !hasFinePrimaryPointer || (hasTouchCapability && navigator.maxTouchPoints > 1);
	});
	let isHovering = false;

	console.log('Mobile device:', isTouchDevice());

	function calculateToolbarPosition(messageEl: HTMLElement): ToolbarPosition {
		if (!messageContainer) return { x: 8, y: 0 };

		const messageRect = messageEl.getBoundingClientRect();
		const containerRect = messageContainer.getBoundingClientRect();

		// Calculate position relative to container including scroll offset
		const relativeY = messageRect.top - containerRect.top + messageContainer.scrollTop - 30;

		return {
			x: 20,
			y: relativeY
		};
	}

	function handleMessageBubbleHover(
		event: MouseEvent,
		message: MessageWithRelations,
		isFromMe: boolean
	): void {
		if (isTouchDevice()) return;

		isHovering = true;

		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}

		const messageEl = document.querySelector(`[data-message-id="${message.id}"]`) as HTMLElement;
		if (messageEl) {
			const position = calculateToolbarPosition(messageEl);

			activeMessage = message;
			activeMessageFromMe = isFromMe;
			toolbarPosition = position;
		}
	}

	function handleMessageLeave(): void {
		isHovering = false;
		// Delay hiding to allow hovering over toolbar
		hideTimeout = setTimeout(() => {
			if (isHovering) return;
			activeMessage = null;
		}, 150);
	}

	function handleTouchStart(
		event: TouchEvent,
		message: MessageWithRelations,
		isFromMe: boolean
	): void {
		const messageEl = event.currentTarget as HTMLElement;

		longPressTimer = setTimeout(() => {
			if (messageEl) {
				const position = calculateToolbarPosition(messageEl);

				activeMessage = message;
				activeMessageFromMe = isFromMe;
				toolbarPosition = position;
			}
		}, 500);
	}

	function handleTouchEnd(event: TouchEvent): void {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		if (activeMessage) {
			event.preventDefault();
		}
	}

	function handleTouchMove(): void {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	// Keep toolbar visible when hovering over it
	function handleToolbarMouseEnter(): void {
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}
	}

	function handleToolbarMouseLeave(): void {
		activeMessage = null;
	}

	// Hide toolbar when clicking outside
	function handleClickOutside(event: MouseEvent | TouchEvent): void {
		const target = event.target as HTMLElement;
		if (activeMessage && !toolbarElement?.contains(target)) {
			activeMessage = null;
		}
	}

	// Update toolbar position when scrolling
	function handleScrollUpdate(): void {
		handleScroll(); // Call the original scroll handler

		// Update toolbar position if it's active
		if (activeMessage) {
			const messageEl = document.querySelector(
				`[data-message-id="${activeMessage.id}"]`
			) as HTMLElement;
			if (messageEl) {
				const position = calculateToolbarPosition(messageEl);
				toolbarPosition = position;
			}
		}
	}

	function handleEdit(): void {
		if (activeMessage) {
			onEdit(activeMessage);
			activeMessage = null;
		}
	}

	function handleReply(): void {
		if (activeMessage) {
			onReply(activeMessage);
			activeMessage = null;
		}
	}

	function handleDelete(): void {
		if (activeMessage) {
			onDelete(activeMessage);
			activeMessage = null;
		}
	}

	function handleInfo(): void {
		if (activeMessage) {
			onInfo(activeMessage);
			activeMessage = null;
		}
	}

	function handleReaction(): void {
		if (activeMessage) {
			onReaction(activeMessage);
			activeMessage = null;
		}
	}

	onMount(() => {
		// Listen for clicks outside
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('touchstart', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);

			// Clean up timers
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		};
	});

	// Reactive effect for toolbar event listeners
	$effect(() => {
		console.log('Effect Messages, UserId:', user?.id);
		if (toolbarElement) {
			const handleMouseEnter = () => handleToolbarMouseEnter();
			const handleMouseLeave = () => handleToolbarMouseLeave();

			toolbarElement.addEventListener('mouseenter', handleMouseEnter);
			toolbarElement.addEventListener('mouseleave', handleMouseLeave);

			return () => {
				toolbarElement?.removeEventListener('mouseenter', handleMouseEnter);
				toolbarElement?.removeEventListener('mouseleave', handleMouseLeave);
			};
		}
	});
</script>

<!-- Message container with toolbar -->
<div
	bind:this={messageContainer}
	onscroll={handleScrollUpdate}
	class="relative no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 pt-6"
>
	{#each messages as message, index (message.id)}
		{@const isFromMe = message.senderId === user?.id}
		{@const isFirstInGroup = index === 0 || messages[index - 1].senderId !== message.senderId}
		{@const showProfile = isFirstInGroup}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="message-wrapper relative"
			data-message-id={message.id}
			onmouseleave={handleMessageLeave}
			ontouchend={handleTouchEnd}
			ontouchmove={handleTouchMove}
		>
			{#if isFromMe}
				{@const isLast =
					index === messages.length - 1 || !(messages[index + 1].senderId === user?.id)}
				<MyChatMessage
					{message}
					userId={user?.id || ''}
					{chatKey}
					{showProfile}
					{isLast}
					onHover={(e) => handleMessageBubbleHover(e, message, isFromMe)}
					onTouchStart={(e) => handleTouchStart(e, message, isFromMe)}
					onUpdateReaction={(emoji, operation) => onUpdateReaction(message, emoji, operation)}
				/>
			{:else}
				<ChatMessage
					{message}
					userId={user?.id || ''}
					{chatKey}
					{showProfile}
					onHover={(e) => handleMessageBubbleHover(e, message, isFromMe)}
					onTouchStart={(e) => handleTouchStart(e, message, isFromMe)}
					onUpdateReaction={(emoji, operation) => onUpdateReaction(message, emoji, operation)}
				/>
			{/if}
		</div>
	{/each}
	<div class="h-4"></div>

	<!-- Single floating toolbar -->
	{#if activeMessage}
		<div
			bind:this={toolbarElement}
			class="pointer-events-auto frosted-glass-shadow absolute z-20 flex items-center space-x-1 rounded-xl bg-gray-800/60 p-1 transition-all duration-200"
			style="top: {toolbarPosition.y}px; {activeMessageFromMe
				? `right: ${toolbarPosition.x}px`
				: `left: ${toolbarPosition.x}px`};"
		>
			<!-- Reply Button -->
			<button
				class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
				onclick={handleReply}
				title="Reply"
				aria-label="Reply to message"
				type="button"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
					></path>
				</svg>
			</button>

			<button
				class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
				onclick={handleReaction}
				title="Add Reaction"
				aria-label="Add Reaction"
				type="button"
			>
				<svg
					class="size-4"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"
					/>
				</svg>
			</button>

			{#if activeMessageFromMe}
				<button
					class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
					onclick={handleEdit}
					title="Edit"
					aria-label="Edit message"
					type="button"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
						></path>
					</svg>
				</button>

				<!-- Delete Button -->
				<button
					class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-900/30 hover:text-red-400"
					onclick={handleDelete}
					title="Delete"
					aria-label="Delete message"
					type="button"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						></path>
					</svg>
				</button>
			{/if}
			<button
				class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
				onclick={handleInfo}
				title="Show info"
				aria-label="Show info"
				type="button"
			>
				<svg
					class="h-4 w-4"
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
					/>
				</svg>
			</button>
		</div>
	{/if}
</div>
