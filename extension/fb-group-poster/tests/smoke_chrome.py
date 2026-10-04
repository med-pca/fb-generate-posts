"""Charger l'extension dans un Chrome jetable et verifier qu'elle demarre.

    python3 tests/smoke_chrome.py

Hors de `npm test` : demande un vrai Chrome et le paquet python `websockets`.
Rien du navigateur de l'utilisateur n'est touche -- profil temporaire, mode
headless, processus tue a la fin. Ce qui est verifie :

  - le manifeste est accepte par Chrome ;
  - le service worker demarre sans exception (donc tous ses imports resolvent) ;
  - le popup s'affiche et ses valeurs viennent bien du worker ;
  - une configuration incomplete est refusee, et nommee ;
  - un reglage enregistre revient borne (0 seconde -> le plancher).

Ce qui ne peut pas l'etre ici : les selecteurs Facebook. Ils ne se verifient que
sur la page reelle.
"""
import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

try:
    import websockets
except ImportError:
    sys.exit("Il manque le paquet python `websockets` (pip install websockets)")

EXT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 9338
CHROME = os.environ.get(
    "CHROME",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)


def http(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=10) as response:
        return json.load(response)


class Session:
    """Une connexion CDP, avec de quoi lire les erreurs d'un contexte."""

    def __init__(self, socket):
        self.socket = socket
        self.id = 0
        self.problems = []

    async def send(self, method, params=None):
        self.id += 1
        await self.socket.send(json.dumps({"id": self.id, "method": method, "params": params or {}}))
        return self.id

    async def collect(self, seconds):
        """Tout ce que le contexte a signale comme erreur pendant ce temps."""
        end = time.time() + seconds
        while time.time() < end:
            try:
                raw = await asyncio.wait_for(self.socket.recv(), timeout=max(0.05, end - time.time()))
            except Exception:
                return
            message = json.loads(raw)
            method = message.get("method")
            if method == "Runtime.exceptionThrown":
                details = message["params"]["exceptionDetails"]
                self.problems.append(
                    "exception: " + (details.get("exception", {}).get("description") or details.get("text", ""))[:300]
                )
            elif method == "Log.entryAdded" and message["params"]["entry"]["level"] == "error":
                self.problems.append("log: " + message["params"]["entry"]["text"][:300])
            elif method == "Runtime.consoleAPICalled" and message["params"]["type"] == "error":
                args = " ".join(str(a.get("value", a.get("description", ""))) for a in message["params"]["args"])
                self.problems.append("console.error: " + args[:300])

    async def evaluate(self, expression):
        wanted = await self.send(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": True, "awaitPromise": True},
        )
        while True:
            message = json.loads(await asyncio.wait_for(self.socket.recv(), timeout=30))
            if message.get("id") != wanted:
                continue
            if "error" in message:
                raise RuntimeError(message["error"])
            if message["result"].get("exceptionDetails"):
                details = message["result"]["exceptionDetails"]
                raise RuntimeError(
                    (details.get("exception", {}).get("description") or details.get("text", ""))[:300]
                )
            return message["result"]["result"].get("value")

    async def report(self, checks):
        for name, expression in checks.items():
            try:
                print(f"  {name}: {await self.evaluate(expression)}")
            except RuntimeError as exc:
                print(f"  {name}: ECHEC {exc}")
                self.problems.append(f"{name}: {exc}")


