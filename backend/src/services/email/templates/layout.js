// Layout email professionale condiviso (Fase E4). Tutte le email del sistema passano da qui per
// avere un aspetto coerente, responsive e compatibile con i client di posta.
//
// Vincoli tecnici delle email (diversi da una pagina web):
//   - Layout a TABELLE, non flexbox/grid (supporto scarso in Outlook e altri client).
//   - Stili INLINE (i <style> in <head> vengono spesso rimossi; niente CSS esterno).
//   - Nessuna risorsa esterna (immagini/font remoti): tutto autoconsistente, brand a testo.
//   - Larghezza max 600px, si adatta al mobile con width:100%.

const BRAND = process.env.EMAIL_BRAND_NAME || 'Planivo';
const PRIMARY = '#2f6f4f';
const DARK = '#1f2430';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const BG = '#f4f5f7';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Paragrafo di testo. `html` può contenere markup sicuro (es. <strong>): l'escape dei dati utente
// è responsabilità del template chiamante (che ha accesso ai dati grezzi), coerente col resto.
function paragraph(html) {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.55;color:${DARK};">${html}</p>`;
}

// Bottone call-to-action (in tabella per compatibilità Outlook). Ritorna '' se manca label/url.
function button(label, url) {
  if (!label || !url) return '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;"><tr>` +
    `<td align="center" bgcolor="${PRIMARY}" style="border-radius:8px;">` +
    `<a href="${url}" target="_blank" style="display:inline-block;padding:12px 30px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>` +
    `</td></tr></table>`
  );
}

// Coppia di bottoni affiancati (per le Email Actions della Fase E5: Accetta/Rifiuta ecc.).
// variant 'primary' verde pieno, 'danger' rosso, 'neutral' grigio.
function buttonRow(buttons) {
  const styles = {
    primary: { bg: PRIMARY, color: '#ffffff' },
    danger: { bg: '#b91c1c', color: '#ffffff' },
    neutral: { bg: '#e5e7eb', color: DARK },
  };
  const cells = (buttons || [])
    .filter((b) => b && b.label && b.url)
    .map((b) => {
      const s = styles[b.variant] || styles.primary;
      return (
        `<td style="padding:0 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
        `<td align="center" bgcolor="${s.bg}" style="border-radius:8px;">` +
        `<a href="${b.url}" target="_blank" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:${s.color};text-decoration:none;border-radius:8px;">${b.label}</a>` +
        `</td></tr></table></td>`
      );
    })
    .join('');
  if (!cells) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;"><tr>${cells}</tr></table>`;
}

// Riquadro dettagli etichetta/valore (data, orario, area, sede, ...). rows = [[label, value], ...];
// le righe con valore vuoto vengono saltate.
function detailBox(rows) {
  const valid = (rows || []).filter((r) => r && r[1] != null && r[1] !== '');
  if (!valid.length) return '';
  const trs = valid
    .map(
      ([label, value]) =>
        `<tr>` +
        `<td style="padding:7px 16px 7px 0;font-family:${FONT};font-size:14px;color:${MUTED};white-space:nowrap;vertical-align:top;">${label}</td>` +
        `<td style="padding:7px 0;font-family:${FONT};font-size:14px;color:${DARK};font-weight:600;">${value}</td>` +
        `</tr>`
    )
    .join('');
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" ` +
    `style="margin:16px 0;background:#f9fafb;border:1px solid ${BORDER};border-radius:10px;padding:6px 16px;">${trs}</table>`
  );
}

// Riquadro evidenziato (es. codice 2FA, o un messaggio importante).
function highlightBox(html) {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;">` +
    `<tr><td align="center" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:18px;` +
    `font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:2px;color:${PRIMARY};">${html}</td></tr></table>`
  );
}

// Documento email completo. contentHtml è il corpo (paragrafi/dettagli/bottoni già composti).
function renderLayout({ heading, contentHtml = '', previewText = '' }) {
  const preheader = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>`
    : '';
  return (
    `<!DOCTYPE html><html lang="it"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `</head><body style="margin:0;padding:0;background:${BG};">` +
    preheader +
    `<div style="background:${BG};padding:24px 12px;font-family:${FONT};">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">` +
    // Header brand
    `<tr><td style="background:${PRIMARY};padding:20px 32px;">` +
    `<span style="font-family:${FONT};font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">${BRAND}</span>` +
    `</td></tr>` +
    // Body
    `<tr><td style="padding:28px 32px 8px;">` +
    (heading
      ? `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:1.3;color:${DARK};">${heading}</h1>`
      : '') +
    contentHtml +
    `</td></tr>` +
    // Footer
    `<tr><td style="padding:16px 32px 28px;">` +
    `<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};border-top:1px solid ${BORDER};padding-top:16px;">` +
    `Ricevi questa email perché il tuo account è registrato su ${BRAND}. Puoi gestire le notifiche dalle impostazioni dell'app.` +
    `</p></td></tr>` +
    `</table></div></body></html>`
  );
}

module.exports = { renderLayout, paragraph, button, buttonRow, detailBox, highlightBox, BRAND };
