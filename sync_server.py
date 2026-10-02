#!/usr/bin/env python3
"""Serve the pen plotter workbench on your local network, keep every device in sync, and keep the printer
connected.

Open http://<this computer's IP>:8790 on your computer and your phone: both get the same pages, groups,
settings, calibration, font and image/text blocks. A change on one device appears on the other within a second.

    python3 sync_server.py                 # port 8790
    python3 sync_server.py --port 9000

The shared state is kept in ~/Library/Application Support/PenPlotterSync/state.json (outside the project, since
it includes your OctoPrint and Gemini API keys). Standard library only.

OctoPrint pass-through: requests to /octoprint/... are forwarded to the OctoPrint address saved in the app. This
computer resolves that address once (an "octopi.local" name takes seconds here and does not resolve at all on
Android), so every device reaches OctoPrint quickly, with no CORS or https/http mixed-content problems.

Keep printer connected: while the app's "Keep printer connected" option is on (the default), OctoPrint's printer
connection is checked every 20 s. Only when OctoPrint reports it Closed or Offline, and a serial port is
available, a connect request is sent (asking OctoPrint to also auto-connect after a restart). Nothing is ever sent
while the printer is printing, paused, connecting or in any other state.

Endpoints used by the page (index.html enables syncing only when they exist):
    GET  /__sync/state                 -> {"version": n, "data": {key: value}}
    POST /__sync/state                 <- {"client": id, "data": {key: value or null}}
    GET  /__sync/wait?since=n&client=  -> waits up to 25 s for changes after version n
    GET  /__sync/printer               -> keep-connected status
    *    /octoprint/<path>             -> forwarded to OctoPrint
"""
import argparse
import gzip
import http.client
import json
import os
import socket
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.environ.get('PLOTTER_SYNC_STATE') or os.path.expanduser('~/Library/Application Support/PenPlotterSync/state.json')
STATE_DIR = os.path.dirname(STATE_FILE)
WATCH_INTERVAL = float(os.environ.get('PLOTTER_WATCH_INTERVAL', '20'))
RECONNECT_STATES = {'Closed', 'Offline', 'Offline after error'}
HOP_HEADERS = {'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers',
               'transfer-encoding', 'upgrade', 'host', 'content-length', 'origin', 'referer'}

lock = threading.Condition()
state = {'version': 0, 'data': {}, 'keyVersion': {}, 'keyClient': {}}
printer = {'enabled': True, 'state': None, 'error': None, 'lastCheck': 0, 'lastAction': None, 'lastActionAt': 0}


def load_state():
    try:
        with open(STATE_FILE, encoding='utf-8') as f:
            state.update(json.load(f))
    except (OSError, ValueError):
        pass


def save_state():
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATE_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(state, f)
    os.replace(tmp, STATE_FILE)


def changes_since(since):
    keys = [k for k, v in state['keyVersion'].items() if v > since]
    return {
        'version': state['version'],
        'data': {k: state['data'].get(k) for k in keys},
        'from': {k: state['keyClient'].get(k) for k in keys},
    }


# ---------------------------------------------------------------- OctoPrint target
_resolved = {'host': None, 'ip': None, 'at': 0}


def octoprint_target():
    """(scheme, ip, port, host) of the OctoPrint address saved in the app, resolved here and cached for 10 min."""
    with lock:
        raw = (state['data'].get('octoprint_url') or '').strip()
    if not raw:
        return None
    if '://' not in raw:
        raw = 'http://' + raw
    u = urlparse(raw)
    if not u.hostname:
        return None
    port = u.port or (443 if u.scheme == 'https' else 80)
    if _resolved['host'] != u.hostname or time.time() - _resolved['at'] > 600 or not _resolved['ip']:
        try:
            _resolved.update(host=u.hostname, ip=socket.getaddrinfo(u.hostname, port, socket.AF_INET)[0][4][0], at=time.time())
        except OSError:
            _resolved.update(host=u.hostname, ip=None, at=time.time())
            return None
    return u.scheme, _resolved['ip'], port, u.hostname


def octoprint_request(method, path, body=None, headers=None, timeout=30):
    t = octoprint_target()
    if not t:
        raise OSError('OctoPrint address is not set or cannot be resolved')
    scheme, ip, port, host = t
    conn = (http.client.HTTPSConnection if scheme == 'https' else http.client.HTTPConnection)(ip, port, timeout=timeout)
    try:
        conn.request(method, path, body=body, headers=dict(headers or {}, Host=f'{host}:{port}' if port not in (80, 443) else host))
        r = conn.getresponse()
        return r.status, r.getheaders(), r.read()
    except OSError:
        _resolved['ip'] = None   # re-resolve next time (the Pi may have a new address)
        raise
    finally:
        conn.close()


def api_key():
    with lock:
        return (state['data'].get('octoprint_apikey') or '').strip()


