class Layout {
	safeAreaPadding: { top: number; bottom: number; left: number; right: number } = $state({
		top: 0,
		bottom: 0,
		left: 0,
		right: 0
	});

	updateSafeAreaPadding() {
		if (window.flutterSafeAreaInsets) {
			this.safeAreaPadding = {
				top: window.flutterSafeAreaInsets.top,
				bottom: window.flutterSafeAreaInsets.bottom,
				left: window.flutterSafeAreaInsets.left,
				right: window.flutterSafeAreaInsets.right
			};
			return;
		}

		this.safeAreaPadding = {
			top: 0,
			bottom: 0,
			left: 0,
			right: 0
		};
	}
}

export const layoutStore = new Layout();
