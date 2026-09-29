const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 28;
const CONTENT_W = PAGE_W - MARGIN * 2;
import { companyInfo } from './company.js';
import { amountInWords } from './money-words.js';
import { companyLogoJpegBase64 } from './company-logo-data.js';

const TABLE_TOP = 151;
const FOOTER_TOP = 570;
const moneyFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const quantityFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const cp1252 = {
  '€':0x80,'‚':0x82,'ƒ':0x83,'„':0x84,'…':0x85,'†':0x86,'‡':0x87,'ˆ':0x88,'‰':0x89,'Š':0x8a,'‹':0x8b,'Œ':0x8c,'Ž':0x8e,
  '‘':0x91,'’':0x92,'“':0x93,'”':0x94,'•':0x95,'–':0x96,'—':0x97,'˜':0x98,'™':0x99,'š':0x9a,'›':0x9b,'œ':0x9c,'ž':0x9e,'Ÿ':0x9f
};
function logoHex() {
  const binary = atob(companyLogoJpegBase64);
  let hex = '';
  for (let i = 0; i < binary.length; i++) hex += binary.charCodeAt(i).toString(16).padStart(2, '0').toUpperCase();
  return hex;
}
const columns = [
  { key:'ref', label:'Ref.', width:40 },
  { key:'lot', label:'Lot', width:110 },
  { key:'description', label:'Désignation', width:345 },
  { key:'unit', label:'Unité', width:42 },
  { key:'quantity', label:'Qté', width:48, align:'right' },
  { key:'unitPrice', label:'PU HT', width:82, align:'right' },
  { key:'vatRate', label:'TVA %', width:45, align:'right' },
  { key:'ht', label:'Total HT', width:74, align:'right' },
];

