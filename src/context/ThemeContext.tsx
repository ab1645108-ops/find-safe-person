import React, { createContext, useContext, useState, useEffect } from 'react';

export type PleasantTheme = 'aurora' | 'ocean' | 'daylight';

interface ThemeContextType {
  theme: PleasantTheme;
  setTheme: (theme: PleasantTheme) => void;
  isLight: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'aurora',
  setTheme: () => {},
  isLight: false,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<PleasantTheme>(() => {
    try {
      const saved = localStorage.getItem('findsafe_pleasant_theme');
      if (saved === 'aurora' || saved === 'ocean' || saved === 'daylight') {
        return saved;
      }
    } catch {
      // ignore local storage error
    }
    return 'aurora';
  });

  const setTheme = (newTheme: PleasantTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('findsafe_pleasant_theme', newTheme);
    } catch {
      // ignore
    }
  };

  const isLight = theme === 'daylight';

  useEffect(() => {
    document.documentElement.classList.remove('theme-aurora', 'theme-ocean', 'theme-daylight', 'dark', 'light');
    document.documentElement.classList.add(`theme-${theme}`);
    if (isLight) {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [theme, isLight]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isLight }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
