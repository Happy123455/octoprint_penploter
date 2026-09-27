#!/usr/bin/env python3
"""Serve the pen plotter workbench on your local network and keep every device in sync.

Open http://<this computer's IP>:8790 on your computer and your phone: both get the same pages, groups,
settings, calibration and font. A change on one device appears on the other within a second.

    python3 sync_server.py                 # port 8790
    python3 sync_server.py --port 9000

The shared state is kept in ~/Library/Application Support/PenPlotterSync/state.json (outside the project, since
it includes your OctoPrint and Gemini API keys). Standard library only.

Endpoints used by the page (index.html enables syncing only when they exist):
    GET  /__sync/state                 -> {"version": n, "data": {key: value}}
    POST /__sync/state                 <- {"client": id, "data": {key: value or null}}
    GET  /__sync/wait?since=n&client=  -> waits up to 25 s for changes after version n
"""
import argparse
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

lock = threading.Condition()
state = {'version': 0, 'data': {}, 'keyVersion': {}, 'keyClient': {}}


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

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/__sync/state':
            with lock:
                return self.send_json({'version': state['version'], 'data': state['data']})
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
        return super().do_GET()

    def do_POST(self):
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
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    server.daemon_threads = True
    print(f'Pen plotter workbench: http://localhost:{port}  |  other devices: http://{lan_ip()}:{port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
