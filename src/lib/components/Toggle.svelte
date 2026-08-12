<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		onchange
	}: {
		checked: boolean;
		label: string;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<label class="flex cursor-pointer items-center gap-3">
	<div class="relative">
		<input type="checkbox" class="peer sr-only" bind:checked onchange={() => onchange?.(checked)} />
		<div
			class="peer h-8 w-14 rounded-full bg-gray-700/40 frosted-glass transition-colors peer-checked:bg-accent-600/60"
		></div>
		<div
			class="absolute top-1 left-1 h-6 w-6 rounded-full bg-white transition-transform peer-checked:translate-x-6"
		></div>
	</div>
	<span>{label}</span>
</label>
