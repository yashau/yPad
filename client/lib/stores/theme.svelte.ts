type Theme = 'light' | 'dark';

function createThemeStore() {
	function applyTheme(newTheme: Theme) {
		if (typeof document !== 'undefined') {
			document.documentElement.classList.remove('light', 'dark');
			document.documentElement.classList.add(newTheme);
		}
	}

	// Determine initial theme
	let initialTheme: Theme = 'dark';
	if (typeof window !== 'undefined') {
		const stored = localStorage.getItem('theme') as Theme | null;
		if (stored === 'light' || stored === 'dark') {
			// User has manually set a theme preference
			initialTheme = stored;
		} else {
			// No manual preference, use system preference
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			initialTheme = prefersDark ? 'dark' : 'light';
		}

		// Apply theme to document
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
