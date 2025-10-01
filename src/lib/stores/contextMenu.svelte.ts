import { cursorStore } from './cursor.svelte';

export interface ContextMenuItem {
	id: string;
	label: string;
	icon: string;
	action: () => void;
	disabled?: boolean;
}

class ContextMenuStore {
	isOpen = $state(false);
	position = $state({ x: 0, y: 0 });
	items = $state<ContextMenuItem[]>([]);
	closeOnSelect: boolean = true;

	open(element: HTMLElement, items: ContextMenuItem[], closeOnSelect: boolean = true) {
		this.isOpen = true;
		this.items = items;
		this.closeOnSelect = closeOnSelect;

		const rect = element.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		const isMobile = viewportWidth < 768;

		if (isMobile) {
			this.position = { x: 0, y: 0 };
		} else {
			const menuWidth = 200;
			const menuHeight = items.length * 40;
			let x = rect.left;
			let y = rect.bottom + 8;

			if (x + menuWidth > viewportWidth) {
				x = rect.right - menuWidth;
			}

			if (y + menuHeight > viewportHeight) {
				y = rect.top - menuHeight - 8;
			}

			if (x < 8) {
				x = 8;
			}

			if (y < 8) {
				y = 8;
			}

			this.position = { x, y };
		}
	}

	openAtCursor(items: ContextMenuItem[], closeOnSelect: boolean = true) {
		this.isOpen = true;
		this.items = items;
		this.closeOnSelect = closeOnSelect;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const isMobile = viewportWidth < 768;

		if (isMobile) {
			this.position = { x: 0, y: 0 };
		} else {
			const menuWidth = 200;
			const menuHeight = items.length * 40;
			const pos = cursorStore.position;

			let x = pos.x;
			let y = pos.y + 8;

			if (x + menuWidth > viewportWidth) {
				x = pos.x - menuWidth;
			}

			if (y + menuHeight > viewportHeight) {
				y = pos.y - menuHeight - 8;
			}

			if (x < 8) {
				x = 8;
			}
			if (y < 8) {
				y = 8;
			}

			this.position = { x, y };
		}
	}

	close() {
		this.isOpen = false;
		this.items = [];
	}

	selectItem(item: ContextMenuItem) {
		if (item.disabled) return;

		item.action();

		if (this.closeOnSelect) {
			this.close();
		}
	}
}

export const contextMenuStore = new ContextMenuStore();
