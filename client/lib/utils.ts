/**
 * @fileoverview Utility functions and types for Svelte components.
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind CSS classes with clsx. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Removes 'child' prop from type. */
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;

/** Removes 'children' prop from type. */
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;

/** Removes both 'child' and 'children' props from type. */
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;

/** Adds optional element ref to type. */
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
