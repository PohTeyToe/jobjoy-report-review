<script lang="ts">
  import { VARIANTS } from '$lib/variants';
</script>

<main class="mx-auto max-w-5xl px-6 py-20">
  <h1 class="text-5xl font-semibold tracking-tight">JobJoy Report Review</h1>
  <p class="mt-4 text-lg text-neutral-600 max-w-2xl">
    Six directions for your JobJoy Sample 1 report. Click anywhere on a page to drop a comment —
    points, paragraphs, diagrams, whitespace, anything.
  </p>

  <section class="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each VARIANTS as v}
      <a
        href={`/review?variant=${v.slug}`}
        class="group rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-400 hover:shadow-md"
      >
        <div
          class="mb-4 h-24 rounded-xl"
          style={`background: linear-gradient(135deg, ${v.accent}, ${v.accentTo})`}
        ></div>
        <div class="text-sm uppercase tracking-wider text-neutral-500">{v.slug}</div>
        <div class="mt-1 text-xl font-semibold">{v.title}</div>
        <p class="mt-2 text-sm text-neutral-600">{v.tagline}</p>
      </a>
    {/each}
  </section>

  <div class="mt-12">
    <a
      href="/review?variant=recommended"
      class="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-800"
    >
      Start reviewing →
    </a>
  </div>
</main>
