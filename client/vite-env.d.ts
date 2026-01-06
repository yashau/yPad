/// <reference types="svelte" />
/// <reference types="vite/client" />

/** App version injected by Vite from package.json */
declare const __APP_VERSION__: string;

declare module '*.svelte' {
  import type { ComponentType, SvelteComponent } from 'svelte';
  const component: ComponentType<SvelteComponent>;
  export default component;
}
