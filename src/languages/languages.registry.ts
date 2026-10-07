import { registerDecorator, ValidationOptions } from 'class-validator';

/** Les langues connues de la plateforme : code ISO → nom en anglais.
 * Un seul nom, en anglais, parce que c'est lui qu'on donne à l'IA
 * (« Translate … into Swedish »). La table `languages` fait foi :
 * LanguagesService recharge ce registre au démarrage et après chaque
 * modification ; ces valeurs ne servent qu'avant le premier chargement. */
export const LANGUAGES: Record<string, string> = {
  en: 'English', fr: 'French', ar: 'Arabic', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese',
  nl: 'Dutch', tr: 'Turkish', pl: 'Polish', ro: 'Romanian', ru: 'Russian', hi: 'Hindi', id: 'Indonesian',
};
export const languageName = (code: string) => LANGUAGES[code] ?? code;
export const isKnownLanguage = (code: unknown) => typeof code === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGES, code);

/** Remplace le contenu du registre (même objet : les imports restent valides). */
export function loadLanguages(rows: Array<{ code: string; name: string }>) {
  for (const k of Object.keys(LANGUAGES)) delete LANGUAGES[k];
  for (const r of rows) LANGUAGES[r.code] = r.name;
}

/** Une langue de la liste du moment (et pas celle connue au démarrage). */
export function IsKnownLanguage(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isKnownLanguage',
      target: object.constructor,
      propertyName,
      options: { message: 'Langue inconnue : ajoutez-la dans Groupes → Gérer les langues', ...options },
      validator: { validate: (value: unknown) => isKnownLanguage(value) },
    });
}
