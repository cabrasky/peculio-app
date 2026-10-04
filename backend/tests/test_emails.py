"""Prueba de los correos: plantilla nueva, estructura MIME, logo incrustado y escapado del texto del usuario.

Uso:  python tests/test_emails.py     (desde backend/, o desde cualquier parte)
"""
import os, sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
os.environ["DATABASE_URL"] = "postgresql+asyncpg://u:p@127.0.0.1:1/x"  # el motor no se conecta al importarlo
os.environ["FRONTEND_URL"] = "https://peculio.example"

from app import mail
from app.email_layout import LOGO_CID, render

fails = 0
def check(name, cond, extra=""):
    global fails
    if not cond: fails += 1
    print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra else ""))

CFG = {"from_name": "Peculio", "from_email": "gastos@cabrasky.net"}
EVIL = 'Hola <script>alert(1)</script> & "adiós"'

emails = {
    "reset": mail.password_reset_email("ana@x.es", "Ana <b>", "tok123"),
    "ticket": mail.support_new_ticket_email("Ana <b>", "ana@x.es", "Fallo\nBcc: evil@x.es", EVIL, "t1"),
    "ticket_reply": mail.support_new_ticket_email("Ana", "ana@x.es", "Fallo", "Sigue igual", "t1", is_reply=True),
    "reply": mail.support_reply_email("Ana", "Fallo", EVIL),
    "test": mail.smtp_test_email(),
}

for name, e in emails.items():
    html, text = render(e)
    msg = mail.build_message(CFG, "dest@x.es", e.subject, html, text)
    parts = [p.get_content_type() for p in msg.walk()]
    check(f"{name}: texto + html + logo incrustado", parts == ["multipart/alternative", "text/plain", "multipart/related", "text/html", "image/png"], str(parts))
    logo = [p for p in msg.walk() if p.get_content_type() == "image/png"][0]
    check(f"{name}: el html usa el logo por CID", f"cid:{LOGO_CID}" in html and logo["Content-ID"] == f"<{LOGO_CID}>")
    check(f"{name}: estilo nuevo (salvia y tomate), sin «Gastos App»", "#1E4D3A" in html and "#FF5A36" in html and "Gastos App" not in html + text)
    check(f"{name}: remitente Peculio", msg["From"] == "Peculio <gastos@cabrasky.net>")
    check(f"{name}: asunto en una sola línea", "\n" not in msg["Subject"] and "\r" not in msg["Subject"], repr(msg["Subject"]))

# Enlaces y escapado
html, text = render(emails["reset"])
check("reset: botón y enlace de texto al token", "https://peculio.example/reset-password?token=tok123" in html and "reset-password?token=tok123" in text)
check("reset: nombre escapado", "Ana &lt;b&gt;" in html and "<b>" not in html.split("<body")[1].split("Ana")[1][:10])
for name in ("ticket", "reply"):
    html, text = render(emails[name])
    check(f"{name}: texto del usuario escapado", "<script>" not in html and "&lt;script&gt;" in html and "&quot;adiós&quot;" in html)
    check(f"{name}: texto plano con la cita", "> Hola <script>alert(1)</script>" in text)
html, _ = render(emails["ticket"])
check("aviso al admin: enlace directo a la consulta", "https://peculio.example/admin?tab=support&amp;ticket=t1" in html)
check("aviso al admin: respuesta del usuario con otro título", render(emails["ticket_reply"])[0].count("Respuesta de Ana") >= 1)
msg = mail.build_message(CFG, "dest@x.es", emails["ticket"].subject, *render(emails["ticket"]))
check("no se pueden inyectar cabeceras desde el asunto", msg["Bcc"] is None and msg["Subject"] == "[Peculio] Soporte: Fallo Bcc: evil@x.es", repr(msg["Subject"]))

print("\n" + ("TODO OK" if fails == 0 else f"{fails} FALLARON"))
sys.exit(1 if fails else 0)