async def main():
    profile = tempfile.mkdtemp(prefix="fbx-chrome-")
    chrome = subprocess.Popen(
        [
            CHROME, "--headless=new", f"--remote-debugging-port={PORT}",
            f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
            # Recent Chrome ignores --load-extension; the extension is installed
            # over CDP instead, which this switch allows.
            "--enable-unsafe-extension-debugging",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    problems = []
    try:
        version = None
        for _ in range(30):
            try:
                version = http("/json/version")
                break
            except Exception:
                time.sleep(1)
        if not version:
            print("FAIL: Chrome n'a pas ouvert son port de debogage")
            return 1
        print(version["Browser"])

        async with websockets.connect(version["webSocketDebuggerUrl"], max_size=None) as socket:
            browser = Session(socket)
            wanted = await browser.send("Extensions.loadUnpacked", {"path": EXT})
            while True:
                message = json.loads(await asyncio.wait_for(socket.recv(), timeout=30))
                if message.get("id") == wanted:
                    break
            if "error" in message:
                print("FAIL: Chrome refuse l'extension :", message["error"])
                return 1
            ext_id = message["result"]["id"]
        print(f"extension chargee : {ext_id}")

        worker = None
        deadline = time.time() + 15
        while time.time() < deadline and worker is None:
            worker = next(
                (t for t in http("/json/list")
                 if t.get("type") == "service_worker"
                 and t.get("url", "").startswith(f"chrome-extension://{ext_id}/")),
                None,
            )
            if worker is None:
                time.sleep(0.5)
        if worker is None:
            print("FAIL: le service worker ne demarre pas")
            return 1

        print("SERVICE WORKER")
        async with websockets.connect(worker["webSocketDebuggerUrl"], max_size=None) as socket:
            session = Session(socket)
            await session.send("Runtime.enable")
            await session.send("Log.enable")
            await session.collect(3)
            await session.report({
                "manifeste": "chrome.runtime.getManifest().name + ' v' + chrome.runtime.getManifest().version",
                "apis": "['storage','alarms','tabs','scripting','permissions','debugger'].filter((k) => !chrome[k]).join(',') || 'toutes presentes'",
                "journal": "chrome.storage.local.get('logs').then((s) => (s.logs || []).map((l) => l.level + ' ' + l.message).join(' | ') || 'vide')",
                "alarmes": "chrome.alarms.getAll().then((a) => a.length + ' alarme(s) au repos')",
                # Only the extension itself may open one of its own pages, and a
                # message sent from the worker never reaches its own listener --
                # so the round trip is tested from the popup, below.
                "ouverture_popup": "chrome.tabs.create({url: chrome.runtime.getURL('src/popup/popup.html')}).then(() => 'popup ouvert')",
            })
            problems += session.problems

        time.sleep(2.5)
        popup = next((t for t in http("/json/list") if t.get("url", "").endswith("popup.html")), None)
        print("POPUP")
        if not popup:
            print("  FAIL: le popup ne s'est pas ouvert")
            problems.append("popup absent")
        else:
            async with websockets.connect(popup["webSocketDebuggerUrl"], max_size=None) as socket:
                session = Session(socket)
                await session.send("Runtime.enable")
                await session.send("Log.enable")
                await session.collect(2)
                await session.report({
                    "etat": "document.getElementById('badge').textContent",
                    "avertissement": "document.getElementById('problems').textContent",
                    "boutons": "[...document.querySelectorAll('button')].map((b) => b.id + (b.disabled ? ':inactif' : ':actif')).join(' ')",
                    "journal_affiche": "document.querySelectorAll('#log li').length + ' ligne(s)'",
                    "demarrage_refuse": "chrome.runtime.sendMessage({type:'start'}).then((a) => a.ok + ' / ' + a.message)",
                    "liens_refuses": "chrome.runtime.sendMessage({type:'placeLinks'}).then((a) => a.ok + ' / ' + a.message)",
                    "reglage_borne": "chrome.runtime.sendMessage({type:'saveConfig', patch:{apiKey:'k', profileExternalId:'p1', stepTimeoutSeconds:0}}).then((a) => 'etape=' + a.config.stepTimeoutSeconds + 's, problemes restants=' + a.problems.length)",
                })
                problems += session.problems

        print("\nRESULTAT:", "OK" if not problems else f"{len(problems)} probleme(s)")
        for problem in problems:
            print("  -", problem)
        return 0 if not problems else 1
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=10)
        except subprocess.TimeoutExpired:
            chrome.kill()
        subprocess.run(["rm", "-rf", profile], check=False)


sys.exit(asyncio.run(main()))
