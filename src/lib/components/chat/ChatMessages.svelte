<script lang="ts">
	import { onMount } from 'svelte';
	import MyChatMessage from './MyChatMessage.svelte';
	import ChatMessage from './ChatMessage.svelte';
	import type { ClientMessage, MessageWithRelations } from '$lib/types';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { isClientMessage } from '$lib/chat/messages';
	import Icon from '@iconify/svelte';
	import { chats } from '$lib/chat/chats';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import ScrollView from './ScrollView.svelte';
	import { cursorStore } from '$lib/stores/cursor.svelte';
	import { scale } from 'svelte/transition';
	import { expoInOut } from 'svelte/easing';

	interface ToolbarPosition {
		x: number;
		y: number;
	}

	let {
		scrollView = $bindable<ScrollView>(),
		onEdit,
		onReply,
		onDelete,
		onInfo,
		onReaction,
		onUpdateReaction,
		onDecryptError
	}: {
		scrollView: ScrollView;
		onEdit: (message: MessageWithRelations) => void;
		onReply: (message: MessageWithRelations) => void;
		onDelete: (message: MessageWithRelations) => void;
		onInfo: (message: MessageWithRelations) => void;
		onReaction: (message: MessageWithRelations, position: { x: number; y: number }) => void;
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
	let messageContainer = $state<HTMLDivElement | null>(null);

	let isLoadingOlder = $state(false);
	let canLoadOlder = $state(false);

	let isTouchDevice: boolean = $state(false);
	let isHovering = false;

	function calculateToolbarPosition(messageEl: HTMLElement): ToolbarPosition {
		if (!messageContainer) return { x: 8, y: 0 };

		const messageRect = messageEl.getBoundingClientRect();
		const containerRect = messageContainer.getBoundingClientRect();

		let finalX: number;

		if (activeMessageFromMe) {
			const distanceToRight = window.innerWidth - containerRect.right;
			finalX = distanceToRight + 8;
		} else {
			finalX = containerRect.left + 8;
		}

		const viewportY = messageRect.top - 30;

		const clampedY = Math.max(viewportY, containerRect.top + 10);

		const toolbarHeight = 40;
		const finalY = Math.min(clampedY, containerRect.bottom - toolbarHeight);

		return {
			x: finalX,
			y: finalY
		};
	}

	function observeTopElement(node: HTMLDivElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry.isIntersecting && !isLoadingOlder && chats.hasMoreOlder && canLoadOlder) {
					console.log('Loading older messages');
					loadOlderMessages();
				}
			},
			{
				rootMargin: '100px 0px 0px 0px',
				threshold: 0
			}
		);

		observer.observe(node);

		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

	async function loadOlderMessages() {
		isLoadingOlder = true;

		await chats.loadOlderMessages(chatStore.activeChat);

		isLoadingOlder = false;
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
			activeMessage = message;
			activeMessageFromMe = isFromMe;
			const position = calculateToolbarPosition(messageEl);
			toolbarPosition = position;
		}
	}

	function handleMessageLeave(): void {
		if (isTouchDevice) return;
		console.log('handleMessageLeave');
		isHovering = false;
		// Delay hiding to allow hovering over toolbar
		hideTimeout = setTimeout(() => {
			if (isHovering) return;
			activeMessage = null;
		}, 150);
	}

	let scrolled = false;

	function handleTouchStart(event: TouchEvent): void {
		scrolled = false;
	}

	function handleTouchEnd(
		event: TouchEvent,
		message: MessageWithRelations,
		isFromMe: boolean
	): void {
		if (scrolled) return;
		const messageEl = event.currentTarget as HTMLElement;
		if (messageEl) {
			activeMessage = message;
			activeMessageFromMe = isFromMe;
			const position = calculateToolbarPosition(messageEl);
			toolbarPosition = position;
		}

		// if (activeMessage) {
		// 	event.preventDefault();
		// }
	}

	function handleTouchMove(): void {
		scrolled = true;
	}

	// Keep toolbar visible when hovering over it
	function handleToolbarMouseEnter(): void {
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}
	}

	function handleClickOutside(event: MouseEvent | TouchEvent): void {
		const target = event.target as HTMLElement;
		if (activeMessage && !toolbarElement?.contains(target)) {
			// activeMessage = null;
		}
	}

	function handleWheel(event: WheelEvent): void {
		event.preventDefault();
		event.stopPropagation();
		activeMessage = null;
	}

	let scrollTimeout: NodeJS.Timeout | null = null;

	function handleScrollUpdate(): void {
		activeMessage = null;

		if (scrollTimeout) {
			clearTimeout(scrollTimeout);
		}

		scrollTimeout = setTimeout(() => {
			checkMessageUnderCursor();
		}, 200);
	}

	function checkMessageUnderCursor(): void {
		const mousePosition = cursorStore.position;

		if (!mousePosition || isTouchDevice) return;

		const elementUnderCursor = document.elementFromPoint(mousePosition.x, mousePosition.y);

		if (
			elementUnderCursor?.className.includes('message-container') ||
			elementUnderCursor?.className.includes('message-wrapper')
		)
			return;

		const messageEl = elementUnderCursor?.closest('[data-message-id]') as HTMLElement;

		if (messageEl) {
			const messageId = messageEl.dataset.messageId;

			if (!messageId) return;

			const message = chatStore.messages.find((m) => m.id === messageId);

			if (!message) return;

			const isFromMe = message.senderId === chatStore.user!.id;

			if (!activeMessage || activeMessage.id !== messageId) {
				handleMessageBubbleHover(
					new MouseEvent('mouseenter'), // Create a fake mouse event
					message,
					isFromMe
				);
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

	function handleReaction(event: Event): void {
		const button = event.target as HTMLElement;
		if (activeMessage && button) {
			const rect = button.getBoundingClientRect();
			onReaction(activeMessage, { x: rect.left, y: rect.bottom + 8 });
			activeMessage = null;
		}
	}

	function checkIfTouchDevice(): boolean {
		if (typeof window === 'undefined') return false;
		// Check for fine pointer (mouse) as primary input method
		const hasFinePrimaryPointer = window.matchMedia('(pointer: fine)').matches;
		// Check if touch is available as a secondary input
		const hasTouchCapability = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		// Consider it a touch device only if fine pointer is not primary or touch points > 1
		return !hasFinePrimaryPointer || (hasTouchCapability && navigator.maxTouchPoints > 1);
	}

	onMount(() => {
		isTouchDevice = checkIfTouchDevice();

		console.log('Mobile device:', isTouchDevice);
		// Listen for clicks outside
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('touchstart', handleClickOutside);

		setTimeout(() => {
			canLoadOlder = true;
		}, 1000);

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

	$effect(() => {
		if (toolbarElement) {
			const handleMouseEnter = () => handleToolbarMouseEnter();

			toolbarElement.addEventListener('mouseenter', handleMouseEnter);

			return () => {
				toolbarElement?.removeEventListener('mouseenter', handleMouseEnter);
			};
		}
	});
</script>

<!-- Message container with toolbar -->
<ScrollView
	bind:this={scrollView}
	bind:container={messageContainer}
	handleScroll={handleScrollUpdate}
	class="min-h-0 p-2 pt-6"
>
	<div use:observeTopElement class="flex h-10 max-w-full flex-col items-center justify-center">
		{#if isLoadingOlder}
			<LoadingSpinner />
			<div class="py-2 text-center text-sm text-gray-500">Loading older messages...</div>
		{/if}
	</div>

	{#each chatStore.combinedMessages as message, index (message.id)}
		{#if isClientMessage(message)}
			{console.log('Key[', index, ']:', message.id)}
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
				class="message-wrapper relative max-w-full pl-6"
				data-message-id={message.id}
				onmouseleave={handleMessageLeave}
				ontouchend={(e) => handleTouchEnd(e, message, isFromMe)}
				ontouchmove={handleTouchMove}
				ontouchstart={handleTouchStart}
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
						onUpdateReaction={(encryptedReaction, operation) =>
							onUpdateReaction(message, encryptedReaction, operation)}
					/>
				{:else}
					<ChatMessage
						{message}
						{showProfile}
						onHover={(e) => handleMessageBubbleHover(e, message, isFromMe)}
						onUpdateReaction={(encryptedReaction, operation) =>
							onUpdateReaction(message, encryptedReaction, operation)}
						{onDecryptError}
					/>
				{/if}
			</div>
		{:else}
			<div class="text-center text-xs text-gray-400">
				<p>{message.content}</p>
			</div>
		{/if}
	{/each}

	<div class="h-4"></div>
</ScrollView>

<!-- Single floating toolbar -->
{#if activeMessage}
	<div
		bind:this={toolbarElement}
		in:scale={{ duration: 200, easing: expoInOut }}
		out:scale={{ duration: 200, easing: expoInOut }}
		onwheel={handleWheel}
		class="pointer-events-auto absolute z-20 flex items-center space-x-1 rounded-xl bg-gray-800/60 p-1 frosted-glass-shadow transition-all duration-200"
		style="top: {toolbarPosition.y}px; {activeMessageFromMe
			? `right: ${toolbarPosition.x}px`
			: `left: ${toolbarPosition.x}px`};"
	>
		<!-- Reply Button -->
		<button
			class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
			onclick={handleReply}
			data-tooltip="Reply"
			aria-label="Reply to message"
			type="button"
		>
			<Icon icon="material-symbols:reply-rounded" class="size-5" />
		</button>

		<button
			class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
			onclick={handleReaction}
			data-tooltip="Add Reaction"
			aria-label="Add Reaction"
			type="button"
		>
			<Icon icon="proicons:emoji" class="size-5" />
		</button>

		{#if activeMessageFromMe}
			<button
				class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
				onclick={handleEdit}
				data-tooltip="Edit"
				aria-label="Edit message"
				type="button"
			>
				<Icon icon="material-symbols:edit-outline-rounded" class="size-5" />
			</button>

			<!-- Delete Button -->
			<button
				class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-900/30 hover:text-red-400"
				onclick={handleDelete}
				data-tooltip="Delete"
				aria-label="Delete message"
				type="button"
			>
				<Icon icon="material-symbols:delete-outline-rounded" class="size-5" />
			</button>
		{/if}
		<button
			class="cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
			onclick={handleInfo}
			data-tooltip="Show info"
			aria-label="Show info"
			type="button"
		>
			<Icon icon="material-symbols:info-outline-rounded" class="size-5" />
		</button>
	</div>
{/if}
