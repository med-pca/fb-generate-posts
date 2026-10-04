<?php
/**
 * Plugin Name: Data FB Posting
 * Description: Envoie les articles publiés vers Data FB Posting, resynchronise leurs modifications (titre, contenu, image), et reçoit les articles réécrits que l'API dépose.
 * Version: 1.4.0
 * Requires at least: 5.6
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) { exit; }

final class DFB_Posting {
    const VERSION = '1.4.0';
    const OPTION = 'dfb_posting_settings';
    const HOOK = 'dfb_posting_deliver';
    const INGEST_META = '_dfb_ingest';
    /** Marqueur de coupure de page reconnu par WordPress. */
    const NEXT_PAGE = '<!--nextpage-->';
    /** Le corps arrive en JSON : une image de plus de 10 Mo n'y a pas sa place. */
    const MAX_IMAGE_BYTES = 10485760;
    const IMAGE_TYPES = array('image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif');

    public static function boot() {
        add_action('wp_after_insert_post', array(__CLASS__, 'saved'), 10, 4);
        add_action('rest_api_init', array(__CLASS__, 'routes'));
        // Priorité maximale : le filtre d'un plugin de sécurité doit avoir
        // rendu son verdict avant qu'on rouvre notre seule route. À 99, un
        // plugin accroché plus tard reprenait la main.
        add_filter('rest_authentication_errors', array(__CLASS__, 'unlock'), PHP_INT_MAX);
        add_action(self::HOOK, array(__CLASS__, 'deliver'), 10, 1);
        add_action('admin_menu', array(__CLASS__, 'menu'));
        add_action('admin_init', array(__CLASS__, 'register'));
        add_filter('manage_post_posts_columns', array(__CLASS__, 'columns'));
        add_action('manage_post_posts_custom_column', array(__CLASS__, 'status'), 10, 2);
    }

    public static function plain($text, $length) {
        $text = html_entity_decode(wp_strip_all_tags(strip_shortcodes($text)), ENT_QUOTES, 'UTF-8');
        $text = trim(preg_replace('/\s+/u', ' ', $text));
        return function_exists('mb_substr') ? mb_substr($text, 0, $length, 'UTF-8') : substr($text, 0, $length);
    }

    /** Les seuls champs suivis : tout le reste (catégories, SEO, réglages)
     * peut changer sans déclencher d'envoi. */
    public static function payload($id, $post) {
        $payload = array(
            'siteUrl' => untrailingslashit(home_url()),
            'siteName' => self::plain(get_bloginfo('name'), 200),
            'postId' => (string) $id,
            'title' => self::plain($post->post_title, 1000),
            'content' => self::plain($post->post_content, 100000),
            'excerpt' => self::plain($post->post_excerpt, 5000),
            'articleUrl' => get_permalink($id),
            'publishedAt' => get_post_time('c', true, $post),
        );
        $image = get_the_post_thumbnail_url($id, 'full');
        if ($image) { $payload['imageUrl'] = $image; }
        // Champ conditionnel : ajouté à tous les articles, il modifierait
        // l'empreinte de ceux déjà suivis et provoquerait un renvoi complet
        // du catalogue à la première sauvegarde.
        $ingest = get_post_meta($id, self::INGEST_META, true);
        if ($ingest) { $payload['ingestRef'] = $ingest; }
        return $payload;
    }

    public static function hash($payload) { return md5((string) wp_json_encode($payload)); }

    /** Reprise des articles suivis par la version sans synchronisation :
     * l'ancien instantané devient l'empreinte de ce qui est déjà parti, ou
     * l'envoi resté en attente. */
    public static function adopt($id) {
        $legacy = get_post_meta($id, '_dfb_snapshot', true);
        if (!$legacy) { return; }
        if (get_post_meta($id, '_dfb_sent', true)) {
            update_post_meta($id, '_dfb_hash', self::hash($legacy));
        } elseif (!get_post_meta($id, '_dfb_pending', true)) {
            update_post_meta($id, '_dfb_pending', wp_slash($legacy));
        }
        delete_post_meta($id, '_dfb_snapshot');
    }

    public static function saved($id, $post, $update, $before) {
        if ($post->post_type !== 'post' || $post->post_status !== 'publish' ||
            $post->post_password !== '' || wp_is_post_revision($id)) { return; }
        self::adopt($id);
        $known = get_post_meta($id, '_dfb_sent', true) || get_post_meta($id, '_dfb_pending', true);
        // Aucun import rétroactif : un article publié avant l'installation
        // n'entre dans le suivi qu'en repassant par une mise en ligne.
        if (!$known && $before && $before->post_status === 'publish') { return; }
        $payload = self::payload($id, $post);
        // Déjà transmis à l'identique : rien à resynchroniser.
        if (self::hash($payload) === get_post_meta($id, '_dfb_hash', true)) { return; }
        // La dernière version enregistrée remplace celle qui attendait encore.
        update_post_meta($id, '_dfb_pending', wp_slash($payload));
        self::schedule($id, 1);
    }

    public static function schedule($id, $delay) {
        if (!wp_next_scheduled(self::HOOK, array($id))) {
            $result = wp_schedule_single_event(time() + $delay, self::HOOK, array($id), true);
            if (is_wp_error($result) || !$result) {
                update_post_meta($id, '_dfb_error', 'Planification impossible : vérifier WP-Cron.');
            }
        }
    }

    public static function deliver($id) {
        self::adopt($id);
        $payload = get_post_meta($id, '_dfb_pending', true);
        $post = get_post($id);
        if (!$payload || !$post) { return; }
        // Never send an article withdrawn or made private before delivery.
        if ($post->post_status !== 'publish' || $post->post_password !== '') {
            self::failed($id, 'Article non public : envoi en attente.');
            return;
        }
        $settings = get_option(self::OPTION, array());
        if (empty($settings['endpoint']) || empty($settings['key'])) {
            self::failed($id, 'Configurer l’URL API et la clé dans Réglages > Data FB Posting.');
            return;
        }
        $response = wp_remote_post($settings['endpoint'], array(
            'timeout' => 40,
            'redirection' => 0,
            'headers' => array('Content-Type' => 'application/json', 'x-api-key' => $settings['key']),
            'body' => wp_json_encode($payload),
        ));
        if (is_wp_error($response)) {
            self::failed($id, 'API inaccessible : nouvel essai automatique.');
            return;
        }
        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if ($code < 200 || $code >= 300 || !is_array($body) || empty($body['articleId'])) {
            self::failed($id, 'Réponse API invalide (HTTP ' . intval($code) . '). Vérifier URL et clé.');
            return;
        }
        $sent = self::hash($payload);
        update_post_meta($id, '_dfb_sent', current_time('mysql', true));
        update_post_meta($id, '_dfb_hash', $sent);
        delete_post_meta($id, '_dfb_error');
        delete_post_meta($id, '_dfb_attempt');
        wp_clear_scheduled_hook(self::HOOK, array($id));
        // Une modification enregistrée pendant l'envoi reste à transmettre.
        if (self::hash(get_post_meta($id, '_dfb_pending', true)) === $sent) {
            delete_post_meta($id, '_dfb_pending');
        } else {
            self::schedule($id, 1);
        }
    }

    public static function failed($id, $error) {
        $attempt = (int) get_post_meta($id, '_dfb_attempt', true) + 1;
        update_post_meta($id, '_dfb_attempt', $attempt);
        update_post_meta($id, '_dfb_error', $error);
        self::schedule($id, min(3600, 60 * pow(2, min($attempt - 1, 6))));
    }

    public static function routes() {
        register_rest_route('dfb/v1', '/articles', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'receive'),
            'permission_callback' => array(__CLASS__, 'authorized'),
        ));
        // Relire un article tel qu'il serait envoyé : le serveur s'en sert quand
        // le renvoi tarde (WP-Cron qui ne passe pas sur un site peu visité).
        register_rest_route('dfb/v1', '/articles/(?P<id>\d+)', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'read_route'),
            'permission_callback' => array(__CLASS__, 'authorized'),
        ));
        // De quoi vérifier, sans rien publier, que l'extension est bien la
        // bonne version et que la clé passe le verrou du site.
        register_rest_route('dfb/v1', '/status', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'status_route'),
            'permission_callback' => array(__CLASS__, 'authorized'),
        ));
    }

    /** Même clé que les envois sortants, comparée en temps constant. Sans clé
     * enregistrée, la route reste fermée : un site fraîchement installé ne
     * doit pas accepter d'articles. */
    public static function authorized($request) {
        $settings = get_option(self::OPTION, array());
        $key = isset($settings['key']) ? (string) $settings['key'] : '';
        $provided = (string) $request->get_header('x-api-key');
        if ($key === '' || $provided === '' || !hash_equals($key, $provided)) {
            return new WP_Error('dfb_forbidden', 'Clé invalide.', array('status' => 401));
        }
        return true;
    }

    /** Un article public, dans la forme exacte de l'envoi (référence de
     * reprise comprise). Un brouillon ou un article protégé n'existe pas. */
    public static function read_route($request) {
        $id = (int) $request['id'];
        $post = $id ? get_post($id) : null;
        if (!$post || $post->post_type !== 'post' || $post->post_status !== 'publish' || $post->post_password !== '') {
            return new WP_Error('dfb_not_found', 'Article introuvable ou non public.', array('status' => 404));
        }
        return self::payload($id, $post);
    }

    public static function status_route() {
        return array(
            'plugin' => 'data-fb-posting',
            'version' => self::VERSION,
            'endpointConfigured' => !empty(get_option(self::OPTION, array())['endpoint']),
        );
    }

    /** Beaucoup de sites ferment toute l'API REST aux visiteurs non
     * connectés (« rest_login_required »). Ce verrou s'applique avant le
     * `permission_callback` de chaque route : sans cela, notre dépôt serait
     * refusé même avec la bonne clé. On rouvre donc la seule route dfb, et
     * seulement quand la clé est déjà correcte — le `permission_callback` la
     * revérifie juste après. */
    public static function unlock($result) {
        if (!is_wp_error($result)) { return $result; }
        $uri = isset($_SERVER['REQUEST_URI']) ? (string) wp_unslash($_SERVER['REQUEST_URI']) : '';
        if (strpos($uri, 'dfb/v1/') === false) { return $result; }
        // Rendre le verrou du site tel quel ne dirait pas si l'extension a
        // seulement eu la parole. Trois réponses distinctes, et la version
        // qui a répondu : de quoi trancher à distance entre « extension
        // inactive », « aucune clé » et « clé différente ».
        $settings = get_option(self::OPTION, array());
        $key = isset($settings['key']) ? (string) $settings['key'] : '';
        $provided = isset($_SERVER['HTTP_X_API_KEY']) ? (string) wp_unslash($_SERVER['HTTP_X_API_KEY']) : '';
        if ($key === '') {
            return new WP_Error('dfb_no_key', 'Aucune clé enregistrée dans Réglages > Data FB Posting.',
                array('status' => 401, 'version' => self::VERSION));
        }
        if ($provided === '') {
            return new WP_Error('dfb_no_header', 'En-tête x-api-key absent.',
                array('status' => 401, 'version' => self::VERSION));
        }
        if (!hash_equals($key, $provided)) {
            return new WP_Error('dfb_bad_key', 'La clé présentée ne correspond pas à celle enregistrée.',
                array('status' => 401, 'version' => self::VERSION, 'expectedLength' => strlen($key)));
        }
        return true;
    }

    /** Dépose l'article réécrit. Publié en deux temps : brouillon d'abord, le
     * temps de poser la référence de reprise et l'image à la une, puis mise en
     * ligne — c'est elle qui déclenche le renvoi vers l'API, et il doit porter
     * ces deux éléments. */
    public static function receive($request) {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_Error('dfb_bad_body', 'Corps JSON attendu.', array('status' => 400));
        }
        $title = isset($body['title']) ? sanitize_text_field((string) $body['title']) : '';
        $content = isset($body['contentHtml']) ? (string) $body['contentHtml'] : '';
        if ($title === '' || trim($content) === '') {
            return new WP_Error('dfb_incomplete', 'title et contentHtml sont requis.', array('status' => 400));
        }
        // `wp_insert_post` attend des données ÉCHAPPÉES : il leur applique
        // `wp_unslash`. Sans `wp_slash`, tout antislash du contenu est mangé,
        // et un « \n » écrit en toutes lettres par le modèle ressortait en
        // « n » isolé au milieu de l'article.
        $id = wp_insert_post(array(
            'post_type' => 'post',
            'post_status' => 'draft',
            'post_title' => wp_slash($title),
            'post_name' => isset($body['slug']) ? sanitize_title((string) $body['slug']) : '',
            'post_excerpt' => wp_slash(isset($body['excerpt']) ? sanitize_text_field((string) $body['excerpt']) : ''),
            'post_content' => wp_slash(self::clean_body($content)),
            // Posée à l'insertion : `wp_after_insert_post` la lira au passage
            // en ligne, et l'API saura à quelle reprise rattacher l'article.
            'meta_input' => array(self::INGEST_META => isset($body['ingestRef']) ? sanitize_text_field((string) $body['ingestRef']) : ''),
        ), true);
        if (is_wp_error($id)) { return $id; }
        $warning = self::attach_image($id, isset($body['image']) ? $body['image'] : null);
        $published = wp_update_post(array('ID' => $id, 'post_status' => 'publish'), true);
        if (is_wp_error($published)) { return $published; }
        // Le renvoi vient d'être planifié : réveiller WP-Cron tout de suite
        // plutôt qu'à la prochaine visite du site (requête non bloquante).
        if (function_exists('spawn_cron')) { spawn_cron(); }
        return array(
            'postId' => (string) $id,
            'permalink' => get_permalink($id),
            'imageWarning' => $warning,
        );
    }

    /** Filtre le corps sans perdre les coupures de page.
     *
     * `<!--nextpage-->` est ce qui fait qu'un article se lit en plusieurs
     * pages. Le passer à `wp_kses_post` avec le reste reviendrait à parier
     * sur son traitement des commentaires : on filtre chaque page
     * séparément et on recolle. */
    public static function clean_body($content) {
        $pages = explode(self::NEXT_PAGE, (string) $content);
        foreach ($pages as $index => $page) {
            $pages[$index] = wp_kses_post($page);
        }
        return implode(self::NEXT_PAGE, $pages);
    }

    /** L'image arrive en base64 : l'URL d'origine expire, et le site
     * WordPress n'a pas à aller la chercher lui-même. Un échec ici ne fait pas
     * échouer le dépôt — un article sans image reste publiable. */
    public static function attach_image($id, $image) {
        if (!is_array($image) || empty($image['data'])) { return null; }
        $type = isset($image['mimeType']) ? (string) $image['mimeType'] : '';
        if (!isset(self::IMAGE_TYPES[$type])) { return 'Type d’image non accepté : ' . $type; }
        $bytes = base64_decode((string) $image['data'], true);
        if ($bytes === false || $bytes === '') { return 'Image illisible.'; }
        if (strlen($bytes) > self::MAX_IMAGE_BYTES) { return 'Image trop volumineuse.'; }
        $name = sanitize_file_name(!empty($image['filename']) ? (string) $image['filename'] : 'image.' . self::IMAGE_TYPES[$type]);
        if (!preg_match('/\.' . preg_quote(self::IMAGE_TYPES[$type], '/') . '$/i', $name)) {
            $name .= '.' . self::IMAGE_TYPES[$type];
        }
        $upload = wp_upload_bits($name, null, $bytes);
        if (!empty($upload['error'])) { return 'Dépôt refusé : ' . $upload['error']; }
        $attachment = wp_insert_attachment(array(
            'post_mime_type' => $type,
            'post_title' => pathinfo($name, PATHINFO_FILENAME),
            'post_status' => 'inherit',
        ), $upload['file'], $id, true);
        if (is_wp_error($attachment)) { return 'Pièce jointe refusée.'; }
        // Chargée à la demande : la génération des tailles n'est pas
        // disponible hors de l'administration.
        if (!function_exists('wp_generate_attachment_metadata')) {
            require_once ABSPATH . 'wp-admin/includes/image.php';
        }
        wp_update_attachment_metadata($attachment, wp_generate_attachment_metadata($attachment, $upload['file']));
        set_post_thumbnail($id, $attachment);
        return null;
    }

    public static function menu() {
        add_options_page('Data FB Posting', 'Data FB Posting', 'manage_options', 'data-fb-posting', array(__CLASS__, 'page'));
    }

    public static function register() {
        register_setting('dfb_posting', self::OPTION, array('sanitize_callback' => array(__CLASS__, 'sanitize')));
    }

    public static function sanitize($input) {
        $old = get_option(self::OPTION, array());
        $endpoint = esc_url_raw(trim($input['endpoint'] ?? ''), array('https'));
        if (!$endpoint || wp_parse_url($endpoint, PHP_URL_SCHEME) !== 'https' || wp_parse_url($endpoint, PHP_URL_USER) || wp_parse_url($endpoint, PHP_URL_PASS)) {
            add_settings_error(self::OPTION, 'url', 'Une URL API HTTPS sans identifiants est requise.');
            return $old;
        }
        $key = sanitize_text_field($input['key'] ?? '');
        return array('endpoint' => $endpoint, 'key' => $key !== '' ? $key : ($old['key'] ?? ''));
    }

    public static function page() {
        if (!current_user_can('manage_options')) { return; }
        $settings = get_option(self::OPTION, array());
        ?>
        <div class="wrap"><h1>Data FB Posting</h1>
        <p>Chaque nouvel article public prépare un post pour tous les profils actifs. Modifier ensuite le titre, le contenu, l’extrait, le lien, la date ou l’image à la une met à jour les posts qui n’ont pas encore été publiés.</p>
        <form action="options.php" method="post">
            <?php settings_fields('dfb_posting'); ?>
            <table class="form-table"><tr><th><label for="dfb-url">URL de réception</label></th><td>
            <input class="regular-text" type="url" required id="dfb-url" name="dfb_posting_settings[endpoint]" value="<?php echo esc_attr($settings['endpoint'] ?? ''); ?>" placeholder="https://api.exemple.com/api/wordpress/articles">
            </td></tr><tr><th><label for="dfb-key">Clé WordPress</label></th><td>
            <input class="regular-text" type="password" autocomplete="new-password" id="dfb-key" name="dfb_posting_settings[key]" value="">
            <p class="description">Valeur WORDPRESS_API_KEY du serveur. Laisser vide pour conserver la clé enregistrée.</p>
            </td></tr></table><?php submit_button(); ?>
        </form><p>Les envois et les nouvelles tentatives utilisent WP-Cron. Leur état est visible dans la liste des articles, colonne Facebook.</p>
        </div>
        <?php
    }

    public static function columns($columns) { $columns['dfb_status'] = 'Facebook'; return $columns; }
    public static function status($column, $id) {
        if ($column !== 'dfb_status') { return; }
        $sent = get_post_meta($id, '_dfb_sent', true);
        $pending = get_post_meta($id, '_dfb_pending', true) || get_post_meta($id, '_dfb_snapshot', true);
        if ($pending) {
            echo esc_html(get_post_meta($id, '_dfb_error', true) ?: ($sent ? 'Mise à jour en attente' : 'En attente'));
            return;
        }
        echo $sent ? 'Transmis' : '—';
    }
}
DFB_Posting::boot();
