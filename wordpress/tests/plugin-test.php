<?php
// Standalone behavior tests using a minimal WordPress API double.
define('ABSPATH', __DIR__);
$GLOBALS['meta'] = $GLOBALS['events'] = $GLOBALS['options'] = array();
$GLOBALS['routes'] = $GLOBALS['posts'] = $GLOBALS['thumbnails'] = array();
$GLOBALS['next_id'] = 100;
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
function is_wp_error($v) { return $v instanceof WP_Error || $v instanceof Exception; }
class WP_Error { public $code; public $message; public $data;
    public function __construct($code = '', $message = '', $data = array()) { $this->code = $code; $this->message = $message; $this->data = $data; } }
class DFB_Request { private $body; private $headers;
    public function __construct($body, $headers = array()) { $this->body = $body; $this->headers = $headers; }
    public function get_json_params() { return $this->body; }
    public function get_header($name) { return $this->headers[$name] ?? ''; } }
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
function register_rest_route($ns, $route, $args) { $GLOBALS['routes'][$ns . $route] = $args; }
function wp_unslash($v) { return $v; }
function sanitize_text_field($s) { return trim(strip_tags((string) $s)); }
function sanitize_title($s) { return strtolower(preg_replace('/[^a-z0-9]+/i', '-', (string) $s)); }
function sanitize_file_name($s) { return preg_replace('/[^A-Za-z0-9._-]/', '', (string) $s); }
function wp_kses_post($s) { return preg_replace('#<script\b[^>]*>.*?</script>#is', '', (string) $s); }
function wp_insert_post($data, $error = false) {
    $id = $GLOBALS['next_id']++;
    $GLOBALS['posts'][$id] = $data;
    foreach (($data['meta_input'] ?? array()) as $key => $value) { update_post_meta($id, $key, $value); }
    return $id;
}
function wp_update_post($data, $error = false) {
    $id = $data['ID'];
    $GLOBALS['posts'][$id] = array_merge($GLOBALS['posts'][$id], $data);
    return $id;
}
function wp_upload_bits($name, $_deprecated, $bytes) {
    $GLOBALS['uploaded'] = array('name' => $name, 'size' => strlen($bytes));
    return array('file' => '/tmp/' . $name, 'error' => false);
}
function wp_insert_attachment($data, $file, $parent, $error = false) { $GLOBALS['attachment'] = $data; return 900; }
function wp_generate_attachment_metadata($id, $file) { return array(); }
function wp_update_attachment_metadata($id, $meta) {}
function set_post_thumbnail($id, $attachment) { $GLOBALS['thumbnails'][$id] = $attachment; }
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


// ---------------------------------------------------------------------------
// Réception : l'API dépose un article réécrit.
// ---------------------------------------------------------------------------
$GLOBALS['options'][DFB_Posting::OPTION] = array('endpoint' => 'https://api.example.com/api/wordpress/articles', 'key' => 'secret');
DFB_Posting::routes();
check(isset($GLOBALS['routes']['dfb/v1/articles']), 'The inbound route is registered');

$deposit = function ($body, $key = 'secret') { return array(
    'auth' => DFB_Posting::authorized(new DFB_Request($body, array('x-api-key' => $key))),
    'body' => $body); };

$refused = $deposit(array('title' => 'T', 'contentHtml' => '<p>x</p>'), 'mauvaise');
check($refused['auth'] instanceof WP_Error, 'A wrong key is refused');
check(DFB_Posting::authorized(new DFB_Request(array(), array())) instanceof WP_Error, 'A missing key is refused');
$GLOBALS['options'][DFB_Posting::OPTION]['key'] = '';
check(DFB_Posting::authorized(new DFB_Request(array(), array('x-api-key' => ''))) instanceof WP_Error, 'An unconfigured site accepts nothing');
$GLOBALS['options'][DFB_Posting::OPTION]['key'] = 'secret';
check(DFB_Posting::authorized(new DFB_Request(array(), array('x-api-key' => 'secret'))) === true, 'The right key is accepted');

check(DFB_Posting::receive(new DFB_Request(array('title' => '', 'contentHtml' => '<p>x</p>'))) instanceof WP_Error, 'A deposit without a title is refused');
check(DFB_Posting::receive(new DFB_Request(array('title' => 'T', 'contentHtml' => '   '))) instanceof WP_Error, 'A deposit without a body is refused');