function round3(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000; }
function amountOf(line) {
  const ht = round3((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
  const vat = round3(ht * ((Number(line.vat) || 0) / 100));
  return { ht, vat, ttc: round3(ht + vat) };
}
function numberText(value) { return quantityFormat.format(Number(value) || 0).replace(/[\u202f\u00a0]/g, ' '); }
function moneyText(value, withUnit = false) { return `${moneyFormat.format(round3(value)).replace(/[\u202f\u00a0]/g, ' ')}${withUnit ? ' DT' : ''}`; }
function cleanText(value) { return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
function winAnsiHex(value) {
  const bytes = [];
  for (const character of cleanText(value)) {
    const point = character.codePointAt(0);
    if (point <= 0x7f || (point >= 0xa0 && point <= 0xff)) bytes.push(point);
    else if (cp1252[character] !== undefined) bytes.push(cp1252[character]);
    else bytes.push(0x3f);
  }
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function approxWidth(text, size) { return [...String(text)].reduce((total, char) => total + (/[ilI.,'`|!]/.test(char) ? 0.27 : /[MW@%]/.test(char) ? 0.78 : 0.51) * size, 0); }
function textCmd(text, x, top, size = 8, color = '#263B4B', bold = false, align = 'left') {
  const value = cleanText(text);
  const width = approxWidth(value, size);
  let drawX = x;
  if (align === 'right') drawX = x - width;
  else if (align === 'center') drawX = x - width / 2;
  const y = PAGE_H - top - size * 0.9;
  const rgb = colorHex(color);
  const font = bold ? 'F2' : 'F1';
  return `BT /${font} ${size} Tf ${rgb} rg 1 0 0 1 ${drawX.toFixed(2)} ${y.toFixed(2)} Tm <${winAnsiHex(value)}> Tj ET\n`;
}
function colorHex(hex) {
  const normalized = hex.replace('#', '');
  return [0,2,4].map(i => (parseInt(normalized.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
}
function rectCmd(x, top, width, height, color) {
  return `q ${colorHex(color)} rg ${x.toFixed(2)} ${(PAGE_H - top - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q\n`;
}
function lineCmd(x1, top1, x2, top2, color = '#DCE3E2', thickness = 0.5) {
  return `q ${colorHex(color)} RG ${thickness} w ${x1.toFixed(2)} ${(PAGE_H - top1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_H - top2).toFixed(2)} l S Q\n`;
}
function polygonCmd(points, color) {
  const [first, ...rest] = points;
  const path = [first, ...rest].map(([x, top], index) => `${x.toFixed(2)} ${(PAGE_H - top).toFixed(2)} ${index === 0 ? 'm' : 'l'}`).join(' ');
  return `q ${colorHex(color)} rg ${path} h f Q\n`;
}
function estimateLogoCmd(x, top, size) {
  const scale = size / 512;
  const point = (px, py) => [x + px * scale, top + py * scale];
  let stream = rectCmd(x, top, size, size, '#18324A');
  stream += polygonCmd([point(126,78),point(332,78),point(390,136),point(390,425),point(126,425)], '#F5F6F2');
  for (const y of [190,242,294]) stream += rectCmd(x + 174*scale, top + y*scale, 146*scale, 18*scale, '#9FB8AE');
  stream += lineCmd(...point(158,360), ...point(211,413), '#3D7A68', 56*scale);
  stream += lineCmd(...point(211,413), ...point(321,305), '#3D7A68', 56*scale);
  return stream;
}
function logoImageCmd(x, top, width, height) {
  const y = PAGE_H - top - height;
  return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q\n`;
}
function wrapText(text, maxWidth, size) {
  const words = cleanText(text).split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && approxWidth(candidate, size) > maxWidth) {
      lines.push(current); current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}
function createContentPage(estimate, pageIndex, includeTableHeader = true) {
  let stream = '';
  const title = cleanText(estimate.title || 'Devis de travaux');
  stream += logoImageCmd(MARGIN, 16, 50, 41);
  const companyX = MARGIN + 60;
  stream += textCmd(companyInfo.name, companyX, 17, 10, '#18324A', true);
  stream += textCmd(`Adresse : ${companyInfo.address}`, companyX, 31, 7, '#4E626D');
  stream += textCmd(`MF : ${companyInfo.fiscalId} · Tél. : ${companyInfo.phone}`, companyX, 42, 7, '#4E626D');
  stream += textCmd(`Email : ${companyInfo.email}`, companyX, 53, 7, '#4E626D');
  stream += lineCmd(MARGIN, 66, PAGE_W - MARGIN, 66, '#DCE3E2', 0.6);
  stream += textCmd(title, MARGIN, 91, 8.5, '#3D7A68', true);
  const meta = [
    estimate.reference ? `Ref. ${estimate.reference}` : '',
    estimate.project ? `Chantier : ${estimate.project}` : '',
    estimate.client ? `Client : ${estimate.client}` : '',
    estimate.date ? `Date : ${estimate.date}` : ''
  ].filter(Boolean).join('   |   ') || 'Chantier, client et référence non renseignés';
  const metaLines = wrapText(meta, CONTENT_W, 7.5).slice(0, 2);
  let nextTop = 104;
  metaLines.forEach(line => { stream += textCmd(line, MARGIN, nextTop, 7.5, '#4E626D'); nextTop += 9; });
  if (estimate.location) {
    const locationLines = wrapText(`Lieu : ${estimate.location}`, CONTENT_W, 7).slice(0, 2);
    locationLines.forEach(line => { stream += textCmd(line, MARGIN, nextTop, 7, '#4E626D'); nextTop += 9; });
  }
  let y = TABLE_TOP;
  if (includeTableHeader) {
    stream += rectCmd(MARGIN, y, CONTENT_W, 19, '#18324A');
    let x = MARGIN;
    for (const column of columns) {
      const left = x + 4;
      const content = wrapText(column.label, column.width - 7, 6.2);
      content.slice(0, 2).forEach((line, i) => {
        const tx = column.align === 'right' ? x + column.width - 4 : left;
        stream += textCmd(line, tx, y + 6 + i * 7, 6.2, '#FFFFFF', true, column.align || 'left');
      });
      x += column.width;
    }
    y += 19;
  }
  return { stream, y };
}
function addRow(stream, line, top, index) {
  const amounts = amountOf(line);
  const size = 6.2;
  const rowValues = {
    ref: line.ref || 'Libre', lot: line.lot || 'Sans lot', description: line.description || '', unit: line.unit || '',
    quantity: numberText(line.quantity), unitPrice: moneyText(line.unitPrice), vatRate: `${numberText(line.vat)}%`,
    ht: moneyText(amounts.ht), vat: moneyText(amounts.vat), ttc: moneyText(amounts.ttc)
  };
  const cells = columns.map(column => {
    const maxWidth = column.width - 8;
    if (column.key === 'description' || column.key === 'lot') return wrapText(rowValues[column.key], maxWidth, size);
    return [rowValues[column.key]];
  });
  const lineCount = Math.max(1, ...cells.map(cell => cell.length));
  const lineHeight = 8.1;
  const rowHeight = Math.max(18, lineCount * lineHeight + 7);
  if (index % 2 === 1) stream += rectCmd(MARGIN, top, CONTENT_W, rowHeight, '#F7F9F7');
  let x = MARGIN;
  columns.forEach((column, colIndex) => {
    const lines = cells[colIndex];
    lines.forEach((value, lineIndex) => {
      const y = top + 4 + lineIndex * lineHeight;
      if (column.align === 'right') stream += textCmd(value, x + column.width - 4, y, size, column.key === 'ttc' ? '#27674F' : '#334B59', column.key === 'ttc', 'right');
      else stream += textCmd(value, x + 4, y, size, column.key === 'ref' ? '#3D7A68' : '#344C5A', column.key === 'ref');
    });
    x += column.width;
  });
  stream += lineCmd(MARGIN, top + rowHeight, MARGIN + CONTENT_W, top + rowHeight, '#E3E9E6', 0.4);
  return { stream, height: rowHeight };
}
function pageFooter(stream, page, pageCount) {
  stream += lineCmd(MARGIN, FOOTER_TOP, PAGE_W - MARGIN, FOOTER_TOP, '#DCE3E2', 0.55);
  stream += textCmd(`Page ${page} / ${pageCount}`, PAGE_W - MARGIN, FOOTER_TOP + 7, 6.5, '#75838A', false, 'right');
  return stream;
}
function summaryBlock(estimate, page) {
  let stream = '';
  let y = page.y + 7;
  let totalHt = 0, totalVat = 0, totalTtc = 0;
  for (const line of estimate.lines || []) {
    const amount = amountOf(line);
    totalHt += amount.ht; totalVat += amount.vat; totalTtc += amount.ttc;
  }
  const retentionEnabled = estimate.retentionEnabled === true;
  const retentionRate = Number(estimate.retentionRate) === 10 ? 10 : 5;
  const retention = retentionEnabled ? round3(totalTtc * retentionRate / 100) : 0;
  const netPayable = round3(totalTtc - retention);
  stream += textCmd('RÉCAPITULATIF FINANCIER', MARGIN, y, 8.5, '#18324A', true);
  y += 19;
  stream += rectCmd(MARGIN, y, CONTENT_W, 18, '#E8F0EB');
  stream += textCmd('TOTAL GÉNÉRAL HT', MARGIN + 8, y + 5, 7.5, '#18324A', true);
  stream += textCmd(moneyText(totalHt, true), PAGE_W - MARGIN - 8, y + 5, 7.5, '#18324A', true, 'right');
  y += 20;
  stream += textCmd('Montant TVA', MARGIN + 8, y + 4, 7, '#5E6C72');
  stream += textCmd(moneyText(totalVat, true), PAGE_W - MARGIN - 8, y + 4, 7, '#334B59', true, 'right');
  y += 14;
  stream += textCmd(retentionEnabled ? `Retenue de garantie (${retentionRate} % du TTC)` : 'Retenue de garantie (non appliquée)', MARGIN + 8, y + 4, 7, '#5E6C72');
  stream += textCmd(moneyText(retention, true), PAGE_W - MARGIN - 8, y + 4, 7, '#334B59', true, 'right');
  y += 14;
  stream += rectCmd(MARGIN, y, CONTENT_W, 22, '#18324A');
  stream += textCmd('TOTAL GÉNÉRAL TTC', MARGIN + 8, y + 6, 9, '#FFFFFF', true);
  stream += textCmd(moneyText(totalTtc, true), PAGE_W - MARGIN - 8, y + 6, 9, '#FFFFFF', true, 'right');
  y += 24;
  stream += rectCmd(MARGIN, y, CONTENT_W, 22, '#E8F0EB');
  stream += textCmd('NET À PAYER APRÈS RETENUE', MARGIN + 8, y + 6, 8.5, '#245E49', true);
  stream += textCmd(moneyText(netPayable, true), PAGE_W - MARGIN - 8, y + 6, 8.5, '#245E49', true, 'right');
  y += 30;
  y += 5;
  stream += textCmd('ARRÊTÉ LE PRÉSENT DEVIS À LA SOMME DE :', MARGIN + 8, y, 6.5, '#5E6C72', true);
  y += 9;
  for (const line of wrapText(amountInWords(totalTtc), CONTENT_W - 16, 7)) {
    stream += textCmd(line, MARGIN + 8, y, 7, '#334B59');
    y += 9;
  }
  y += 7;
  stream += rectCmd(MARGIN, y, CONTENT_W, 39, '#F7F9F7');
  stream += lineCmd(MARGIN + CONTENT_W / 2, y, MARGIN + CONTENT_W / 2, y + 39, '#DCE3E2', 0.5);
  stream += textCmd('Signature et cachet', MARGIN + CONTENT_W - 12, y + 8, 7, '#5E6C72', false, 'right');
  y += 39;
  return stream;
}
function buildObjects(pages) {
  const objects = [];
  const addObject = value => { objects.push(value); return objects.length; };
  const imageHex = logoHex();
  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  addObject(`<< /Type /XObject /Subtype /Image /Width 457 /Height 371 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${imageHex.length + 1} >>\nstream\n${imageHex}>\nendstream`);
  const pageRefs = [];
  for (const content of pages) {
    const stream = content;
    const streamId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageRefs.push(`${pageId} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`;
  let pdf = '%PDF-1.4\n%ELWARDIA\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}
export function buildEstimatePdf(estimate) {
  const lines = Array.isArray(estimate.lines) ? estimate.lines : [];
  const normalized = { ...estimate, lines };
  const pages = [];
  let currentPage = createContentPage(normalized, pages.length);
  for (let i = 0; i < lines.length; i++) {
    const measure = addRow('', lines[i], 0, i);
    if (currentPage.y + measure.height > FOOTER_TOP - 4) {
      pages.push(currentPage.stream);
      currentPage = createContentPage(normalized, pages.length, true);
    }
    const row = addRow('', lines[i], currentPage.y, i);
    currentPage.stream += row.stream; currentPage.y += row.height;
  }
  const summaryHeight = 250;
  if (currentPage.y + 7 + summaryHeight > FOOTER_TOP - 4) {
    pages.push(currentPage.stream);
    currentPage = createContentPage(normalized, pages.length, false);
  }
  currentPage.stream += summaryBlock(normalized, currentPage);
  pages.push(currentPage.stream);
  const totalPages = pages.length;
  return buildObjects(pages.map((stream, index) => pageFooter(stream, index + 1, totalPages)));
}
export function downloadEstimatePdf(estimate) {
  const pdf = buildEstimatePdf(estimate);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const base = (estimate.reference || estimate.title || 'devis').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'devis';
  anchor.href = objectUrl;
  anchor.download = `${base}.pdf`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
