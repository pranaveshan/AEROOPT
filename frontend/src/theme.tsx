/** Theme selection (v2 Lime / v3 Cinematic). Stored locally; switching reloads so stylesheets never mix. */
export type ThemeId = 'v2' | 'v3';
export const THEME_KEY = 'aeroopt_theme';

export function getTheme(): ThemeId {
  try {
    return localStorage.getItem(THEME_KEY) === 'v2' ? 'v2' : 'v3';
  } catch {
    return 'v3';
  }
}

export function setTheme(t: ThemeId, reload = true) {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* storage unavailable */ }
  if (reload) window.location.reload();
}

export function ThemeSwitch() {
  const current = getTheme();
  return (
    <fieldset className="setting-row theme-switch">
      <legend>Interface theme</legend>
      {(['v3', 'v2'] as const).map(t => (
        <label key={t} className="theme-option">
          <input type="radio" name="aeroopt-theme" value={t} checked={current === t} onChange={() => setTheme(t)} />
          <span>{t === 'v3' ? 'v3 Cinematic' : 'v2 Lime'}</span>
        </label>
      ))}
    </fieldset>
  );
}
