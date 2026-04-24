<script lang="ts">
  import { setIdentity, type Identity } from './identity';

  type Props = {
    onidentity?: (identity: Identity) => void;
  };

  const { onidentity }: Props = $props();

  let name = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    // Autofocus the input once mounted.
    inputEl?.focus();
  });

  async function submit(e?: Event): Promise<void> {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    submitting = true;
    error = null;
    try {
      const identity = await setIdentity(trimmed);
      onidentity?.(identity);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not save your name';
      submitting = false;
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    // Trap focus inside the modal; Esc is intentionally NOT a close path —
    // the reviewer must enter a name before they can interact with the page.
    if (e.key === 'Tab') {
      e.preventDefault();
      inputEl?.focus();
    }
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
  aria-labelledby="name-modal-title"
>
  <form
    class="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
    onsubmit={submit}
    data-testid="name-modal"
  >
    <h2 id="name-modal-title" class="mb-2 text-lg font-semibold text-neutral-900">
      Who's reviewing?
    </h2>
    <p class="mb-4 text-sm text-neutral-600">
      Your name will be attached to the comments you leave.
    </p>
    <label class="block">
      <span class="sr-only">Your name</span>
      <input
        bind:this={inputEl}
        type="text"
        bind:value={name}
        placeholder="e.g. George"
        autocomplete="off"
        data-testid="name-input"
        aria-label="Your name"
        onkeydown={onKeydown}
        class="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20"
      />
    </label>
    {#if error}
      <p class="mt-2 text-sm text-red-600" role="alert">{error}</p>
    {/if}
    <div class="mt-4 flex justify-end">
      <button
        type="submit"
        disabled={!name.trim() || submitting}
        data-testid="name-submit"
        aria-label="Continue"
        class="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'Saving…' : 'Continue'}
      </button>
    </div>
  </form>
</div>
