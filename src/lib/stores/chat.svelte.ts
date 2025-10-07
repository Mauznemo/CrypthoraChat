import { isClientMessage } from '$lib/chat/messages';
import type ScrollView from '$lib/components/chat/ScrollView.svelte';
import type { ChatWithoutMessages, ClientChat, ClientMessage } from '$lib/types';
import type { SystemMessage, User } from '$prisma';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

class Chat {
	user: User | null = $state(null);
	activeChat: ChatWithoutMessages | null = $state(null);
	scrollView: ScrollView | null = $state(null);
	versionedChatKey: Record<number, CryptoKey> = $state({});

	private getDateLabel(date: Date): string {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		const messageDate = new Date(date);
		messageDate.setHours(0, 0, 0, 0);
		today.setHours(0, 0, 0, 0);
		yesterday.setHours(0, 0, 0, 0);

		if (messageDate.getTime() === today.getTime()) {
			return get(t)('chat.today');
		} else if (messageDate.getTime() === yesterday.getTime()) {
			return get(t)('chat.yesterday');
		} else {
			return messageDate.toLocaleDateString([], {
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
		}
	}

	private getStartOfDay(date: Date): Date {
		const d = new Date(date);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	combinedMessages = $derived.by(() => {
		const allMessages = [...this.messages, ...this.systemMessages];
		const seen = new Set();
		const unique = allMessages.filter((msg) => {
			if (seen.has(msg.id)) {
				return false;
			}
			seen.add(msg.id);
			return true;
		});

		const sorted = unique.sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);

		const withDateSeparators: (ClientMessage | SystemMessage)[] = [];
		let currentDate: string | null = null;

		for (const msg of sorted) {
			const msgDate = this.getStartOfDay(new Date(msg.timestamp));
			const dateKey = msgDate.toISOString().split('T')[0];

			if (currentDate !== dateKey) {
				currentDate = dateKey;

				const isDateSeparator =
					!isClientMessage(msg) &&
					msg.content &&
					(msg.content === 'Today' ||
						msg.content === 'Yesterday' ||
						msg.content.match(/^\w+ \d+, \d{4}$/));

				if (!isDateSeparator && this.activeChat) {
					const dateSeparator: SystemMessage = {
						id: `date-separator-${dateKey}`,
						usedKeyVersion: this.activeChat.currentKeyVersion,
						chatId: this.activeChat.id,
						timestamp: msgDate,
						content: this.getDateLabel(msgDate)
					};
					withDateSeparators.push(dateSeparator);
				}
			}

			withDateSeparators.push(msg);
		}

		return withDateSeparators;
	});

	messages: ClientMessage[] = $state([]);
	systemMessages: SystemMessage[] = $state([]);
	loadingChat = $state(true);

	getNewestChatKey(): CryptoKey | null {
		if (this.activeChat === null) return null;

		const key = this.versionedChatKey[this.activeChat.currentKeyVersion];
		if (!key) return null;

		return key;
	}

	resetChatKey(): void {
		this.versionedChatKey = {};
	}

	resetMessages(): void {
		this.messages = [];
		this.systemMessages = [];
	}

	chats: ClientChat[] = $state([]);
}

export const chatStore = new Chat();
