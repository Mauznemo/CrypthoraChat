<script lang="ts">
	import type { Prisma, User } from '$prisma';
	import { onMount } from 'svelte';
	import MyChatMessage from './MyChatMessage.svelte';
	import ChatMessage from './ChatMessage.svelte';

	type MessageWithRelations = Prisma.MessageGetPayload<{
		include: { user: true; chat: true; readBy: true };
	}>;

	interface ToolbarPosition {
		x: number;
		y: number;
	}

	let {
		messages,
		user,
		messageContainer = $bindable<HTMLDivElement | null>(),
		handleScroll,
		onEdit,
		onReply,
		onDelete
	} = $props<{
		messages: MessageWithRelations[];
		user: User | null;
		messageContainer: HTMLDivElement | null;
		handleScroll: () => void;
		onEdit: (message: MessageWithRelations) => void;
		onReply: (message: MessageWithRelations) => void;
		onDelete: (message: MessageWithRelations) => void;
	}>();

	// State using Svelte 5 runes
	let activeMessage = $state<MessageWithRelations | null>(null);
	let activeMessageFromMe = $state<boolean>(false);
	let toolbarPosition = $state<ToolbarPosition>({ x: 8, y: 0 });
	let toolbarElement = $state<HTMLDivElement | null>(null);
	let longPressTimer = $state<ReturnType<typeof setTimeout> | null>(null);
	let hideTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	const isTouchDevice =
		typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
	let isHovering = false;

	function calculateToolbarPosition(messageEl: HTMLElement): ToolbarPosition {
		if (!messageContainer) return { x: 8, y: 0 };

		const messageRect = messageEl.getBoundingClientRect();
		const containerRect = messageContainer.getBoundingClientRect();

		// Calculate position relative to container including scroll offset
		const relativeY =
			messageRect.top -
			containerRect.top +
			messageContainer.scrollTop +
			messageRect.height / 2 +
			10;

		return {
			x: 40,
			y: relativeY
		};
	}

	function handleMessageBubbleHover(
		event: MouseEvent,
		message: MessageWithRelations,
		isFromMe: boolean
	): void {
		if (isTouchDevice) return;
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
	class="relative no-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
>
	{#each messages as message, index}
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
					{showProfile}
					{isLast}
					onHover={(e) => handleMessageBubbleHover(e, message, isFromMe)}
					onTouchStart={(e) => handleTouchStart(e, message, isFromMe)}
				/>
			{:else}
				<ChatMessage
					{message}
					{showProfile}
					onHover={(e) => handleMessageBubbleHover(e, message, isFromMe)}
					onTouchStart={(e) => handleTouchStart(e, message, isFromMe)}
				/>
			{/if}
		</div>
	{/each}

	<!-- Single floating toolbar -->
	{#if activeMessage}
		<div
			bind:this={toolbarElement}
			class="pointer-events-auto absolute z-20 flex items-center space-x-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg transition-all duration-200 dark:border-gray-600 dark:bg-gray-800"
			style="top: {toolbarPosition.y}px; {activeMessageFromMe
				? `right: ${toolbarPosition.x}px`
				: `left: ${toolbarPosition.x}px`};"
		>
			<!-- Reply Button -->
			<button
				class="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
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

			<!-- Edit Button (only show for own messages) -->
			{#if activeMessageFromMe}
				<button
					class="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
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
					class="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
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
		</div>
	{/if}
</div>
