"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isKnownLanguage = exports.languageName = exports.LANGUAGES = void 0;
exports.loadLanguages = loadLanguages;
exports.IsKnownLanguage = IsKnownLanguage;
const class_validator_1 = require("class-validator");
exports.LANGUAGES = {
    en: 'English', fr: 'French', ar: 'Arabic', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese',
    nl: 'Dutch', tr: 'Turkish', pl: 'Polish', ro: 'Romanian', ru: 'Russian', hi: 'Hindi', id: 'Indonesian',
};
const languageName = (code) => exports.LANGUAGES[code] ?? code;
exports.languageName = languageName;
const isKnownLanguage = (code) => typeof code === 'string' && Object.prototype.hasOwnProperty.call(exports.LANGUAGES, code);
exports.isKnownLanguage = isKnownLanguage;
function loadLanguages(rows) {
    for (const k of Object.keys(exports.LANGUAGES))
        delete exports.LANGUAGES[k];
    for (const r of rows)
        exports.LANGUAGES[r.code] = r.name;
}
function IsKnownLanguage(options) {
    return (object, propertyName) => (0, class_validator_1.registerDecorator)({
        name: 'isKnownLanguage',
        target: object.constructor,
        propertyName,
        options: { message: 'Langue inconnue : ajoutez-la dans Groupes → Gérer les langues', ...options },
        validator: { validate: (value) => (0, exports.isKnownLanguage)(value) },
    });
}
//# sourceMappingURL=languages.registry.js.map