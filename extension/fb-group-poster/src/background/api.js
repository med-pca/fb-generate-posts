/* Client for the data-fb-posting job API. Port of app/jobs/client.py.
 *
 * The extension is one worker among possibly several: it reserves a batch of
 * posts for one profile, publishes them, and confirms each one. A confirmation
 * is what stops a post from being handed to another worker, so each one is sent
 * as soon as that post is decided -- never batched to the end of the run, which
 * can last hours.
 *
 *     POST {base}/jobs/claim/profile/{profileExternalId}[?groupExternalId=...]
 *     POST {base}/jobs/{jobId}/posts/{postId}/consumed
 *     POST {base}/jobs/{jobId}/posts/{postId}/published
 *     POST {base}/jobs/{jobId}/posts/{postId}/failed
 *     POST {base}/jobs/{jobId}/posts/{postId}/commented
 *     POST {base}/jobs/{jobId}/complete
 *     GET  {base}/jobs/link-updates[?profileExternalId=...]
 *     GET  {base}/jobs/{jobId}/link-updates
 *     POST {base}/jobs/{jobId}/posts/{postId}/link-updated
 */

export class ApiError extends Error {}

/* The reservation expired and was taken over by another worker.
 * Critical: the post may well be live on Facebook even though the API refuses
 * to record it. Never republish after this -- it would post twice. */
export class ClaimLostError extends ApiError {}

const TIMEOUT_MS = 30000;

export class JobApi {
  constructor(baseUrl, apiKey, timeoutMs = TIMEOUT_MS) {
    if (!apiKey) throw new ApiError("Aucune cle d'API : renseigne-la dans les options");
    this.base = String(baseUrl || '').replace(/\/+$/, '');
    this.key = apiKey;
    this.timeout = timeoutMs;
  }

  async claim(profileExternalId, groupExternalId = '') {
    const query = groupExternalId ? `?groupExternalId=${encodeURIComponent(groupExternalId)}` : '';
    const payload = await this.request('POST', `/jobs/claim/profile/${encodeURIComponent(profileExternalId)}${query}`);
    return toJob(payload);
  }

