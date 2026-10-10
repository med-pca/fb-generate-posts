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
  /** Extension Chrome (défaut), plugin WordPress, ou agent local. */
  kind?: 'chrome' | 'wordpress' | 'agent';
  /** La version, quand elle n'est pas dans manifest.json. */
  versionOf?: (read: (path: string) => string | undefined) => string;
  /** Dossier racine dans le ZIP : WordPress installe un plugin depuis
   * `<dossier>/<fichier>.php`. */
  zipRoot?: string;
  /** Comment l'installer, en une phrase, sur la carte. */
  installHint?: string;
  /** La clé NSTBrowser : indispensable (sans elle, rien ne marche) ou utile
   * (appairage automatique, veille). Absente = l'extension ne s'en sert pas. */
  nstKey?: 'required' | 'useful';
  /** Ce qui casse sans elle, dit à l'utilisateur avant le téléchargement. */
  nstKeyWhy?: string;
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
    nstKey: 'useful',
    nstKeyWhy: 'L’extension ne pourra pas s’appairer seule à son profil (il faudra un code d’appairage par navigateur), et la veille entre deux lots restera inactive.',
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
    nstKey: 'required',
    nstKeyWhy: 'L’extension ne détectera pas le profil NSTBrowser (« Clé API Nstbrowser absente de config.js ») : elle ne chargera aucun groupe et ne démarrera pas.',
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
  {
    key: 'agent',
    kind: 'agent',
    name: 'Agent local · PostFlow',
    letter: 'L',
    color: '#0f766e',
    dir: 'agent',
    role: 'Ouvre automatiquement les navigateurs NSTBrowser selon le Pilotage, les rouvre après la veille, et synchronise les profils (nouveaux, noms).',
    installOn: 'Chaque ordinateur où tourne NSTBrowser — une fois par ordinateur, avec la clé du compte.',
    installHint:
      'Python 3 requis (python.org). Dézippez, puis double-cliquez « Lancer l’agent PostFlow (Mac).command » ou « (Windows).bat », ' +
      'et laissez la fenêtre ouverte. Le Pilotage affiche alors « Agent local : actif ». Mode d’emploi : LISEZMOI.txt.',
    nstKey: 'required',
    nstKeyWhy: 'L’agent ne pourra pas ouvrir les navigateurs : réglez d’abord votre clé NSTBrowser (en haut de la plateforme).',
    exclude: /(^|\/)(tests?|__pycache__)(\/|$)|\.DS_Store$|\.pyc$|(^|\/)agent\.log(\.\d+)?$/,
    zipRoot: 'postflow-agent/',
    versionOf: (read) => /^AGENT_VERSION\s*=\s*"([\w.+-]+)"/m.exec(read('postflow_agent.py') ?? '')?.[1] ?? '0.0.0',
    preset: {
      file: 'agent.config.json',
      fill: (text, ctx) => {
        let cfg: Record<string, unknown> = {};
        try {
          cfg = JSON.parse(text || '{}');
        } catch {
          cfg = {};
        }
        return `${JSON.stringify({ ...cfg, apiBaseUrl: `${ctx.origin}/api`, apiKey: ctx.apiKey }, null, 2)}\n`;
      },
    },
  },
  {
    key: 'wordpress',
    kind: 'wordpress',
    name: 'Plugin WordPress · PostFlow',
    letter: 'W',
    color: '#21759b',
    dir: 'wordpress/data-fb-posting',
    role: 'Relie un site WordPress à la plateforme : envoie ses articles (et leurs modifications), reçoit les articles réécrits.',
    installOn: 'Chaque site WordPress de destination.',
    installHint:
      'WordPress → Extensions → Ajouter → Téléverser le ZIP → Activer. Puis Réglages → Data FB Posting : URL de réception ' +
      '« <adresse de la plateforme>/api/wordpress/articles » et la clé WordPress du serveur. Mise à jour : téléverser la ' +
      'nouvelle version, WordPress propose de remplacer — les réglages sont conservés.',
    exclude: COMMON_EXCLUDE,
    zipRoot: 'data-fb-posting/',
    // Pas de préréglage : la clé du plugin est celle du serveur
    // (WORDPRESS_API_KEY), jamais mise dans un fichier téléchargeable.
    versionOf: (read) => /^\s*\*\s*Version:\s*([\w.+-]+)/m.exec(read('data-fb-posting.php') ?? '')?.[1] ?? '0.0.0',
  },
];
