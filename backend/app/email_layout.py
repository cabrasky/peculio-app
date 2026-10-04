"""Plantilla de los correos de Peculio (sistema visual «Salvia y tomate»).

HTML de correo: tablas y estilos en línea (lo único que respetan todos los
clientes), 560 px de ancho máximo, logo incrustado (cid:mb-logo, sin cargar nada
de fuera) y modo oscuro para los clientes que lo soportan. Sin fuentes web: se
piden Fraunces/Manrope y se cae a Georgia/Helvetica.

Cada correo se describe con `Email` y `render()` devuelve (html, texto).
"""
import re
from dataclasses import dataclass, field
from html import escape
from pathlib import Path

LOGO_CID = "mb-logo"
LOGO_PATH = Path(__file__).parent / "assets" / "email-logo.png"

# Paleta (misma que la web: frontend/src/App.css)
BG = "#F1EEE6"
SURFACE = "#FBFAF6"
SURFACE2 = "#F5F2EA"
BORDER = "#E2DDD0"
TEXT = "#14261E"
TEXT_SOFT = "#2E3F36"
MUTED = "#56645C"
FAINT = "#8C978F"
SALVIA = "#1E4D3A"
SALVIA_2 = "#2F6A51"
ON_SALVIA = "#F6F2E8"
SALVIA_MUTED = "#B4CCBF"
TOMATE = "#FF5A36"
ON_TOMATE = "#14261E"
LINK = "#B23A1C"

DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif"
BODY = "'Manrope', 'Segoe UI', Helvetica, Arial, sans-serif"


@dataclass
class Email:
    subject: str
    title: str
    eyebrow: str = ""                      # texto pequeño sobre el título (p. ej. «Soporte»)
    paragraphs: list[str] = field(default_factory=list)  # HTML propio: escapar antes los datos del usuario
    quote: str = ""                        # texto del usuario/admin: se escapa aquí
    quote_by: str = ""
    button: tuple[str, str] | None = None  # (texto, url)
    note: str = ""                         # letra pequeña bajo el botón (HTML propio)
    reason: str = ""                       # por qué recibe el correo (pie)
    preheader: str = ""                    # vista previa en la bandeja de entrada
    footer_links: list[tuple[str, str]] = field(default_factory=list)


