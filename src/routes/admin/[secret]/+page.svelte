<script lang="ts">
  import { page } from '$app/state';
  import { PUBLIC_ADMIN_SECRET } from '$env/static/public';
  import { error } from '@sveltejs/kit';

  if (page.params.secret !== PUBLIC_ADMIN_SECRET) {
    error(404, 'Not found');
  }
</script>

<main class="mx-auto max-w-6xl px-6 py-12">
  <h1 class="text-3xl font-semibold">Admin — Phase 0 placeholder</h1>
  <p class="mt-2 text-neutral-500">Pins table + filters + export arrive in Phase 4.</p>
</main>
