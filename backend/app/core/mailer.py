"""SMTP email sender for digest reports."""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


def smtp_configured() -> bool:
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD)


def send_html_email(to: str, subject: str, html: str, text_fallback: str = "") -> dict:
    """Send an HTML email. Returns {'ok': bool, 'error': str|None}."""
    if not smtp_configured():
        return {"ok": False, "error": "SMTP not configured (set SMTP_USER / SMTP_PASSWORD)"}
    if not to:
        return {"ok": False, "error": "No recipient address"}

    sender = settings.SMTP_FROM or settings.SMTP_USER
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.attach(MIMEText(text_fallback or "See the HTML version of this report.", "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(sender, [to], msg.as_string())
        return {"ok": True, "error": None}
    except Exception as e:
        return {"ok": False, "error": str(e)}
