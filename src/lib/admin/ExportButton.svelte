<script lang="ts">
  import { buildMarkdown, exportFilename } from './markdown-export';
  import type { AdminPin, AdminPick, AdminThreadComment } from './admin-store.svelte';

  type Props = {
    pins: AdminPin[];
    picks: AdminPick[];
    comments: Record<string, AdminThreadComment[]>;
  };

  const { pins, picks, comments }: Props = $props();

  function onExport(): void {
    const md = buildMarkdown({ pins, picks, comments });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
</script>

<button
  type="button"
  data-testid="export-feedback-pack"
  onclick={onExport}
  class="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
>
  Export feedback pack (.md)
</button>
