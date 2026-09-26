<?php
// Standalone behavior tests using a minimal WordPress API double.
define('ABSPATH', __DIR__);
$GLOBALS['meta'] = $GLOBALS['events'] = $GLOBALS['options'] = array();
function add_action(...$args) {}
function add_filter(...$args) {}
function wp_is_post_revision($id) { return false; }
function get_post_meta($id, $key, $single) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function add_post_meta($id, $key, $value, $unique) {
    if (isset($GLOBALS['meta'][$id][$key])) { return false; }
    $GLOBALS['meta'][$id][$key] = $value; return true;
}
function update_post_meta($id, $key, $value) { $GLOBALS['meta'][$id][$key] = $value; }
function delete_post_meta($id, $key) { unset($GLOBALS['meta'][$id][$key]); }
function wp_slash($value) { return $value; }
function wp_strip_all_tags($s) { return strip_tags($s); }
function strip_shortcodes($s) { return $s; }
function esc_html($s) { return $s; }
function home_url() { return 'https://example.com/'; }
function untrailingslashit($s) { return rtrim($s, '/'); }
function get_bloginfo($s) { return 'Site'; }
function get_permalink($id) { return 'https://example.com/article'; }
function get_post_time(...$args) { return '2026-09-20T10:00:00+00:00'; }
function get_the_post_thumbnail_url(...$args) { return $GLOBALS['thumbnail'] ?? 'https://example.com/image.jpg'; }
function wp_next_scheduled($hook, $args) { return $GLOBALS['events'][$args[0]] ?? false; }
function wp_schedule_single_event($time, $hook, $args, $error) { $GLOBALS['events'][$args[0]] = $time; return true; }
function wp_clear_scheduled_hook($hook, $args) { unset($GLOBALS['events'][$args[0]]); }
function is_wp_error($v) { return $v instanceof Exception; }
function get_post($id) { return $GLOBALS['post']; }
function get_option($name, $default) { return $GLOBALS['options'][$name] ?? $default; }
function wp_json_encode($v) { return json_encode($v); }
function wp_remote_post($url, $args) {
    $GLOBALS['request'] = $args;
    // Permet de simuler une modification enregistrée pendant l'appel HTTP.
    if (isset($GLOBALS['during'])) { call_user_func($GLOBALS['during']); }
    return $GLOBALS['response'];
}
function wp_remote_retrieve_response_code($v) { return $v['code']; }
function wp_remote_retrieve_body($v) { return $v['body']; }
function current_time(...$args) { return '2026-09-20 10:00:00'; }
require dirname(__DIR__) . '/data-fb-posting/data-fb-posting.php';
function check($value, $message) { if (!$value) { throw new Exception($message); } echo "PASS: $message\n"; }
function sent_body() { return json_decode($GLOBALS['request']['body'], true); }
function published() { return (object) array('post_status' => 'publish'); }
function rendered($id) { ob_start(); DFB_Posting::status('dfb_status', $id); return ob_get_clean(); }

$post = (object) array('post_type' => 'post', 'post_status' => 'draft', 'post_password' => '', 'post_title' => 'Titre', 'post_content' => 'Contenu original', 'post_excerpt' => '');
$GLOBALS['post'] = $post;
DFB_Posting::saved(42, $post, true, null);
check(empty($GLOBALS['events']), 'Drafts do not trigger delivery');
$post->post_status = 'publish';
DFB_Posting::saved(42, $post, true, (object) array('post_status' => 'future'));
check(isset($GLOBALS['events'][42]), 'Scheduled publication queues delivery');
$post->post_content = 'Contenu corrigé';
DFB_Posting::saved(42, $post, true, published());
check(get_post_meta(42, '_dfb_pending', true)['content'] === 'Contenu corrigé', 'An edit before delivery replaces the queued payload');
unset($GLOBALS['events'][42]); // WP-Cron removes the current event before executing it.
DFB_Posting::deliver(42);
check(isset($GLOBALS['events'][42]) && !get_post_meta(42, '_dfb_sent', true), 'Missing configuration retries');
$GLOBALS['options'][DFB_Posting::OPTION] = array('endpoint' => 'https://api.example.com/api/wordpress/articles', 'key' => 'test');
$GLOBALS['response'] = new Exception('timeout');
unset($GLOBALS['events'][42]); DFB_Posting::deliver(42);
check(isset($GLOBALS['events'][42]) && !get_post_meta(42, '_dfb_sent', true), 'Network failure retries');
$GLOBALS['response'] = array('code' => 401, 'body' => '{}');
unset($GLOBALS['events'][42]); DFB_Posting::deliver(42);
check(isset($GLOBALS['events'][42]) && !get_post_meta(42, '_dfb_sent', true), 'Authentication failure remains pending');
$GLOBALS['response'] = array('code' => 200, 'body' => '<html>Wrong endpoint</html>');
unset($GLOBALS['events'][42]); DFB_Posting::deliver(42);
check(!get_post_meta(42, '_dfb_sent', true), 'Invalid success response is not acknowledged');
check(rendered(42) === 'Réponse API invalide (HTTP 200). Vérifier URL et clé.', 'The articles list shows the last error');
$post->post_status = 'private'; unset($GLOBALS['request']);
unset($GLOBALS['events'][42]); DFB_Posting::deliver(42);
check(!isset($GLOBALS['request']), 'Withdrawn articles are not sent');
$post->post_status = 'publish';
$GLOBALS['response'] = array('code' => 201, 'body' => '{"articleId":"a1","duplicate":false}');
unset($GLOBALS['events'][42]); DFB_Posting::deliver(42);
check((bool) get_post_meta(42, '_dfb_sent', true) && empty($GLOBALS['events']), 'Successful delivery completes and clears the queue');
check(!get_post_meta(42, '_dfb_pending', true) && rendered(42) === 'Transmis', 'Nothing stays pending after delivery');
check(sent_body()['content'] === 'Contenu corrigé', 'Retries send the last saved version');
check($GLOBALS['request']['redirection'] === 0, 'API key is never forwarded through redirects');
unset($GLOBALS['request']); DFB_Posting::deliver(42);
check(!isset($GLOBALS['request']), 'Delivered articles are never sent again');

