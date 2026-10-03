/* La page de connexion. Le mot de passe part au serveur, qui répond par un
 * cookie de session HttpOnly : aucun jeton ne passe par ce script ni par le
 * stockage du navigateur. */
(() => {
  const form = document.getElementById('login-form');
  const error = document.getElementById('error');
  const submit = document.getElementById('submit');
  const password = document.getElementById('password');
  const reveal = document.getElementById('reveal');

  // Le retour après connexion : une page de la plateforme seulement.
  const next = (() => {
    const raw = new URLSearchParams(location.search).get('next') || '/';
    return raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
  })();

  const show = (message) => {
    error.textContent = message;
    error.hidden = !message;
  };

  reveal.addEventListener('click', () => {
    const visible = password.type === 'text';
    password.type = visible ? 'password' : 'text';
    reveal.textContent = visible ? 'Afficher' : 'Masquer';
    reveal.setAttribute('aria-pressed', String(!visible));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    show('');
    const username = form.username.value.trim();
    if (!username || password.value.length < 8) {
      show('Saisissez votre identifiant et votre mot de passe (8 caractères au moins).');
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Connexion…';
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'PostFlow' },
        body: JSON.stringify({ username, password: password.value }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        show(
          (Array.isArray(body.message) ? body.message.join(', ') : body.message) ||
            (response.status === 429 ? 'Trop de tentatives, réessayez plus tard.' : 'Connexion impossible.'),
        );
        password.value = '';
        password.focus();
        return;
      }
      location.replace(next);
    } catch {
      show('Serveur injoignable. Vérifiez votre connexion.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Se connecter';
    }
  });

  if (new URLSearchParams(location.search).get('expired')) show('Votre session a expiré : reconnectez-vous.');
  form.username.focus();
})();
