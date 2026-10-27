import React, { useState, useRef, useEffect } from 'react';
import { Palette, Sun, Moon, Sparkles, Check } from 'lucide-react';
import { useTheme, PleasantTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export const ThemeSelector: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { dict } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themes: {
    id: PleasantTheme;
    name: string;
    description: string;
    icon: React.ReactNode;
    colorDots: string[];
  }[] = [
    {
      id: 'aurora',
      name: dict.theme.aurora,
      description: dict.theme.auroraDesc,
      icon: <Sparkles className="w-4 h-4 text-violet-400" />,
      colorDots: ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500'],
    },
    {
      id: 'ocean',
      name: dict.theme.ocean,
      description: dict.theme.oceanDesc,
      icon: <Moon className="w-4 h-4 text-cyan-400" />,
      colorDots: ['bg-cyan-500', 'bg-indigo-500', 'bg-blue-500', 'bg-emerald-500'],
    },
    {
      id: 'daylight',
      name: dict.theme.daylight,
      description: dict.theme.daylightDesc,
      icon: <Sun className="w-4 h-4 text-amber-400" />,
      colorDots: ['bg-blue-600', 'bg-emerald-600', 'bg-rose-500', 'bg-amber-500'],
    },
  ];

  const currentThemeObj = themes.find((t) => t.id === theme) || themes[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/80 text-xs font-medium transition shadow-sm"
        title={dict.theme.title}
        aria-label="Theme & Color Ambiance Selector"
      >
        <Palette className="w-3.5 h-3.5 text-indigo-400" />
        <span className="hidden sm:inline text-xs font-semibold">{currentThemeObj.name}</span>
        <div className="flex items-center -space-x-1">
          {currentThemeObj.colorDots.slice(0, 3).map((dot, idx) => (
            <span key={idx} className={`w-2 h-2 rounded-full ${dot} ring-1 ring-slate-900`} />
          ))}
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/90 shadow-2xl p-2.5 z-50 space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2.5 py-1.5 border-b border-slate-800">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-indigo-400" />
              <span>{dict.theme.title}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Harmonious color grading calibrated for eye comfort & legibility
            </p>
          </div>

          <div className="space-y-1 pt-1">
            {themes.map((t) => {
              const isSelected = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                      : 'hover:bg-slate-800/70 border border-transparent text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="p-1.5 rounded-lg bg-slate-800/90 border border-slate-700/60 mt-0.5 shrink-0">
                    {t.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-100">{t.name}</span>
                      <div className="flex items-center gap-1">
                        <div className="flex items-center -space-x-1">
                          {t.colorDots.map((dot, i) => (
                            <span key={i} className={`w-2 h-2 rounded-full ${dot} ring-1 ring-slate-900`} />
                          ))}
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 ml-1" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-1">
                      {t.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
