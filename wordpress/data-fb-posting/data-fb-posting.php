<?php
/**
 * Plugin Name: Data FB Posting
 * Description: Envoie les nouveaux articles publiés vers Data FB Posting pour préparer les posts Facebook.
 * Version: 1.0.0
 * Requires at least: 5.6
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) { exit; }

final class DFB_Posting {
    const OPTION = 'dfb_posting_settings';
    const HOOK = 'dfb_posting_deliver';

    public static function boot() {
        add_action('wp_after_insert_post', array(__CLASS__, 'published'), 10, 4);
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

    public static function published($id, $post, $update, $before) {
        if ($post->post_type !== 'post' || $post->post_status !== 'publish' || $post->post_password !== '' ||
            ($before && $before->post_status === 'publish') || wp_is_post_revision($id) ||
            get_post_meta($id, '_dfb_snapshot', true) || get_post_meta($id, '_dfb_sent', true)) { return; }
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
        // Snapshot preserved across retries: later article edits are never synchronized.
        if (!add_post_meta($id, '_dfb_snapshot', wp_slash($payload), true)) { return; }
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
        if (get_post_meta($id, '_dfb_sent', true)) { return; }
        $payload = get_post_meta($id, '_dfb_snapshot', true);
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
        update_post_meta($id, '_dfb_sent', current_time('mysql', true));
        delete_post_meta($id, '_dfb_error');
        wp_clear_scheduled_hook(self::HOOK, array($id));
    }

    public static function failed($id, $error) {
        $attempt = (int) get_post_meta($id, '_dfb_attempt', true) + 1;
        update_post_meta($id, '_dfb_attempt', $attempt);
        update_post_meta($id, '_dfb_error', $error);
        self::schedule($id, min(3600, 60 * pow(2, min($attempt - 1, 6))));
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
        <p>Chaque nouvel article public prépare un post pour tous les profils actifs. Les modifications ultérieures ne sont pas envoyées.</p>
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
        if (get_post_meta($id, '_dfb_sent', true)) { echo 'Transmis'; return; }
        if (!get_post_meta($id, '_dfb_snapshot', true)) { echo '—'; return; }
        echo esc_html(get_post_meta($id, '_dfb_error', true) ?: 'En attente');
    }
}
DFB_Posting::boot();