  /* The post's image, fetched by the platform: the fallback when the site
   * refuses to give it to the extension directly. Returns the raw Response. */
  async media(imageUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await fetch(`${this.base}/jobs/media?url=${encodeURIComponent(imageUrl)}`, {
        headers: { 'X-API-Key': this.key },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /* Hand back a job nobody is working on any more: its untouched posts
   * return to the queue, and the profile may claim again. */
  release(jobId) {
    return this.request('POST', `/jobs/${jobId}/release`);
  }

  /* Take the post out of circulation, before trying to publish it. */
  markConsumed(jobId, postId) {
    return this.request('POST', `/jobs/${jobId}/posts/${postId}/consumed`);
  }

  markPublished(jobId, postId, permalink = '') {
    return this.request('POST', `/jobs/${jobId}/posts/${postId}/published`, permalink ? { externalPostUrl: permalink } : {});
  }

  /* `requeue` : rien n'est parti sur Facebook -- la plateforme remet le post
   * dans la file elle-même (au plus 3 fois, vers un autre profil si possible). */
  markFailed(jobId, postId, reason, { requeue = false, blocked = false } = {}) {
    // The API requires a non-empty reason.
    return this.request('POST', `/jobs/${jobId}/posts/${postId}/failed`, {
      error: String(reason || 'unknown error').slice(0, 1000),
      ...(requeue ? { requeue: true } : {}),
      ...(blocked ? { blocked: true } : {}),
    });
  }

  /* Record the comment that was written, by its own identifier. Without it the
   * comment can never be found again to receive the link. */
  markCommented(jobId, postId, commentExternalId) {
    return this.request('POST', `/jobs/${jobId}/posts/${postId}/commented`, { commentExternalId: String(commentExternalId).slice(0, 512) });
  }

  /* Close the job. Every post must already be published or failed. */
  complete(jobId) {
    return this.request('POST', `/jobs/${jobId}/complete`);
  }

  markLinkUpdated(jobId, postId) {
    return this.request('POST', `/jobs/${jobId}/posts/${postId}/link-updated`);
  }

  async jobLinkUpdates(jobId) {
    return toUpdates(await this.request('GET', `/jobs/${jobId}/link-updates`));
  }

  /* Comments whose job is closed and which still await their URL.
   *
   * The queue groups updates by job and omits externalPostUrl. The job detail
   * carries that URL; join by post AND comment, never list order. */
  async pendingLinkUpdates(profileExternalId = '', limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (profileExternalId) params.set('profileExternalId', profileExternalId);
    const updates = toUpdates(await this.request('GET', `/jobs/link-updates?${params}`));
    const details = new Map();
    const resolved = [];
    for (let update of updates) {
      if (!update.externalPostUrl) {
        if (!update.jobId || !update.postId) {
          throw new ApiError('Un lien en attente n’a ni job ni post');
        }
        if (!details.has(update.jobId)) {
          const rows = await this.jobLinkUpdates(update.jobId);
          details.set(update.jobId, new Map(rows.map((r) => [`${r.postId}|${r.commentExternalId}`, r])));
        }
        const detail = details.get(update.jobId).get(`${update.postId}|${update.commentExternalId}`);
        if (!detail || !detail.externalPostUrl) {
          throw new ApiError(
            `Le commentaire ${update.commentExternalId} du post ${update.postId} n'a pas d'URL Facebook dans le job ${update.jobId}`,
          );
        }
        update = { ...update, externalPostUrl: detail.externalPostUrl };
      }
      resolved.push(update);
    }
    return resolved;
  }

  /* -- Le pilotage : ce que l'admin veut de ce profil -------------------
   *
   * L'ordre voyage dans ce sens parce qu'il ne peut pas voyager dans l'autre :
   * un navigateur n'a pas d'adresse joignable depuis l'API.
   */

  /* L'ordre seul, sans rien rapporter. */
  control(profileExternalId) {
    return this.request('GET', `/control/profile/${encodeURIComponent(profileExternalId)}`);
  }

  /* Le battement : rapporter et recevoir l'ordre en un aller-retour. */
  heartbeat(profileExternalId, state) {
    return this.request(
      'POST',
      `/control/profile/${encodeURIComponent(profileExternalId)}/heartbeat`,
      state,
    );
  }

  /* Active profiles the automation may work on. null when the API has no
   * automation-facing route for it. */
  async listProfiles() {
    let payload;
    try {
      payload = await this.request('GET', '/jobs/profiles');
    } catch (err) {
      return null;
    }
    const rows = Array.isArray(payload) ? payload : payload && payload.data;
    if (!Array.isArray(rows)) return null;
    return rows
      .filter((row) => row && row.externalId)
      .map((row) => ({ externalId: String(row.externalId), name: String(row.name || ''), id: String(row.id || '') }));
  }

  /* Record an event in the API's activity log. Never throws: losing a log line
   * must not take the run down. */
  async log(eventType, message, options = {}) {
    const body = {
      eventType: String(eventType).slice(0, 60),
      level: options.level || 'INFO',
      message: String(message || eventType).slice(0, 1000),
    };
    for (const [key, value] of Object.entries({
      profileId: options.profileId,
      groupId: options.groupId,
      postId: options.postId,
      jobId: options.jobId,
      facebookUrl: options.facebookUrl,
    })) {
      if (value) body[key] = value;
    }
    if (options.metadata) body.metadata = options.metadata;
    try {
      await this.request('POST', '/logs', body);
    } catch (err) {
      console.warn('[fbx] the API refused the log line:', err.message);
    }
  }

  async request(method, path, body = null) {
    const url = `${this.base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'X-API-Key': this.key,
          ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        },
        // A GET carries no body; the POST routes expect at least {}.
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ApiError(`L'API n'a pas repondu en ${this.timeout / 1000}s : ${method} ${path}`);
      }
      throw new ApiError(`API injoignable sur ${this.base} (${err.message}). Verifie l'adresse et l'autorisation d'acces.`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 409) {
      throw new ClaimLostError(`${await messageOf(response)} (la reservation a ete reprise - ne republie pas ce post)`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError("L'API a refuse la cle (X-API-Key)");
    }
    if (!response.ok) {
      throw new ApiError(`L'API a repondu HTTP ${response.status} sur ${method} ${path} : ${await messageOf(response)}`);
    }
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }
}

async function messageOf(response) {
  const text = await response.text().catch(() => '');
  try {
    const payload = JSON.parse(text);
    const message = payload.message || payload.error;
    if (Array.isArray(message)) return message.join('; ');
    if (message) return String(message);
  } catch (_) { /* not json */ }
  return text.slice(0, 300);
}

/* Two shapes come back: {"jobId": ...} with posts, or {"job": null, "posts":
 * []} when the pool is empty. A third says the profile still holds a job. */
function toJob(payload) {
  if (!payload || typeof payload !== 'object') return { kind: 'empty', message: 'no post available' };
  const rawPosts = payload.posts || [];
  const jobId = payload.jobId;
  const active = payload.activeJobId;
  if (!jobId && active) {
    return { kind: 'busy', jobId: String(active), message: String(payload.message || `busy with job ${active}`) };
  }
  if (!jobId || !rawPosts.length) {
    // L'API dit POURQUOI il n'y a rien : groupes non rejoints, posts réservés
    // à un autre compte... On le garde pour le journal.
    return {
      kind: 'empty',
      message: String(payload.message || 'no post available for this profile'),
      reason: String(payload.reason || ''),
      diagnosis: payload.diagnosis && typeof payload.diagnosis === 'object' ? payload.diagnosis : null,
    };
  }
  const group = payload.group || {};
  const posts = rawPosts.map(toPost);
  if (posts.some((p) => !p.id)) throw new ApiError("L'API a renvoye un post sans id");
  return {
    kind: 'job',
    jobId: String(jobId),
    groupExternalId: String(group.externalId || ''),
    groupName: String(group.name || ''),
    groupUrl: String(group.url || ''),
    posts,
    claimExpiresAt: parseTimestamp(payload.claimExpiresAt),
  };
}

function toPost(post) {
  const comment = post.comment && typeof post.comment === 'object' ? post.comment : {};
  const description = String(post.description || '');
  return {
    id: String(post.id || ''),
    title: String(post.title || ''),
    description,
    imageUrl: String(post.image || ''),
    // The API stores minutes (@Max(1440) = 24h), not seconds.
    delayMinutes: Number(post.delay || 0),
    // Older deployments sent no comment block; the description is what that
    // comment always carried.
    commentText: String(comment.text || description),
    willReceiveLink: Boolean(comment.willReceiveLink),
  };
}

function toUpdates(payload) {
  const rows = [];
  const walk = (value, jobId = '') => {
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, jobId));
    } else if (value && typeof value === 'object') {
      const inherited = String(value.jobId || jobId);
      if ('updates' in value) {
        const completedAt = parseTimestamp(value.completedAt);
        const before = rows.length;
        walk(value.updates, inherited);
        for (let i = before; i < rows.length; i += 1) {
          if (!rows[i].completedAt) rows[i].completedAt = completedAt;
        }
      }
      else if ('data' in value || 'items' in value) walk(value.data || value.items || [], inherited);
      else rows.push({ ...value, jobId: inherited });
    }
  };
  walk(payload);
  return rows
    .filter((row) => row.url && row.commentExternalId)
    .map((row) => ({
      jobId: String(row.jobId || ''),
      postId: String(row.postId || ''),
      commentExternalId: String(row.commentExternalId),
      url: String(row.url),
      title: String(row.title || ''),
      externalPostUrl: String(row.externalPostUrl || ''),
      completedAt: typeof row.completedAt === 'number' ? row.completedAt : parseTimestamp(row.completedAt) || 0,
    }));
}

function parseTimestamp(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : at;
}