// Synchronisation des modifications.
DFB_Posting::saved(42, $post, true, published());
check(empty($GLOBALS['events']) && !get_post_meta(42, '_dfb_pending', true), 'Saving without editorial change sends nothing');
$post->post_title = 'Titre corrigé';
DFB_Posting::saved(42, $post, true, published());
check(isset($GLOBALS['events'][42]) && rendered(42) === 'Mise à jour en attente', 'Editing a delivered article queues a synchronization');
unset($GLOBALS['events'][42]); unset($GLOBALS['request']); DFB_Posting::deliver(42);
check(sent_body()['title'] === 'Titre corrigé' && !get_post_meta(42, '_dfb_pending', true), 'Synchronization sends the new title');
$GLOBALS['thumbnail'] = 'https://example.com/autre-image.jpg';
DFB_Posting::saved(42, $post, true, published());
unset($GLOBALS['events'][42]); unset($GLOBALS['request']); DFB_Posting::deliver(42);
check(sent_body()['imageUrl'] === 'https://example.com/autre-image.jpg', 'A new featured image is synchronized');
$GLOBALS['during'] = function () use ($post) {
    $post->post_content = 'Contenu de dernière minute';
    DFB_Posting::saved(42, $post, true, published());
};
$post->post_excerpt = 'Extrait';
DFB_Posting::saved(42, $post, true, published());
unset($GLOBALS['events'][42]); DFB_Posting::deliver(42);
unset($GLOBALS['during']);
check(isset($GLOBALS['events'][42]) && get_post_meta(42, '_dfb_pending', true)['content'] === 'Contenu de dernière minute', 'A change saved during delivery stays queued');
unset($GLOBALS['events'][42]); DFB_Posting::deliver(42);
check(sent_body()['content'] === 'Contenu de dernière minute' && !get_post_meta(42, '_dfb_pending', true), 'The queued change is delivered next');

// Articles antérieurs à l'installation, puis reprise de la version précédente.
$old = (object) array('post_type' => 'post', 'post_status' => 'publish', 'post_password' => '', 'post_title' => 'Ancien', 'post_content' => 'Ancien contenu', 'post_excerpt' => '');
DFB_Posting::saved(7, $old, true, published());
check(!get_post_meta(7, '_dfb_pending', true) && rendered(7) === '—', 'Already published articles are never imported retroactively');
$GLOBALS['meta'][9] = array('_dfb_snapshot' => DFB_Posting::payload(9, $old), '_dfb_sent' => '2026-09-19 10:00:00');
DFB_Posting::saved(9, $old, true, published());
check(!get_post_meta(9, '_dfb_snapshot', true) && !get_post_meta(9, '_dfb_pending', true), 'Articles sent by the previous version are adopted without a redundant delivery');
$old->post_title = 'Ancien corrigé';
DFB_Posting::saved(9, $old, true, published());
check(get_post_meta(9, '_dfb_pending', true)['title'] === 'Ancien corrigé', 'Adopted articles synchronize their later edits');
