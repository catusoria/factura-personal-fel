/* ══════════════════════════════════════════
   app.js  —  Impresor FEL Guatemala
   Lógica de parseo XML, controles de UI
   y personalización de la factura
══════════════════════════════════════════ */

'use strict';

// ════════════════════════════════
//  CARGA DE ARCHIVO XML
// ════════════════════════════════

document.getElementById('xmlFile').addEventListener('change', function (e) {
  const f = e.target.files[0];
  if (!f) return;
  readXML(f, f.name);
});

/**
 * Lee el archivo XML y llama al parser.
 * @param {File} file
 * @param {string} name  Nombre del archivo para mostrar en la UI
 */
function readXML(file, name) {
  const reader = new FileReader();
  reader.onload = ev => parseXML(ev.target.result, name);
  reader.readAsText(file, 'UTF-8');
}

// ════════════════════════════════
//  PARSEO XML FEL SAT Guatemala
// ════════════════════════════════

/**
 * Parsea el XML FEL y rellena la vista previa de la factura.
 * @param {string} str  Contenido del XML como string
 * @param {string} name Nombre del archivo
 */
function parseXML(str, name) {
  const doc = new DOMParser().parseFromString(str, 'text/xml');
  const NS  = 'http://www.sat.gob.gt/dte/fel/0.2.0';

  // Helpers
  const g = (parent, tag) => parent.getElementsByTagNameNS(NS, tag)[0];
  const a = (el, key)     => el ? (el.getAttribute(key) || '') : '';
  const t = el             => el ? el.textContent.trim() : '';

  // Nodos principales
  const dg   = g(doc, 'DatosGenerales');
  const em   = g(doc, 'Emisor');
  const de   = g(doc, 'DireccionEmisor');
  const rec  = g(doc, 'Receptor');
  const dr   = g(doc, 'DireccionReceptor');
  const cer  = g(doc, 'Certificacion');
  const na   = g(doc, 'NumeroAutorizacion');
  const tots = g(doc, 'Totales');
  const frs  = doc.getElementsByTagNameNS(NS, 'Frase');
  const its  = doc.getElementsByTagNameNS(NS, 'Item');

  // ── Emisor ──
  const custName = document.getElementById('custName').value.trim();
  set('inv-company-name', custName || a(em, 'NombreComercial') || a(em, 'NombreEmisor'));
  set('inv-company-legal', a(em, 'NombreEmisor'));
  set('inv-nit-emisor', a(em, 'NITEmisor') ? 'NIT: ' + a(em, 'NITEmisor') : '');

  const correo = a(em, 'CorreoEmisor');
  set('inv-correo-emisor', correo ? '· ' + correo : '');

  const dirEm = [t(g(de, 'Direccion')), t(g(de, 'Municipio')), t(g(de, 'Departamento'))]
    .filter(Boolean).join(', ');
  set('inv-dir-emisor', dirEm);

  // ── Badge (tipo de documento) ──
  set('inv-doc-type', tipoLabel(a(dg, 'Tipo')));
  const serie = na ? a(na, 'Serie') : '';
  const numN  = na ? a(na, 'Numero') : '';
  set('inv-doc-num', 'No. ' + numN + (serie ? '\nSerie: ' + serie : ''));
  set('inv-fecha-val', fmtDate(a(dg, 'FechaHoraEmision')));

  // ── Receptor ──
  set('inv-nombre-receptor', a(rec, 'NombreReceptor'));
  set('inv-nit-receptor', a(rec, 'IDReceptor'));
  const dirRec = [t(g(dr, 'Direccion')), t(g(dr, 'Municipio')), t(g(dr, 'Departamento'))]
    .filter(Boolean).join(', ');
  set('inv-dir-receptor', dirRec);

  // ── Ítems ──
  const tbody  = document.getElementById('inv-tbody');
  tbody.innerHTML = '';
  let subtotal = 0;

  Array.from(its).forEach(item => {
    const cant = parseFloat(t(g(item, 'Cantidad')))      || 0;
    const desc = t(g(item, 'Descripcion'));
    const pu   = parseFloat(t(g(item, 'PrecioUnitario'))) || 0;
    const dsc  = parseFloat(t(g(item, 'Descuento')))      || 0;
    const tot  = parseFloat(t(g(item, 'Total')))           || 0;
    subtotal  += tot;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="tcenter">${cant % 1 === 0 ? cant : cant.toFixed(2)}</td>
      <td>${esc(desc)}</td>
      <td class="tright col-pu">${fmt(pu)}</td>
      <td class="tright col-desc">${fmt(dsc)}</td>
      <td class="tright">${fmt(tot)}</td>`;
    tbody.appendChild(tr);
  });

  // ── Totales ──
  const gran = tots ? (parseFloat(t(g(tots, 'GranTotal'))) || subtotal) : subtotal;
  set('inv-gran-total', 'Q ' + gran.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  set('inv-total-letras', numToWords(Math.round(gran)) + ' QUETZALES');

  // ── Certificación ──
  const authFull   = na ? t(na) : '';
  set('inv-auth-line', 'Autorización: ' + authFull);

  const certNombre = cer ? t(g(cer, 'NombreCertificador')) : '';
  const certNit    = cer ? t(g(cer, 'NITCertificador'))    : '';
  set('inv-cert-line', [certNombre, certNit ? 'Nit: ' + certNit : ''].filter(Boolean).join(' '));

  // ── Frases / leyenda fiscal ──
  const tipoDoc = a(dg, 'Tipo');
  let phraseText;

  if (tipoDoc === 'FPEQ') {
    // Pequeño contribuyente: siempre esta leyenda
    phraseText = 'No genera derecho a crédito fiscal';
  } else {
    const pmap = {
      '1': 'Sujeto a pagos trimestrales ISR',
      '2': 'Retención definitiva ISR',
      '3': 'Agente de Retención IVA',
      '4': 'Exento IVA'
    };
    const ptxts = Array.from(frs).map(f => pmap[f.getAttribute('TipoFrase')] || '');
    phraseText = ptxts.filter(Boolean).join(' · ') || '';
  }
  set('inv-phrase-cert', phraseText);

  // ── QR de certificación ──
  if (authFull) generateQR(authFull);

  // ── Mostrar factura ──
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('invoice').style.display     = 'flex';
  document.getElementById('upload-lbl').textContent    = '✔ ' + name;

  // Re-aplicar visibilidad de columnas
  togCols('col-pu',   document.getElementById('tPU'));
  togCols('col-desc', document.getElementById('tDesc'));
}

// ════════════════════════════════
//  QR CODE
// ════════════════════════════════

/**
 * Genera el QR del número de autorización usando qrserver.com
 * @param {string} data  Texto a codificar (UUID de autorización)
 */
function generateQR(data) {
  const qImg = document.getElementById('inv-qr-img');
  const qPh  = document.getElementById('inv-qr-ph');
  qImg.onload  = () => { qImg.style.display = 'block'; qPh.style.display = 'none';  };
  qImg.onerror = () => { qImg.style.display = 'none';  qPh.style.display = 'flex';  };
  qImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=' + encodeURIComponent(data);
}

// ════════════════════════════════
//  HELPERS
// ════════════════════════════════

/** Asigna textContent a un elemento por ID */
function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val || '';
}

/** Formatea número con 2 decimales en locale guatemalteco */
function fmt(n) {
  return n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Escapa caracteres HTML especiales */
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Formatea fecha ISO a dd-mm-yyyy */
function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    return String(d.getDate()).padStart(2, '0') + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           d.getFullYear();
  } catch { return raw; }
}

/** Devuelve la etiqueta legible del tipo de documento FEL */
function tipoLabel(tp) {
  const map = {
    'FACT': 'Factura',
    'FPEQ': 'Factura Pequeño Contribuyente',
    'FCAM': 'Factura Cambiaria',
    'FESC': 'Factura Especial',
    'NABN': 'Nota de Abono',
    'NDEB': 'Nota de Débito',
    'NCRE': 'Nota de Crédito',
    'RECI': 'Recibo'
  };
  return map[tp] || tp;
}

/**
 * Convierte número entero a palabras en español (mayúsculas).
 * Soporta hasta 999,999,999.
 * @param {number} n
 * @returns {string}
 */
function numToWords(n) {
  if (isNaN(n) || n < 0) return '';
  if (n === 0) return 'CERO';

  const ones  = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
                  'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE',
                  'DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
  const tens  = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const hunds = ['','CIEN','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
                 'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];

  if (n >= 1000000) {
    return numToWords(Math.floor(n / 1000000)) + ' MILLÓN(ES)' +
           (n % 1000000 ? ' ' + numToWords(n % 1000000) : '');
  }
  if (n >= 1000) {
    const m = Math.floor(n / 1000);
    return (m === 1 ? 'MIL' : numToWords(m) + ' MIL') +
           (n % 1000 ? ' ' + numToWords(n % 1000) : '');
  }
  if (n >= 100) {
    return hunds[Math.floor(n / 100)] + (n % 100 ? ' ' + numToWords(n % 100) : '');
  }
  if (n >= 20) {
    return tens[Math.floor(n / 10)] + (n % 10 ? ' Y ' + ones[n % 10] : '');
  }
  return ones[n];
}

// ════════════════════════════════
//  CONTROLES DE UI
// ════════════════════════════════

/** Cambia el tamaño del papel */
function setSize(sz, btn) {
  btn.closest('.btns3').querySelectorAll('.sb-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('inv-wrap').className = 'pw-' + sz;
}

/** Cambia la posición del logo (left | center | right) */
function setLogoPos(pos, btn) {
  btn.closest('.btns3').querySelectorAll('.sb-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('ih-top').className = 'ih-top lp-' + pos;
  const comp = document.getElementById('ih-company');
  comp.className = 'ih-company' + (pos === 'center' ? ' centered' : '');
}

// ── Colores ──

/**
 * Vincula un color picker + input hex a una variable CSS.
 * @param {string} pickId  ID del input[type=color]
 * @param {string} hexId   ID del input[type=text] con el hex
 * @param {string} cssVar  Variable CSS a modificar (ej. '--inv-text')
 */
function bindColor(pickId, hexId, cssVar) {
  const pick  = document.getElementById(pickId);
  const hex   = document.getElementById(hexId);
  const apply = v => document.documentElement.style.setProperty(cssVar, v);

  pick.addEventListener('input', () => { hex.value = pick.value; apply(pick.value); });
  hex.addEventListener('input',  () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
      pick.value = hex.value;
      apply(hex.value);
    }
  });
}

bindColor('cText',   'cTextHex',   '--inv-text');
bindColor('cAccent', 'cAccentHex', '--inv-accent');
bindColor('cBg',     'cBgHex',     '--inv-bg');

// ── Tipografía ──
document.getElementById('fontSel').addEventListener('change', function () {
  document.documentElement.style.setProperty('--inv-font', this.value);
});

document.getElementById('fontSz').addEventListener('input', function () {
  document.getElementById('fontSzVal').textContent = this.value + 'pt';
  document.documentElement.style.setProperty('--inv-font-size', this.value + 'pt');
});

// ── Toggles de visibilidad ──

/** Muestra/oculta un elemento por ID */
function togId(id, cb) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('inv-hidden', !cb.checked);
}

/** Muestra/oculta todas las celdas de una columna por clase */
function togCols(cls, cb) {
  document.querySelectorAll('.' + cls)
    .forEach(el => el.classList.toggle('col-hidden', !cb.checked));
}

// ── Carga de logo ──
document.getElementById('logoFile').addEventListener('change', function (e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const src = ev.target.result;
    document.getElementById('logo-prev').src    = src;
    document.getElementById('logo-prev').style.display = 'block';
    const img = document.getElementById('inv-logo-img');
    img.src = src;
    img.style.display = 'block';
  };
  reader.readAsDataURL(f);
});

// ── Nombre comercial personalizado ──
document.getElementById('custName').addEventListener('input', function () {
  const el = document.getElementById('inv-company-name');
  if (el && el.textContent !== '—') el.textContent = this.value || el.textContent;
});

// ── Notas adicionales ──
document.getElementById('notasExtra').addEventListener('input', function () {
  const n = document.getElementById('inv-notes');
  n.textContent = this.value;
  n.classList.toggle('inv-hidden', !this.value.trim());
});

// ════════════════════════════════
//  DRAG & DROP sobre zona de carga
// ════════════════════════════════
const dz = document.getElementById('dropzone');

dz.addEventListener('dragover',  e => { e.preventDefault(); dz.style.borderColor = '#b8962e'; });
dz.addEventListener('dragleave', ()  => { dz.style.borderColor = ''; });
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.style.borderColor = '';
  const f = e.dataTransfer.files[0];
  if (f && f.name.endsWith('.xml')) readXML(f, f.name);
});

// ════════════════════════════════
//  ESTADO INICIAL
// ════════════════════════════════
// Columna descuento oculta por defecto
document.querySelectorAll('.col-desc').forEach(el => el.classList.add('col-hidden'));
