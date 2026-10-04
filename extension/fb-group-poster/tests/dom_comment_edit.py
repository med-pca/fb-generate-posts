"""L'édition d'un commentaire, contre une page qui imite Facebook.

    python3 tests/dom_comment_edit.py

Hors de `npm test` : demande un vrai Chrome et le paquet python `websockets`.
Les sélecteurs ne se vérifient que dans un navigateur -- une page de test ne
remplace pas le vrai Facebook, mais elle reproduit le piège qui cassait
l'édition : le bouton « ... » d'un commentaire est masqué par `display:none`
tant que la souris n'est pas dessus, et c'est du CSS `:hover` pur. Un vrai
pointeur (ce que faisait CDP côté Python) le révèle ; des événements de
synthèse, non. Et comme le vrai Facebook, la page ignore les clics et l'Entrée
qui ne sont pas de confiance (isTrusted = false).

Le test rejoue donc la séquence de src/background/links.js (editTrusted) :
les étapes de la page disent OÙ sont les choses, et la saisie passe par
Input.* de CDP -- ce que l'extension envoie via chrome.debugger.
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

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.dirname(HERE)
FIXTURE = os.path.join(HERE, "fixtures", "facebook-comment.html")
PORT = 9344
CHROME = os.environ.get(
    "CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
)
# main.js est laissé de côté : il parle à chrome.runtime, absent d'une page
# ordinaire. Ce qui est testé ici est le DOM, pas le fil vers le worker.
SCRIPTS = ["helpers.js", "interact.js", "steps.js"]
NEW_TEXT = "https://pulserecipe.com/recipes/creamy-tomato-tortellini"


def http(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=10) as response:
        return json.load(response)


async def evaluate(socket, message_id, expression):
    await socket.send(
        json.dumps(
            {
                "id": message_id,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": expression,
                    "returnByValue": True,
                    "awaitPromise": True,
                },
            }
        )
    )
    while True:
        message = json.loads(await asyncio.wait_for(socket.recv(), timeout=60))
        if message.get("id") != message_id:
            continue
        if message["result"].get("exceptionDetails"):
            details = message["result"]["exceptionDetails"]
            raise RuntimeError(
                (details.get("exception", {}).get("description") or details.get("text", ""))[:400]
            )
        return message["result"]["result"].get("value")


async def main():
    profile = tempfile.mkdtemp(prefix="fbx-dom-")
    chrome = subprocess.Popen(
        [
            CHROME, "--headless=new", f"--remote-debugging-port={PORT}",
            f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
            f"file://{FIXTURE}",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        page = None
        deadline = time.time() + 30
        while time.time() < deadline and page is None:
            try:
                page = next(
                    (t for t in http("/json/list") if t.get("url", "").endswith("facebook-comment.html")),
                    None,
                )
            except Exception:
                pass
            if page is None:
                time.sleep(1)
        if page is None:
            print("FAIL: la page de test ne s'ouvre pas")
            return 1

        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as socket:
            message_id = 0

            async def run(expression):
                nonlocal message_id
                message_id += 1
                return await evaluate(socket, message_id, expression)

            for name in SCRIPTS:
                with open(os.path.join(EXT, "src", "content", name), encoding="utf-8") as handle:
                    await run(handle.read())
            print("  scripts injectés :", await run("Object.keys(FBX).join(', ')"))

            # Le bouton est bien introuvable au toucher : c'est tout le sujet.
            print(
                "  bouton « ... » hors survol :",
                await run(
                    "(() => { const b = document.querySelector('.options');"
                    " const r = b.getBoundingClientRect();"
                    " return `boite ${r.width}x${r.height}`; })()"
                ),
            )

            # « . » est dans presque tous les textes : seul un commentaire dont
            # c'est TOUT le texte doit correspondre.
            dot = await run("Boolean(FBX.dom.myComment('.'))")
            print("  « . » pris pour ce commentaire (doit être False) :", dot)
            if dot:
                print("FAIL: « . » trouve un commentaire qui ne vaut pas « . »")
                return 1

            print("  commentaire trouvé par son id :", await run(
                "Boolean(FBX.dom.commentById('123456'))"
            ))

            async def cdp(method, params):
                nonlocal message_id
                message_id += 1
                await socket.send(json.dumps({"id": message_id, "method": method, "params": params}))
                while True:
                    message = json.loads(await asyncio.wait_for(socket.recv(), timeout=60))
                    if message.get("id") == message_id:
                        return message.get("result")

            async def step(name, args=None):
                return await run(f"FBX.steps.{name}({json.dumps(args or {})})")

            # Les événements de synthèse seuls : la page doit les refuser, sinon
            # ce test ne prouve rien.
            synthetic = await step(
                "editCommentById", {"commentId": "123456", "newText": NEW_TEXT, "stepTimeoutMs": 3000}
            )
            print("  événements de synthèse (doit échouer) :", json.dumps(synthetic, ensure_ascii=False))
            if synthetic and synthetic.get("ok"):
                print("FAIL: la page accepte des événements de synthèse")
                return 1

            # La séquence de confiance, comme links.js/editTrusted.
            anchor = await step("locateComment", {"commentId": "123456", "timeoutMs": 5000})
            print("  commentaire :", anchor)
            await cdp("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": anchor["x"], "y": anchor["y"], "buttons": 0})
            await asyncio.sleep(0.4)
            menu = await step("locateCommentMenu", {"commentId": "123456"})
            print("  bouton « ... » survolé :", menu)

            async def click(p):
                base = {"x": p["x"], "y": p["y"], "button": "left", "clickCount": 1}
                await cdp("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": p["x"], "y": p["y"], "buttons": 0})
                await cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "buttons": 1, **base})
                await cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "buttons": 0, **base})

            await click(menu)
            await asyncio.sleep(0.6)
            item = await step("locateEditItem")
            print("  entrée Modifier :", item)
            await step("snapshotEditors")
            await click(item)
            editor = await step("focusEditor")
            print("  éditeur :", editor)
            await cdp("Input.insertText", {"text": NEW_TEXT + " "})
            print("  champ avant Entrée :", await step("editorText"))
            before = await step("linkPreview", {"commentId": "123456", "where": "editor"})
            print("  aperçu tout de suite (pas encore) :", before.get("ok"))
            preview = None
            for _ in range(20):
                preview = await step("linkPreview", {"commentId": "123456", "where": "editor"})
                if preview.get("ok"):
                    break
                await asyncio.sleep(0.5)
            print("  aperçu du site avant Entrée :", preview)
            if not (preview and preview.get("ok")):
                print("FAIL: l'aperçu du site n'est jamais détecté")
                return 1
            keys = {"key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13}
            await cdp("Input.dispatchKeyEvent", {"type": "keyDown", "text": "\r", "unmodifiedText": "\r", **keys})
            await cdp("Input.dispatchKeyEvent", {"type": "keyUp", **keys})
            await asyncio.sleep(0.5)
            result = await step("commentHoldsText", {"commentId": "123456", "text": NEW_TEXT})
            print("  édition :", json.dumps(result, ensure_ascii=False))

            after = await step("linkPreview", {"commentId": "123456", "where": "comment"})
            print("  aperçu dans le commentaire enregistré :", after)

            saved = await run("window.__saved")
            print("  texte enregistré par la page :", saved)

            idempotent = await step(
                "editCommentById", {"commentId": "123456", "newText": NEW_TEXT, "stepTimeoutMs": 4000}
            )
            print("  rejoué :", json.dumps(idempotent, ensure_ascii=False))

            ok = bool(result and result.get("ok")) and saved == NEW_TEXT and bool(after and after.get("ok"))
            ok = ok and bool(idempotent and idempotent.get("alreadyThere"))
            print("\nRESULTAT:", "OK" if ok else "ECHEC")
            return 0 if ok else 1
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=10)
        except subprocess.TimeoutExpired:
            chrome.kill()
        subprocess.run(["rm", "-rf", profile], check=False)


sys.exit(asyncio.run(main()))