$png = base64_encode(hex2bin('89504e470d0a1a0a'));
$result = DFB_Posting::receive(new DFB_Request(array(
    'title' => 'Le couscous réécrit',
    'slug' => 'Le Couscous Réécrit',
    'excerpt' => 'Un extrait',
    'contentHtml' => '<h2>Origines</h2><p>Semoule.</p><script>vol()</script>',
    'ingestRef' => 'ing_42',
    'image' => array('data' => $png, 'mimeType' => 'image/png', 'filename' => 'couscous'),
)));
$new = (int) $result['postId'];
check(strpos($GLOBALS['posts'][$new]['post_content'], '<script') === false, 'The deposited body is filtered by wp_kses_post');
check($GLOBALS['posts'][$new]['post_status'] === 'publish', 'The deposit ends up published');
check(get_post_meta($new, DFB_Posting::INGEST_META, true) === 'ing_42', 'The ingest reference is stored');
check($GLOBALS['uploaded']['name'] === 'couscous.png', 'The image is stored with its extension');
check(($GLOBALS['thumbnails'][$new] ?? 0) === 900, 'The image becomes the featured image');

// La référence doit accompagner le renvoi : c'est elle qui permet à l'API de
// rattacher l'article à sa reprise. Elle est posée avant la mise en ligne.
check(DFB_Posting::payload($new, (object) array('post_title' => 'T', 'post_content' => 'C', 'post_excerpt' => ''))['ingestRef'] === 'ing_42', 'The delivered payload carries the ingest reference');

// Le piège : ajouter le champ sans condition changerait l'empreinte de tous
// les articles déjà suivis et relancerait un envoi du catalogue entier.
$plain = DFB_Posting::payload(42, $post);
check(!array_key_exists('ingestRef', $plain), 'An article without a reference keeps an unchanged payload');
check(DFB_Posting::hash($plain) === get_post_meta(42, '_dfb_hash', true), 'Adding the field does not change the fingerprint of already tracked articles');

check(DFB_Posting::attach_image(1, array('data' => $png, 'mimeType' => 'application/pdf')) !== null, 'A non-image type is refused');
check(DFB_Posting::attach_image(1, array('data' => base64_encode(str_repeat('x', 11000000)), 'mimeType' => 'image/png')) !== null, 'An oversized image is refused');
check(DFB_Posting::attach_image(1, null) === null, 'A deposit without an image passes');


// Beaucoup de sites ferment toute l'API REST : ce verrou s'applique avant le
// `permission_callback`, donc avant toute vérification de notre clé.
$locked = new WP_Error('rest_login_required', 'REST API restricted to authenticated users.');
$GLOBALS['options'][DFB_Posting::OPTION]['key'] = 'secret';
$_SERVER['REQUEST_URI'] = '/wp-json/dfb/v1/articles';

$_SERVER['HTTP_X_API_KEY'] = 'secret';
check(DFB_Posting::unlock($locked) === true, 'A global REST lockdown is lifted for our route with the right key');
$_SERVER['HTTP_X_API_KEY'] = 'mauvaise';
check(DFB_Posting::unlock($locked) === $locked, 'The lockdown stays in place with a wrong key');
unset($_SERVER['HTTP_X_API_KEY']);
check(DFB_Posting::unlock($locked) === $locked, 'The lockdown stays in place without a key');

// Rouvrir tout le reste de l'API REST serait une régression de sécurité du
// site, pas une correction.
$_SERVER['REQUEST_URI'] = '/wp-json/wp/v2/users';
$_SERVER['HTTP_X_API_KEY'] = 'secret';
check(DFB_Posting::unlock($locked) === $locked, 'Other REST routes stay locked even with the key');

// Un site qui ne verrouille rien ne doit pas voir son état modifié.
$_SERVER['REQUEST_URI'] = '/wp-json/dfb/v1/articles';
check(DFB_Posting::unlock(null) === null, 'A site without a lockdown is left untouched');
check(DFB_Posting::unlock(true) === true, 'An already authenticated request is left untouched');


// La route de diagnostic doit franchir le même verrou que le dépôt.
$_SERVER['REQUEST_URI'] = '/wp-json/dfb/v1/status';
$_SERVER['HTTP_X_API_KEY'] = 'secret';
check(DFB_Posting::unlock($locked) === true, 'The status route is unlocked too');
check(DFB_Posting::status_route()['version'] === '1.2.2', 'The status route reports the version');
check(isset($GLOBALS['routes']['dfb/v1/status']), 'The status route is registered');
