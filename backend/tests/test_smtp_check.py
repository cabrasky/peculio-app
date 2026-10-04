"""Prueba de la configuración SMTP (mail.check_smtp) contra un servidor SMTP falso en local,
y la clasificación de los errores que la web explica.

Uso:  python tests/test_smtp_check.py     (desde backend/, o desde cualquier parte)
"""
import asyncio, base64, os, socket, ssl, sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
os.environ["DATABASE_URL"] = "postgresql+asyncpg://u:p@127.0.0.1:1/x"  # el motor no se conecta al importarlo

import aiosmtplib
from app import mail

fails = 0
def check(name, cond, extra=""):
    global fails
    if not cond: fails += 1
    print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra else ""))


class FakeSMTP:
    """Servidor SMTP mínimo: AUTH PLAIN, remitente permitido, y opciones para simular fallos."""

    def __init__(self, *, banner="220 fake ESMTP", auth=True, require_auth=True,
                 user="gastos@test.local", password="secreta", allowed_from="gastos@test.local"):
        self.banner, self.auth, self.require_auth = banner, auth, require_auth
        self.user, self.password, self.allowed_from = user, password, allowed_from
        self.messages = []

    async def start(self):
        self.server = await asyncio.start_server(self.handle, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]
        return self

    async def stop(self):
        self.server.close()
        await self.server.wait_closed()

    async def handle(self, reader, writer):
        async def say(line):
            writer.write(line.encode() + b"\r\n")
            await writer.drain()

        authed = False
        try:
            if self.banner is None:  # no saluda: el cliente se queda esperando
                await asyncio.sleep(5)
                return
            await say(self.banner)
            while line := (await reader.readline()).decode().rstrip("\r\n"):
                cmd, _, arg = line.partition(" ")
                cmd = cmd.upper()
                if cmd in ("EHLO", "HELO"):
                    ext = ["fake", "8BITMIME"] + (["AUTH PLAIN"] if self.auth else [])
                    for i, e in enumerate(ext):
                        await say(("250 " if i == len(ext) - 1 else "250-") + e)
                elif cmd == "AUTH":
                    token = arg.split(" ", 1)[1] if " " in arg else None
                    if token is None:
                        await say("334 ")
                        token = (await reader.readline()).decode().strip()
                    _, u, p = base64.b64decode(token).decode().split("\0")
                    authed = (u, p) == (self.user, self.password)
                    await say("235 2.7.0 Authentication successful" if authed else "535 5.7.8 Authentication credentials invalid")
                elif cmd == "MAIL":
                    sender = arg.split(":", 1)[1].strip().strip("<>").split(">")[0]
                    if self.require_auth and not authed:
                        await say("530 5.7.0 Authentication required")
                    elif sender != self.allowed_from:
                        await say(f"553 5.7.1 <{sender}>: Sender address rejected: not owned by user")
                    else:
                        await say("250 2.1.0 Ok")
                elif cmd == "RCPT":
                    await say("250 2.1.5 Ok")
                elif cmd == "DATA":
                    await say("354 End data with <CR><LF>.<CR><LF>")
                    data = b""
                    while not data.endswith(b"\r\n.\r\n"):
                        data += await reader.readline()
                    self.messages.append(data.decode(errors="replace"))
                    await say("250 2.0.0 Ok: queued")
                elif cmd in ("RSET", "NOOP"):
                    await say("250 2.0.0 Ok")
                elif cmd == "QUIT":
                    await say("221 2.0.0 Bye")
                    break
                else:
                    await say("502 5.5.2 Command not recognized")
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            writer.close()


def cfg(port, **kw):
    base = {"host": "127.0.0.1", "port": port, "user": "gastos@test.local", "password": "secreta",
            "from_email": "gastos@test.local", "from_name": "Peculio"}
    return {**base, **kw}


def steps(r):
    return [(s["step"], s["ok"]) for s in r["steps"]]


def err(r):
    return (r["error"] or {}).get("code")


