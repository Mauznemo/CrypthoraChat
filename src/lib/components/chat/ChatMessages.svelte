<script lang="ts">
	import { onMount } from 'svelte';
	import MyChatMessage from './MyChatMessage.svelte';
	import ChatMessage from './ChatMessage.svelte';
	import type { ClientMessage, MessageWithRelations } from '$lib/types';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { isClientMessage } from '$lib/chat/messages';
	import Icon from '@iconify/svelte';

	interface ToolbarPosition {
		x: number;
		y: number;
	}

	let {
		messageContainer = $bindable<HTMLDivElement | null>(),
		handleScroll,
		onEdit,
		onReply,
		onDelete,
		onInfo,
		onReaction,
		onUpdateReaction,
		onDecryptError
	}: {
		messageContainer: HTMLDivElement | null;
		handleScroll: () => void;
		onEdit: (message: MessageWithRelations) => void;
		onReply: (message: MessageWithRelations) => void;
		onDelete: (message: MessageWithRelations) => void;
		onInfo: (message: MessageWithRelations) => void;
		onReaction: (message: MessageWithRelations) => void;
		onUpdateReaction: (
			message: MessageWithRelations,
			encryptedReaction: string,
			operation: 'add' | 'remove'
		) => void;
		onDecryptError: (error: any, message: MessageWithRelations) => void;
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

		const relativeY = messageRect.top - containerRect.top + messageContainer.scrollTop - 30;

		const visibleTop = messageContainer.scrollTop;
		const visibleBottom = messageContainer.scrollTop + containerRect.height;

		const clampedY = Math.max(relativeY, visibleTop + 10);

		const toolbarHeight = 40;
		const finalY = Math.min(clampedY, visibleBottom - toolbarHeight);

		return {
			x: 20,
			y: finalY
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
		console.log('Effect Messages, UserId:', chatStore.user?.id);
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
	{#each chatStore.combinedMessages as message, index (message.id + (isClientMessage(message) ? message.encryptedContent : '') + index)}
		{#if isClientMessage(message)}
			{console.log('Key:', message.id + message.encryptedContent + index)}
			{console.log('ClientMessage:', message.id, 'by:', message.senderId)}
			<!-- message.id + message.encryptedContent unique id to make sure reactivity works -->
			{@const isFromMe = message.senderId === chatStore.user?.id}
			{@const isFirstInGroup =
				index === 0 ||
				!isClientMessage(chatStore.combinedMessages[index - 1]) ||
				(chatStore.combinedMessages[index - 1] as ClientMessage).senderId !== message.senderId}
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
						index === chatStore.combinedMessages.length - 1 ||
						(index + 1 < chatStore.combinedMessages.length &&
							(!isClientMessage(chatStore.combinedMessages[index + 1]) ||
								(chatStore.combinedMessages[index + 1] as ClientMessage).senderId !==
									chatStore.user?.id))}
					<MyChatMessage
						{message}
						{showProfile}
						{isLast}
						onHover={(e) => handleMessageBubbleHover(e, message, isFromMe)}
						onTouchStart={(e) => handleTouchStart(e, message, isFromMe)}
						onUpdateReaction={(encryptedReaction, operation) =>
							onUpdateReaction(message, encryptedReaction, operation)}
					/>
				{:else}
					<ChatMessage
						{message}
						{showProfile}
						onHover={(e) => handleMessageBubbleHover(e, message, isFromMe)}
						onTouchStart={(e) => handleTouchStart(e, message, isFromMe)}
						onUpdateReaction={(encryptedReaction, operation) =>
							onUpdateReaction(message, encryptedReaction, operation)}
						{onDecryptError}
					/>
				{/if}
			</div>
		{:else}
			{console.log('SystemMessage:', message.id)}
			<!-- SystemMessage specific code -->
			<div class="text-center text-xs text-gray-400">
				<p>{message.content}</p>
			</div>
		{/if}
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
				class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
				onclick={handleReply}
				title="Reply"
				aria-label="Reply to message"
				type="button"
			>
				<Icon icon="material-symbols:reply-rounded" class="size-5" />
			</button>

			<button
				class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
				onclick={handleReaction}
				title="Add Reaction"
				aria-label="Add Reaction"
				type="button"
			>
				<Icon icon="proicons:emoji" class="size-5" />
			</button>

			{#if activeMessageFromMe}
				<button
					class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
					onclick={handleEdit}
					title="Edit"
					aria-label="Edit message"
					type="button"
				>
					<Icon icon="material-symbols:edit-outline-rounded" class="size-5" />
				</button>

				<!-- Delete Button -->
				<button
					class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-900/30 hover:text-red-400"
					onclick={handleDelete}
					title="Delete"
					aria-label="Delete message"
					type="button"
				>
					<Icon icon="material-symbols:delete-outline-rounded" class="size-5" />
				</button>
			{/if}
			<button
				class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
				onclick={handleInfo}
				title="Show info"
				aria-label="Show info"
				type="button"
			>
				<Icon icon="material-symbols:info-outline-rounded" class="size-5" />
			</button>
		</div>
	{/if}
</div>
