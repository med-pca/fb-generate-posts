/* Les profils n'ont pas tous Facebook en français ou en anglais. Un libellé
 * arabe s'écrit avec des voyelles (« اكتب شيئًا ») que le motif n'avait pas :
 * le composeur n'était jamais trouvé, et la publication ne démarrait pas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScript } from './helpers.mjs';

const scope = await loadContentScript('../src/content/helpers.js');
const D = scope.FBX.dom;

test('arabe : le composeur est reconnu malgré les voyelles et les points de suspension', () => {
  assert.ok(D.COMPOSER_ENTRY.test('اكتب شيئًا...'));
  assert.ok(D.COMPOSER_ENTRY.test('اكتب شيئاً…'));
  assert.ok(D.COMPOSER_ENTRY.test('بمَ تفكر؟'));
});

test('arabe : publier, commenter, créer un post, en attente', () => {
  assert.ok(D.SUBMIT_LABELS.includes('نشر'));
  assert.ok(D.SUBMIT_LABELS.test('انشر'));
  assert.ok(!D.SUBMIT_LABELS.test('منشورات'), 'un mot qui contient « نشر » n’est pas le bouton');
  assert.ok(D.COMMENT_BUTTON_LABELS.includes('اكتب تعليقًا'));
  assert.ok(D.COMMENT_FIELD.test('اكتب تعليقًا علنيًا…'));
  assert.ok(D.CREATE_POST.test('إنشاء منشور'));
  assert.ok(D.PENDING.test('منشورك قيد المراجعة'));
  assert.ok(D.EDIT_ITEM.test('تعديل'));
  assert.ok(D.PHOTO_LABELS.includes('صورة/فيديو'));
});

test('accents et autres langues', () => {
  assert.ok(D.COMPOSER_ENTRY.test('Écrivez quelque chose...'));
  assert.ok(D.COMPOSER_ENTRY.test('Ecrivez quelque chose...'));
  assert.ok(D.COMPOSER_ENTRY.test('Escribe algo...'));
  assert.ok(D.SUBMIT_LABELS.test('Publicar'));
  assert.ok(D.SUBMIT_LABELS.test('Paylaş'));
  assert.ok(D.CREATE_POST.test('Crear publicación'));
  assert.ok(D.EDIT_ITEM.test('Editar'));
});

test('le nom du compte se lit aussi dans « التعليق باسم … »', () => {
  assert.equal(D.authorFromLabel('Comment as Salim Bennani'), 'salim bennani');
  assert.equal(D.authorFromLabel('Commenter en tant que Hélène'), 'helene');
  assert.equal(D.authorFromLabel('التعليق باسم رحاب نكوس'), 'رحاب نكوس');
  assert.equal(D.authorFromLabel('Write a comment'), '');
});