async def main():
    real_tls_mode = mail.tls_mode
    mail.tls_mode = lambda port: "none"  # el servidor falso no tiene TLS

    srv = await FakeSMTP().start()
    r = await mail.check_smtp(cfg(srv.port))
    check("todo bien: conexión, login y remitente", r["ok"] and steps(r) == [("connect", True), ("auth", True), ("sender", True)], str(r))
    check("probar conexión no envía nada", srv.messages == [])

    r = await mail.check_smtp(cfg(srv.port), send_to="ana@test.local")
    check("enviar prueba: llega el correo", r["ok"] and steps(r)[-1] == ("send", True) and len(srv.messages) == 1, str(r))
    check("el correo de prueba va al destinatario", "To: ana@test.local" in srv.messages[0])

    r = await mail.check_smtp(cfg(srv.port, password="mala"))
    check("contraseña mala → auth, en el paso de login", not r["ok"] and err(r) == "auth" and r["error"]["step"] == "auth", str(r))
    check("el detalle trae la respuesta del servidor", r["error"]["detail"].startswith("535 5.7.8"), r["error"]["detail"])

    r = await mail.check_smtp(cfg(srv.port, from_email="otro@test.local"))
    check("remitente ajeno → sender_refused", err(r) == "sender_refused" and r["error"]["step"] == "sender", str(r))

    r = await mail.check_smtp(cfg(srv.port, user="", password=""))
    check("sin usuario en un servidor que lo exige → auth_required", err(r) == "auth_required", str(r))
    await srv.stop()

    srv = await FakeSMTP(auth=False, require_auth=False).start()
    r = await mail.check_smtp(cfg(srv.port))
    check("usuario en un relay sin AUTH → auth_unsupported", err(r) == "auth_unsupported", str(r))
    r = await mail.check_smtp(cfg(srv.port, user="", password=""))
    check("relay sin AUTH y sin usuario → ok (se salta el login)", r["ok"] and steps(r) == [("connect", True), ("sender", True)], str(r))
    await srv.stop()

    srv = await FakeSMTP(banner="554 5.7.1 No SMTP service here").start()
    r = await mail.check_smtp(cfg(srv.port))
    check("rechaza al saludar → rejected", err(r) == "rejected" and r["error"]["step"] == "connect", str(r))
    await srv.stop()

    srv = await FakeSMTP(banner=None).start()
    r = await mail.check_smtp(cfg(srv.port), timeout=0.5)
    check("no saluda → timeout", err(r) == "timeout", str(r))
    await srv.stop()

    # Puerto cerrado: se reserva uno libre y se suelta
    s = socket.socket(); s.bind(("127.0.0.1", 0)); closed = s.getsockname()[1]; s.close()
    r = await mail.check_smtp(cfg(closed), timeout=3)
    check("puerto cerrado → refused", err(r) == "refused", str(r))

    r = await mail.check_smtp(cfg(25, host="no-existe.invalid"), timeout=3)
    check("host que no existe → dns", err(r) == "dns", str(r))

    check("sin host → no_host", err(await mail.check_smtp(cfg(25, host=""))) == "no_host")
    check("puerto fuera de rango → bad_port", err(await mail.check_smtp(cfg(70000))) == "bad_port")
    check("remitente sin @ → bad_from", err(await mail.check_smtp(cfg(25, from_email="gastos"))) == "bad_from")

    # Con el modo real, un puerto que no es 25/465 pide STARTTLS
    mail.tls_mode = real_tls_mode
    srv = await FakeSMTP().start()
    r = await mail.check_smtp(cfg(srv.port))
    check("servidor sin STARTTLS en un puerto que lo pide → starttls_unsupported",
          err(r) == "starttls_unsupported" and steps(r) == [("connect", True), ("starttls", False)], str(r))
    await srv.stop()

    check("modo por puerto: 465 TLS, 25 sin cifrar, 587 STARTTLS",
          (mail.tls_mode(465), mail.tls_mode(25), mail.tls_mode(587)) == ("tls", "none", "starttls"))

    # Errores de TLS: llegan envueltos en SMTPConnectError, con el original como causa
    def wrapped(cause):
        try:
            raise aiosmtplib.SMTPConnectError("Error connecting") from cause
        except aiosmtplib.SMTPConnectError as e:
            return e
    cert = ssl.SSLCertVerificationError(1, "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: Hostname mismatch")
    check("certificado no válido → cert", mail.classify_smtp_error(wrapped(cert)) == "cert")
    check("TLS contra un puerto sin TLS → tls", mail.classify_smtp_error(wrapped(ssl.SSLError(1, "[SSL: WRONG_VERSION_NUMBER] wrong version number"))) == "tls")
    check("destinatario rechazado → recipient_refused",
          mail.classify_smtp_error(aiosmtplib.SMTPRecipientsRefused([aiosmtplib.SMTPRecipientRefused(550, "no", "x@y")])) == "recipient_refused")
    check("error desconocido → unknown", mail.classify_smtp_error(ValueError("raro")) == "unknown")

asyncio.run(main())
print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
sys.exit(1 if fails else 0)
