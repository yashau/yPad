/**
 * @fileoverview Theme store for light/dark mode.
 *
 * Persists preference to localStorage, falls back to system preference.
 */

type Theme = 'light' | 'dark';

function createThemeStore() {
	function applyTheme(newTheme: Theme) {
		if (typeof document !== 'undefined') {
			document.documentElement.classList.remove('light', 'dark');
			document.documentElement.classList.add(newTheme);
		}
	}

	let initialTheme: Theme = 'dark';
	if (typeof window !== 'undefined') {
		const stored = localStorage.getItem('theme') as Theme | null;
		if (stored === 'light' || stored === 'dark') {
			initialTheme = stored;
		} else {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			initialTheme = prefersDark ? 'dark' : 'light';
		}
		applyTheme(initialTheme);
	}

	let theme = $state<Theme>(initialTheme);

	return {
		get current() {
			return theme;
		},
		toggle() {
			theme = theme === 'light' ? 'dark' : 'light';
			localStorage.setItem('theme', theme);
			applyTheme(theme);
		},
		set(newTheme: Theme) {
			theme = newTheme;
			localStorage.setItem('theme', theme);
			applyTheme(theme);
		}
	};
}

export const themeStore = createThemeStore();
