import type { Preferences, PreferencesStore } from '../platform/preferences';

// No Session or game UI exists until the player confirms a language.
export function chooseLanguage(game: HTMLElement, preferences: PreferencesStore): Promise<boolean> {
  const screen = document.createElement('section');
  screen.id = 'LanguageScreen';
  screen.setAttribute('aria-labelledby', 'LanguageTitle');
  screen.innerHTML = `
    <form id="LanguageForm" class="language-card">
      <div class="language-logo">IRON SWARM</div>
      <h1 id="LanguageTitle">Choose your language</h1>
      <p class="language-subtitle">Выберите язык</p>
      <fieldset class="language-options">
        <legend class="language-legend">Language / Язык</legend>
        <label class="language-option" lang="en">
          <input type="radio" name="start-language" value="en">
          <span>English</span><small>EN</small>
        </label>
        <label class="language-option" lang="ru">
          <input type="radio" name="start-language" value="ru">
          <span>Русский</span><small>RU</small>
        </label>
      </fieldset>
      <button id="LanguageContinue" type="submit">Continue</button>
    </form>`;
  const form = screen.querySelector<HTMLFormElement>('form')!;
  const radios = [...screen.querySelectorAll<HTMLInputElement>('input')];
  const selectedLanguage = () =>
    radios.find(input => input.checked)!.value as Preferences['language'];
  const translate = () => {
    const language = selectedLanguage();
    document.documentElement.lang = language;
    screen.querySelector('h1')!.textContent = language === 'en' ? 'Choose your language' : 'Выберите язык';
    screen.querySelector('.language-subtitle')!.textContent = language === 'en' ? 'Выберите язык' : 'Choose your language';
    screen.querySelector('button')!.textContent = language === 'en' ? 'Continue' : 'Продолжить';
  };
  radios.find(input => input.value === preferences.value.language)!.checked = true;
  form.addEventListener('change', translate);
  translate();
  game.appendChild(screen);
  radios.find(input => input.checked)!.focus({ preventScroll: true });
  return new Promise(resolve => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      const persisted = preferences.update({ language: selectedLanguage() });
      screen.remove();
      resolve(persisted);
    }, { once: true });
  });
}
