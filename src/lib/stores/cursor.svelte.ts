class Cursor {
	#position = $state({ x: 0, y: 0 });
	#initialized = false;

	constructor(init = { x: 0, y: 0 }) {
		this.#position = init;

		if (typeof window !== 'undefined') {
			this.#init();
		}
	}

	#init() {
		if (this.#initialized) return;
		this.#initialized = true;

		const updatePosition = (e: MouseEvent) => {
			this.#position = { x: e.clientX, y: e.clientY };
		};

		window.addEventListener('mousemove', updatePosition);

		return () => {
			window.removeEventListener('mousemove', updatePosition);
		};
	}

	get position() {
		return this.#position;
	}

	get x() {
		return this.#position.x;
	}

	get y() {
		return this.#position.y;
	}
}

export const cursorStore = new Cursor();