# ---------------------------------------------------------------- keep printer connected
def watch_printer():
    while True:
        time.sleep(WATCH_INTERVAL)
        with lock:
            printer['enabled'] = state['data'].get('plotter_keep_printer_connected', '1') != '0'
        if not printer['enabled'] or not api_key() or not octoprint_target():
            continue
        try:
            code, _, body = octoprint_request('GET', '/api/connection', headers={'X-Api-Key': api_key()}, timeout=8)
            printer['lastCheck'] = time.time()
            if code != 200:
                printer.update(state=None, error=f'OctoPrint answered HTTP {code}' + (' (API key rejected)' if code in (401, 403) else ''))
                continue
            info = json.loads(body)
            current = info.get('current', {}).get('state')
            printer.update(state=current, error=None)
            ports = info.get('options', {}).get('ports') or []
            # only a closed / offline connection is ever touched, and not more than once a minute
            if current in RECONNECT_STATES and ports and time.time() - printer['lastActionAt'] > 60:
                payload = json.dumps({'command': 'connect', 'save': True, 'autoconnect': True}).encode()
                code, _, _ = octoprint_request('POST', '/api/connection', body=payload,
                                               headers={'X-Api-Key': api_key(), 'Content-Type': 'application/json'}, timeout=15)
                printer.update(lastAction=f'reconnect requested (HTTP {code})', lastActionAt=time.time())
        except (OSError, ValueError) as e:
            printer.update(state=None, error=f'cannot reach OctoPrint: {e}', lastCheck=time.time())


# ---------------------------------------------------------------- HTTP
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def log_message(self, *a):
        pass

    def end_headers(self):
        # always fetch the latest app, never a stale cached copy
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy(self):
        path = self.path[len('/octoprint'):] or '/'
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_HEADERS}
        try:
            code, rheaders, data = octoprint_request(self.command, path, body=body, headers=headers,
                                                     timeout=120 if length > 100000 else 30)
        except OSError as e:
            return self.send_json({'error': f'cannot reach OctoPrint: {e}'}, 502)
        self.send_response(code)
        for k, v in rheaders:
            if k.lower() not in HOP_HEADERS and not k.lower().startswith('access-control-'):
                self.send_header(k, v)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path.startswith('/octoprint/'):
            return self.proxy()
        if url.path == '/__sync/state':
            with lock:
                return self.send_json({'version': state['version'], 'data': state['data']})
        if url.path == '/__sync/printer':
            return self.send_json(printer)
        if url.path == '/__sync/wait':
            q = parse_qs(url.query)
            since = int(q.get('since', ['0'])[0])
            deadline = time.time() + 25
            with lock:
                while state['version'] <= since and time.time() < deadline:
                    lock.wait(deadline - time.time())
                return self.send_json(changes_since(since))
        if url.path == '/':
            self.path = '/index.html'
            url = urlparse(self.path)
        # the app is ~850 KB; gzip it (~4x smaller) so it loads quickly over weak Wi-Fi
        if url.path.endswith(('.html', '.js', '.css', '.json')) and 'gzip' in self.headers.get('Accept-Encoding', ''):
            fp = os.path.join(HERE, url.path.lstrip('/'))
            if os.path.isfile(fp) and os.path.realpath(fp).startswith(HERE):
                with open(fp, 'rb') as f:
                    body = gzip.compress(f.read(), 6)
                self.send_response(200)
                self.send_header('Content-Type', self.guess_type(fp))
                self.send_header('Content-Encoding', 'gzip')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path.startswith('/octoprint/'):
            return self.proxy()
        if urlparse(self.path).path != '/__sync/state':
            return self.send_json({'error': 'not found'}, 404)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        except ValueError:
            return self.send_json({'error': 'bad json'}, 400)
        client = str(body.get('client', ''))
        with lock:
            changed = False
            for k, v in (body.get('data') or {}).items():
                if state['data'].get(k) == v:
                    continue
                if v is None:
                    state['data'].pop(k, None)
                else:
                    state['data'][k] = v
                state['version'] += 1
                state['keyVersion'][k] = state['version']
                state['keyClient'][k] = client
                changed = True
            if changed:
                save_state()
                lock.notify_all()
            return self.send_json({'version': state['version']})

    def do_PUT(self):
        return self.proxy() if self.path.startswith('/octoprint/') else self.send_json({'error': 'not found'}, 404)

    def do_DELETE(self):
        return self.proxy() if self.path.startswith('/octoprint/') else self.send_json({'error': 'not found'}, 404)

    def do_PATCH(self):
        return self.proxy() if self.path.startswith('/octoprint/') else self.send_json({'error': 'not found'}, 404)


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('192.0.2.1', 80))   # no packet is sent; just picks the outgoing interface
            return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--port', type=int, default=8790)
    port = ap.parse_args().port
    load_state()
    threading.Thread(target=watch_printer, daemon=True).start()
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    server.daemon_threads = True
    print(f'Pen plotter workbench: http://localhost:{port}  |  other devices: http://{lan_ip()}:{port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
