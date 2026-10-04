#!/usr/bin/env python3
"""SPA-aware HTTP server for React Router apps.
Serves static files from DIST_DIR and falls back to index.html for any
non-file path (client-side routing)."""
import os
import sys
import mimetypes
from http.server import HTTPServer, SimpleHTTPRequestHandler

DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8121
BIND = sys.argv[2] if len(sys.argv) > 2 else '0.0.0.0'

class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def send_head(self):
        path = self.translate_path(self.path)
        # Serve the file if it exists
        if os.path.isfile(path):
            return super().send_head()
        # Fallback to index.html for SPA routes
        self.path = '/index.html'
        return super().send_head()

if __name__ == '__main__':
    os.chdir(DIST_DIR)
    server = HTTPServer((BIND, PORT), SPAHandler)
    print(f'SPA server on http://{BIND}:{PORT} serving {DIST_DIR}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
