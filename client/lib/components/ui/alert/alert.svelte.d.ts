import type { Component } from 'svelte';

export const alertVariants: any;
export type AlertVariant = 'default' | 'destructive' | null | undefined;

declare const Alert: Component;
export default Alert;
