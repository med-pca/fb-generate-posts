#!/usr/bin/env python3
"""Agent local PostFlow : ouvre les navigateurs NSTBrowser sur ordre de la plateforme.

Pourquoi il existe : l'API de NSTBrowser n'écoute que sur cet ordinateur
(localhost:8848). La plateforme, sur Internet, ne peut donc pas ouvrir un
profil elle-même : l'agent lui demande chaque minute « lesquels ouvrir ? »,
puis le fait ici. Il synchronise aussi les profils NSTBrowser (nouveaux
profils, changements de nom) avec la plateforme.

Rien à installer en plus de Python 3 : ce fichier n'utilise que la
bibliothèque standard. La configuration (adresse et clé du compte) est dans
agent.config.json, rempli par la plateforme au téléchargement.

    python3 postflow_agent.py            # tourne jusqu'à Ctrl+C
    python3 postflow_agent.py --once     # un seul tour, pour vérifier
    python3 postflow_agent.py --check    # diagnostic : plateforme, NSTBrowser, profils
"""

from __future__ import annotations

import argparse
import json
import logging
import logging.handlers
import os
import platform
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional

AGENT_VERSION = "1.0.0"
HERE = Path(__file__).resolve().parent
CONFIG_FILE = HERE / "agent.config.json"
LOG_FILE = HERE / "agent.log"
# Un seul agent par ordinateur : deux agents ouvriraient deux fois les mêmes
# navigateurs. Ce port local sert de verrou.
LOCK_PORT = 48557

RUNNING, STOPPED, STARTING, ERROR = "RUNNING", "STOPPED", "STARTING", "ERROR"

log = logging.getLogger("postflow-agent")


# ── Configuration ──────────────────────────────────────────────────────────


class ConfigError(RuntimeError):
    pass


def load_config() -> dict[str, Any]:
    """agent.config.json, puis les variables d'environnement POSTFLOW_*."""
    cfg: dict[str, Any] = {
        "apiBaseUrl": "",
        "apiKey": "",
        "nstApiAddress": "http://localhost:8848/api/v2",
        "nstApiKey": "",
        "maxBrowsers": 0,
        "closeBrowsers": False,
        "syncEverySeconds": 600,
    }
    if CONFIG_FILE.exists():
        try:
            cfg.update(json.loads(CONFIG_FILE.read_text(encoding="utf-8")))
        except ValueError as exc:
            raise ConfigError(f"{CONFIG_FILE.name} illisible : {exc}") from exc
    for key, env in (("apiBaseUrl", "POSTFLOW_API_BASE_URL"), ("apiKey", "POSTFLOW_API_KEY"), ("nstApiKey", "POSTFLOW_NST_API_KEY")):
        if os.environ.get(env):
            cfg[key] = os.environ[env].strip()
    cfg["apiBaseUrl"] = str(cfg.get("apiBaseUrl") or "").rstrip("/")
    if not cfg["apiBaseUrl"]:
        raise ConfigError("adresse de la plateforme absente (apiBaseUrl dans agent.config.json)")
    if not cfg.get("apiKey"):
        raise ConfigError(
            "clé de la plateforme absente : retéléchargez l'agent depuis la page Extensions "
            "en choisissant « préconfiguré avec ma clé »"
        )
    return cfg


# ── HTTP (bibliothèque standard) ───────────────────────────────────────────


class HttpError(RuntimeError):
    def __init__(self, message: str, status: int = 0) -> None:
        super().__init__(message)
        self.status = status


def http(method: str, url: str, headers: dict[str, str], body: Any = None, timeout: float = 30.0) -> Any:
    data = None
    headers = {"accept": "application/json", "user-agent": f"PostFlowAgent/{AGENT_VERSION}", **headers}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["content-type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8") or "null"
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise HttpError(f"HTTP {exc.code} sur {method.upper()} {url} : {detail}", exc.code) from exc
    except (urllib.error.URLError, socket.timeout, OSError) as exc:
        raise HttpError(f"{method.upper()} {url} injoignable : {getattr(exc, 'reason', exc)}") from exc
    try:
        return json.loads(raw)
    except ValueError:
        return None