def _text_of(html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html)
    text = re.sub(r"<[^>]+>", "", text)
    return (text.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&quot;", '"').replace("&#x27;", "'").replace("&amp;", "&"))


def render(e: Email) -> tuple[str, str]:
    """Devuelve (html, texto plano) del correo."""
    paras = "".join(
        f'<p class="mb-text" style="margin:0 0 14px;font-family:{BODY};font-size:15px;line-height:1.6;color:{TEXT_SOFT};">{p}</p>'
        for p in e.paragraphs
    )
    quote = ""
    if e.quote:
        by = (f'<p class="mb-muted" style="margin:0 0 6px;font-family:{BODY};font-size:12px;font-weight:700;'
              f'letter-spacing:.04em;text-transform:uppercase;color:{MUTED};">{escape(e.quote_by)}</p>') if e.quote_by else ""
        quote = f"""
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;">
            <tr><td class="mb-quote" style="background:{SURFACE2};border-left:3px solid {TOMATE};border-radius:10px;padding:14px 16px;">
              {by}<p class="mb-text" style="margin:0;font-family:{BODY};font-size:15px;line-height:1.6;color:{TEXT};white-space:pre-wrap;">{escape(e.quote)}</p>
            </td></tr>
          </table>"""
    button = ""
    if e.button:
        label, url = e.button
        button = f"""
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;">
            <tr><td bgcolor="{TOMATE}" style="border-radius:12px;background:{TOMATE};">
              <a href="{escape(url)}" style="display:inline-block;padding:14px 26px;font-family:{BODY};font-size:15px;font-weight:800;color:{ON_TOMATE};text-decoration:none;border-radius:12px;">{escape(label)}</a>
            </td></tr>
          </table>
          <p class="mb-muted" style="margin:0 0 14px;font-family:{BODY};font-size:12px;line-height:1.5;color:{MUTED};">
            Si el botón no funciona, copia este enlace en el navegador:<br>
            <a class="mb-link" href="{escape(url)}" style="color:{LINK};word-break:break-all;">{escape(url)}</a>
          </p>"""
    note = (f'<p class="mb-muted" style="margin:0;font-family:{BODY};font-size:13px;line-height:1.55;color:{MUTED};">{e.note}</p>'
            if e.note else "")
    eyebrow = (f'<p style="margin:0 0 6px;font-family:{BODY};font-size:12px;font-weight:800;letter-spacing:.08em;'
               f'text-transform:uppercase;color:{SALVIA_MUTED};">{escape(e.eyebrow)}</p>') if e.eyebrow else ""
    links = " &middot; ".join(
        f'<a class="mb-muted" href="{escape(url)}" style="color:{MUTED};text-decoration:underline;">{escape(label)}</a>' for label, url in e.footer_links
    )
    reason = f'<br>{e.reason}' if e.reason else ""

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{escape(e.subject)}</title>
<style>
  @media (max-width: 600px) {{
    .mb-pad {{ padding-left: 20px !important; padding-right: 20px !important; }}
    .mb-title {{ font-size: 24px !important; }}
  }}
  @media (prefers-color-scheme: dark) {{
    .mb-bg {{ background: #0F1914 !important; }}
    .mb-card {{ background: #16231C !important; border-color: #26362D !important; }}
    .mb-text {{ color: #EDE8DC !important; }}
    .mb-muted {{ color: #A3B2A9 !important; }}
    .mb-brand {{ color: #EDE8DC !important; }}
    .mb-quote {{ background: #13201A !important; }}
    .mb-link {{ color: #FF9C80 !important; }}
  }}
</style>
</head>
<body class="mb-bg" style="margin:0;padding:0;background:{BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{escape(e.preheader)}</div>
  <table role="presentation" class="mb-bg" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};">
    <tr><td align="center" style="padding:28px 12px 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;"><img src="cid:{LOGO_CID}" width="44" height="44" alt="" style="display:block;border:0;border-radius:12px;"></td>
            <td class="mb-brand" style="font-family:{DISPLAY};font-size:24px;font-weight:700;letter-spacing:-.02em;color:{TEXT};">Peculio</td>
          </tr></table>
        </td></tr>
        <tr><td class="mb-card" style="background:{SURFACE};border:1px solid {BORDER};border-radius:22px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td bgcolor="{SALVIA}" style="background:{SALVIA};border-radius:21px 21px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td class="mb-pad" style="padding:26px 32px 24px;">
                  {eyebrow}
                  <h1 class="mb-title" style="margin:0;font-family:{DISPLAY};font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-.02em;color:{ON_SALVIA};">{escape(e.title)}</h1>
                </td>
                <td width="84" valign="top" style="padding:0;">
                  <div style="width:84px;height:84px;border-radius:0 21px 0 84px;background:{TOMATE};"></div>
                </td>
              </tr></table>
            </td></tr>
            <tr><td class="mb-pad" style="padding:28px 32px 30px;">
              {paras}{quote}{button}{note}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:18px 8px 0;text-align:center;">
          <p class="mb-muted" style="margin:0;font-family:{BODY};font-size:12px;line-height:1.6;color:{FAINT};">
            Peculio &middot; control de gastos personal{reason}
          </p>
          {f'<p style="margin:6px 0 0;font-family:{BODY};font-size:12px;">{links}</p>' if links else ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    lines = [e.title, "=" * len(e.title), ""]
    for p in e.paragraphs:
        lines += [_text_of(p), ""]
    if e.quote:
        if e.quote_by:
            lines.append(f"{e.quote_by}:")
        lines += ["> " + line for line in e.quote.splitlines()] + [""]
    if e.button:
        lines += [f"{e.button[0]}: {e.button[1]}", ""]
    if e.note:
        lines += [_text_of(e.note), ""]
    lines += ["—", "Peculio · control de gastos personal"]
    if e.reason:
        lines.append(_text_of(e.reason))
    if e.footer_links:
        lines.append(" · ".join(f"{label}: {url}" for label, url in e.footer_links))
    text = "\n".join(line for line in lines).replace("\n\n\n", "\n\n")
    return html, text
