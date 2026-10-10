"""L'agent contre une fausse plateforme et un faux NSTBrowser (sans réseau).

    python3 agent/tests/test_agent.py
"""
import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import postflow_agent as pa  # noqa: E402

STATE = {}


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, payload, code=200):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("content-length") or 0)
        return json.loads(self.rfile.read(n) or b"null")

    def do_GET(self):
        STATE["calls"].append(("GET", self.path))
        if self.path.startswith("/api/control/launcher"):
            if self.headers.get("X-API-Key") != "cle":
                return self._send({"message": "refusée"}, 401)
            return self._send({"pollAfterSeconds": 60, "nstApiKey": "nst", "profiles": STATE["plan"]})
        if self.path.startswith("/nst/profiles"):
            return self._send({"code": 0, "data": {"docs": [{"profileId": "p1", "name": "Salma Ibouban"}, {"profileId": "p2", "name": "Rihab"}], "totalPages": 1}})
        if self.path.startswith("/nst/browsers/") and self.path.endswith("/debugger"):
            pid = self.path.split("/")[3]
            return self._send({"code": 0, "data": {"webSocketDebuggerUrl": "ws://x"} if pid in STATE["open"] else None})
        self._send({}, 404)

    def do_POST(self):
        body = self._body()
        STATE["calls"].append(("POST", self.path, body))
        if self.path.startswith("/nst/browsers/"):
            STATE["open"].add(self.path.split("/")[3])
            return self._send({"code": 0, "data": None})
        if self.path == "/api/control/profiles/sync":
            return self._send({"created": [], "renamed": [{"from": "Salma", "to": "Salma Ibouban"}]})
        self._send({"ok": True})

    def do_DELETE(self):
        STATE["calls"].append(("DELETE", self.path))
        STATE["open"].discard(self.path.split("/")[3])
        self._send({"code": 0, "data": None})


class AgentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def agent(self, key="cle", close=False):
        cfg = {"apiBaseUrl": f"{self.base}/api", "apiKey": key, "nstApiAddress": f"{self.base}/nst", "nstApiKey": "", "maxBrowsers": 0, "closeBrowsers": close, "syncEverySeconds": 600}
        return pa.Agent(cfg, pa.Platform(cfg["apiBaseUrl"], key))

    def setUp(self):
        STATE.clear()
        STATE.update(calls=[], open=set(), plan=[])

    def test_ouvre_ce_que_le_pilotage_demande_et_se_signale(self):
        STATE["plan"] = [
            {"externalId": "p1", "name": "Salma", "shouldRun": True, "reason": "auto", "browserState": "STOPPED", "nstApiKey": "nst"},
            {"externalId": "p2", "name": "Rihab", "shouldRun": False, "mayClose": True, "browserState": "STOPPED", "nstApiKey": "nst"},
        ]
        self.agent().run_once()
        self.assertEqual(STATE["open"], {"p1"})
        reports = [c for c in STATE["calls"] if c[0] == "POST" and c[1].startswith("/api/control/launcher/")]
        self.assertEqual([r[2]["state"] for r in reports], ["STARTING", "RUNNING"])
        launcher = next(c for c in STATE["calls"] if c[1].startswith("/api/control/launcher?"))
        self.assertIn("agent=", launcher[1])
        self.assertIn("version=" + pa.AGENT_VERSION, launcher[1])

    def test_synchronise_les_profils_nstbrowser(self):
        self.agent().run_once()
        sync = next(c for c in STATE["calls"] if c[1] == "/api/control/profiles/sync")
        self.assertEqual(sync[2]["profiles"], [{"externalId": "p1", "name": "Salma Ibouban"}, {"externalId": "p2", "name": "Rihab"}])

    def test_ne_ferme_rien_sauf_si_on_l_autorise(self):
        STATE["open"] = {"p2"}
        STATE["plan"] = [{"externalId": "p2", "name": "Rihab", "shouldRun": False, "mayClose": True, "browserState": "RUNNING", "nstApiKey": "nst"}]
        self.agent().run_once()
        self.assertEqual(STATE["open"], {"p2"})
        self.agent(close=True).run_once()
        self.assertEqual(STATE["open"], set())

    def test_cle_refusee_message_clair(self):
        with self.assertRaises(pa.HttpError) as ctx:
            self.agent(key="mauvaise").run_once()
        self.assertIn("retéléchargez", str(ctx.exception))

    def test_config_sans_cle(self):
        original = pa.CONFIG_FILE
        try:
            pa.CONFIG_FILE = Path(__file__).resolve().parents[1] / "agent.config.json"
            with self.assertRaises(pa.ConfigError):
                pa.load_config()
        finally:
            pa.CONFIG_FILE = original


if __name__ == "__main__":
    unittest.main(verbosity=1)
