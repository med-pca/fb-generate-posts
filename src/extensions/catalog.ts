/** Nos extensions Chrome : où est leur code, ce qu'elles font, et comment y
 * glisser la configuration du compte au téléchargement. */
export type PresetContext = {
  /** https://post.pulserecipe.com (sans /api). */
  origin: string;
  apiKey: string;
  nstApiKey: string;
};

export type ExtensionDef = {
  key: string;
  name: string;
  letter: string;
  color: string;
  dir: string;
  role: string;
  /** À qui l'installer. */
  installOn: string;
  /** Ce qui entre dans le paquet (chemins relatifs au dossier). */
  include?: string[];
  exclude: RegExp;
  /** Le fichier de configuration, et comment le remplir. */
  preset?: { file: string; fill: (text: string, ctx: PresetContext) => string };
};

/** Remplace `champ: '...'` (ou "...") dans un fichier de configuration. */
export function setField(text: string, field: string, value: string) {
  const re = new RegExp(`(\\b${field}\\s*:\\s*)(['"])([^'"]*)\\2`);
  return re.test(text) ? text.replace(re, (_m, head: string, q: string) => `${head}${q}${value.replace(/[\\'"]/g, '')}${q}`) : text;
}

const COMMON_EXCLUDE = /(^|\/)(tests?|node_modules|dist|scripts)(\/|$)|\.DS_Store$|\.zip$|(^|\/)README\.md$|(^|\/)package(-lock)?\.json$|(^|\/)build\.sh$/;

export const EXTENSIONS: ExtensionDef[] = [
  {
    key: 'publication',
    name: 'Publication · PostFlow',
    letter: 'P',
    color: '#2563eb',
    dir: 'extension/fb-group-poster',
    role: 'Publie les posts dans les groupes, pose le premier commentaire puis l’URL de l’article.',
    installOn: 'Tous les profils qui publient (un navigateur NSTBrowser par profil).',
    include: ['manifest.json', 'src', 'icons'],
    exclude: COMMON_EXCLUDE,
    preset: {
      file: 'src/common/preset.js',
      fill: (_text, ctx) =>
        `/* Préréglage écrit par la plateforme au téléchargement : contient la clé\n * d'API du compte — ne pas partager ce paquet. */\nexport const PRESET = ${JSON.stringify(
          { apiBaseUrl: `${ctx.origin}/api`, apiKey: ctx.apiKey, nstApiKey: ctx.nstApiKey },
          null,
          2,
        )};\n`,
    },
  },
  {
    key: 'adhesion',
    name: 'Adhésion aux groupes · PostFlow',
    letter: 'A',
    color: '#17803d',
    dir: 'extension/fb-group-joiner',
    role: 'Demande à rejoindre les groupes liés à chaque profil (lancement manuel).',
    installOn: 'Les profils qui doivent rejoindre des groupes.',
    exclude: COMMON_EXCLUDE,
    preset: {
      file: 'config.js',
      fill: (text, ctx) => setField(setField(setField(text, 'apiBase', ctx.origin), 'apiKey', ctx.apiKey), 'nstApiKey', ctx.nstApiKey),
    },
  },
  {
    key: 'capture',
    name: 'Capture de posts · PostFlow',
    letter: 'C',
    color: '#d97706',
    dir: 'extension/fb-catch-post',
    role: 'Reprend une publication Facebook d’un clic (image + texte) vers un site WordPress.',
    installOn: 'Le navigateur de la personne qui repère les publications à reprendre.',
    exclude: COMMON_EXCLUDE,
    preset: {
      file: 'config.js',
      fill: (text, ctx) => setField(setField(text, 'apiBase', ctx.origin), 'apiKey', ctx.apiKey),
    },
  },
  {
    key: 'moderateur',
    name: 'Modérateur · PostFlow',
    letter: 'M',
    color: '#7c3aed',
    dir: 'extension/fb-post-checker',
    role: 'Vérifie les posts publiés, accepte l’adhésion de nos profils et les pré-approuve.',
    installOn: 'Uniquement le profil modérateur (admin ou modérateur des groupes).',
    exclude: COMMON_EXCLUDE,
    preset: {
      file: 'config.js',
      fill: (text, ctx) => setField(setField(text, 'apiBase', ctx.origin), 'apiKey', ctx.apiKey),
    },
  },
];