# ── La plateforme ─────────────────────────────────────────────────────────


class Platform:
    def __init__(self, base: str, key: str) -> None:
        self.base = base
        self.key = key

    def _call(self, method: str, path: str, body: Any = None) -> Any:
        try:
            return http(method, f"{self.base}{path}", {"X-API-Key": self.key}, body)
        except HttpError as exc:
            if exc.status in (401, 403):
                raise HttpError("la plateforme refuse la clé : retéléchargez l'agent préconfiguré (page Extensions)", exc.status) from exc
            raise

    def plan(self, profiles_seen: int) -> dict[str, Any]:
        """Quoi ouvrir, quoi fermer — et se signaler : la plateforme montre
        dans le Pilotage quels agents tournent, sur quelles machines."""
        query = urllib.parse.urlencode(
            {"agent": socket.gethostname()[:80], "version": AGENT_VERSION, "os": platform.system(), "running": profiles_seen}
        )
        return self._call("GET", f"/control/launcher?{query}") or {}

    def report(self, external_id: str, state: str, message: str = "") -> None:
        body: dict[str, Any] = {"state": state}
        if message:
            body["message"] = message[:1000]
        self._call("POST", f"/control/launcher/{urllib.parse.quote(external_id)}", body)

    def sync(self, profiles: list[tuple[str, str]]) -> dict[str, Any]:
        body = {"profiles": [{"externalId": pid, "name": name} for pid, name in profiles]}
        return self._call("POST", "/control/profiles/sync", body) or {}


# ── NSTBrowser (sur cet ordinateur) ───────────────────────────────────────


class NstError(RuntimeError):
    pass


class Nst:
    def __init__(self, address: str, key: str) -> None:
        if not key:
            raise NstError("clé NSTBrowser absente : réglez-la dans la plateforme (en haut : « Clé NSTBrowser »)")
        self.address = address.rstrip("/")
        self.key = key

    def _call(self, method: str, path: str, query: Optional[dict[str, Any]] = None) -> Any:
        url = f"{self.address}{path}" + (f"?{urllib.parse.urlencode(query)}" if query else "")
        try:
            payload = http(method, url, {"x-api-key": self.key}, timeout=60.0)
        except HttpError as exc:
            if "injoignable" in str(exc):
                raise NstError("NSTBrowser injoignable sur cet ordinateur : l'application est-elle ouverte ?") from exc
            raise NstError(str(exc)) from exc
        if isinstance(payload, dict):
            code = payload.get("code")
            if payload.get("err") or (code is not None and code not in (0, 200)):
                raise NstError(f"NSTBrowser a refusé {method} {path} : {payload.get('msg') or payload.get('message') or 'erreur'} (code {code})")
            return payload.get("data")
        return payload

    def profiles(self) -> list[tuple[str, str]]:
        found: list[tuple[str, str]] = []
        seen: set[str] = set()
        for page in range(1, 51):
            data = self._call("GET", "/profiles", {"page": page, "pageSize": 100})
            rows, more = [], False
            if isinstance(data, list):
                rows = data
            elif isinstance(data, dict):
                rows = data.get("docs") or next((data[k] for k in ("data", "list", "rows", "items") if isinstance(data.get(k), list)), [])
                total = data.get("totalPages")
                more = bool(data.get("hasNextPage")) or (isinstance(total, int) and page < total)
            for row in rows:
                if not isinstance(row, dict):
                    continue
                pid = str(row.get("profileId") or row.get("id") or "").strip()
                if pid and pid not in seen:
                    seen.add(pid)
                    found.append((pid, str(row.get("name") or "").strip()))
            if not rows or not more:
                break
        return found

    def is_open(self, pid: str) -> bool:
        try:
            data = self._call("GET", f"/browsers/{pid}/debugger")
        except NstError:
            return False
        return isinstance(data, dict) and bool(data.get("webSocketDebuggerUrl"))

    def start(self, pid: str) -> None:
        self._call("POST", f"/browsers/{pid}")
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if self.is_open(pid):
                return
            time.sleep(1.0)
        raise NstError(f"le navigateur de {pid} ne s'est pas ouvert en 60 s")

    def stop(self, pid: str) -> None:
        self._call("DELETE", f"/browsers/{pid}")


