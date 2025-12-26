import type { Component } from 'svelte';
import type { HTMLButtonAttributes } from 'svelte/elements';

export const buttonVariants: any;
export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null | undefined;
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | null | undefined;
export type ButtonProps = HTMLButtonAttributes & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

declare const Button: Component<ButtonProps>;
export default Button;