# ── L'agent ───────────────────────────────────────────────────────────────


class Agent:
    """Un tour = lire le plan, ouvrir ce qui manque, (fermer ce qui traîne)."""

    def __init__(self, cfg: dict[str, Any], platform_api: Platform) -> None:
        self.cfg = cfg
        self.api = platform_api
        self.clients: dict[str, Nst] = {}
        self.synced_at: Optional[float] = None
        self.running_count = 0

    def nst(self, key: str) -> Nst:
        key = key or str(self.cfg.get("nstApiKey") or "")
        if key not in self.clients:
            self.clients[key] = Nst(str(self.cfg["nstApiAddress"]), key)
        return self.clients[key]

    def sync(self, plan: dict[str, Any]) -> None:
        every = float(self.cfg.get("syncEverySeconds") or 0)
        if every <= 0 or (self.synced_at is not None and time.monotonic() - self.synced_at < max(60.0, every)):
            return
        self.synced_at = time.monotonic()
        try:
            found = self.nst(str(plan.get("nstApiKey") or "")).profiles()
            if not found:
                return
            result = self.api.sync(found)
        except (NstError, HttpError) as exc:
            log.warning("Synchronisation des profils impossible : %s", exc)
            return
        for r in result.get("renamed") or []:
            log.info("Profil renommé d'après NSTBrowser : %s → %s", r.get("from"), r.get("to"))
        created = result.get("created") or []
        if created:
            log.info("%d profil(s) NSTBrowser ajouté(s) à la plateforme : %s", len(created), ", ".join(str(p.get("name") or p.get("externalId")) for p in created))

    def run_once(self) -> float:
        plan = self.api.plan(self.running_count)
        self.sync(plan)
        targets = [t for t in plan.get("profiles") or [] if isinstance(t, dict) and t.get("externalId")]
        wait = float(plan.get("pollAfterSeconds") or 60)
        if not targets:
            log.info("Aucun profil piloté pour cette clé")
            return wait
        running = {t["externalId"] for t in targets if self._safe_is_open(t)}
        self.running_count = len(running)
        cap = int(self.cfg.get("maxBrowsers") or 0)
        log.info("%d profil(s) piloté(s), %d navigateur(s) ouvert(s), %d à faire tourner", len(targets), len(running), sum(1 for t in targets if t.get("shouldRun")))
        for t in targets:
            pid, name = t["externalId"], t.get("name") or t["externalId"]
            here = pid in running
            if t.get("shouldRun") and not here:
                if cap and len(running) >= cap:
                    log.warning("Plafond de %d navigateurs atteint : %s attendra", cap, name)
                    continue
                log.info("Ouverture de %s (%s)", name, t.get("reason") or "")
                self._report(t, STARTING)
                try:
                    self.nst(str(t.get("nstApiKey") or "")).start(pid)
                except NstError as exc:
                    log.error("NSTBrowser n'a pas ouvert %s : %s", name, exc)
                    self._report(t, ERROR, str(exc))
                    continue
                running.add(pid)
                self._report(t, RUNNING)
            elif here and not t.get("shouldRun") and t.get("mayClose") and self.cfg.get("closeBrowsers"):
                log.info("Fermeture de %s (%s)", name, t.get("reason") or "")
                try:
                    self.nst(str(t.get("nstApiKey") or "")).stop(pid)
                    running.discard(pid)
                    self._report(t, STOPPED)
                except NstError as exc:
                    self._report(t, ERROR, str(exc))
            elif here:
                self._report(t, RUNNING)
        self.running_count = len(running)
        return wait

    def _safe_is_open(self, t: dict[str, Any]) -> bool:
        try:
            return self.nst(str(t.get("nstApiKey") or "")).is_open(t["externalId"])
        except NstError:
            return False

    def _report(self, t: dict[str, Any], state: str, message: str = "") -> None:
        if state == t.get("browserState") and not message:
            return
        try:
            self.api.report(t["externalId"], state, message)
        except HttpError as exc:
            log.warning("La plateforme n'a pas noté l'état de %s : %s", t.get("name"), exc)


# ── Démarrage ─────────────────────────────────────────────────────────────


def setup_logging() -> None:
    fmt = logging.Formatter("%(asctime)s  %(levelname)-7s %(message)s", "%H:%M:%S")
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    handlers: list[logging.Handler] = [console]
    try:
        file_handler = logging.handlers.RotatingFileHandler(LOG_FILE, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
        file_handler.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-7s %(message)s"))
        handlers.append(file_handler)
    except OSError:
        pass
    logging.basicConfig(level=logging.INFO, handlers=handlers)


def single_instance() -> Optional[socket.socket]:
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", LOCK_PORT))
        lock.listen(1)
        return lock
    except OSError:
        return None


def check(cfg: dict[str, Any]) -> int:
    """Le diagnostic : tout ce qu'il faut pour que l'agent marche."""
    ok = True
    api = Platform(cfg["apiBaseUrl"], cfg["apiKey"])
    try:
        plan = api.plan(0)
        log.info("✓ Plateforme %s : clé acceptée, %d profil(s) piloté(s)", cfg["apiBaseUrl"], len(plan.get("profiles") or []))
    except HttpError as exc:
        log.error("✗ Plateforme : %s", exc)
        return 1
    key = str(plan.get("nstApiKey") or cfg.get("nstApiKey") or "")
    try:
        found = Nst(str(cfg["nstApiAddress"]), key).profiles()
        log.info("✓ NSTBrowser : %d profil(s) sur cet ordinateur", len(found))
    except NstError as exc:
        log.error("✗ NSTBrowser : %s", exc)
        ok = False
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent local PostFlow")
    parser.add_argument("--once", action="store_true", help="un seul tour, puis sortir")
    parser.add_argument("--check", action="store_true", help="diagnostic, puis sortir")
    parser.add_argument("--close", action="store_true", help="autoriser la fermeture des navigateurs plus réclamés")
    args = parser.parse_args()
    setup_logging()
    log.info("Agent local PostFlow %s — %s (%s)", AGENT_VERSION, socket.gethostname(), platform.system())
    try:
        cfg = load_config()
    except ConfigError as exc:
        log.error("Configuration : %s", exc)
        return 1
    if args.close:
        cfg["closeBrowsers"] = True
    if args.check:
        return check(cfg)
    lock = single_instance()
    if lock is None:
        log.error("Un agent PostFlow tourne déjà sur cet ordinateur : rien à faire de plus.")
        return 1
    agent = Agent(cfg, Platform(cfg["apiBaseUrl"], cfg["apiKey"]))
    log.info("Plateforme : %s — laissez cette fenêtre ouverte (Ctrl+C pour arrêter).", cfg["apiBaseUrl"])
    while True:
        try:
            wait = agent.run_once()
        except HttpError as exc:
            # Une plateforme muette ne ferme rien : on attend et on réessaie.
            log.error("Plateforme injoignable : %s", exc)
            wait = 60.0
        except NstError as exc:
            log.error("NSTBrowser : %s", exc)
            wait = 60.0
        except Exception as exc:  # noqa: BLE001 — un tour raté ne doit jamais arrêter l'agent
            log.exception("Erreur inattendue : %s", exc)
            wait = 60.0
        if args.once:
            return 0
        try:
            time.sleep(max(15.0, wait))
        except KeyboardInterrupt:
            log.info("Agent arrêté.")
            return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
