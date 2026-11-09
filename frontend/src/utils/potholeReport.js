import { formatCoord } from '../components/pothole/geo'
import { IRC_CLASS_LABEL, IRC_REFERENCE, ROAD_CATEGORIES, sectionRating } from '../ml/pothole/irc82'
import { POTHOLE_TREATMENT, PRIORITY_GUIDANCE, SP88_REFERENCE } from '../ml/pothole/sp88'

/**
 * Pothole fields used by the report (normalised from scanner sessions or saved audit records):
 * { number, severity, riskLevel, actionPriority, depthMm, depthSource, widthMm, areaM2, confidence, latitude,
 *   longitude, locationSource, gpsAccuracy, speedKmh, detectedAt, snapshot }
 */

/** Pothole area as % of surveyed surface and the IRC Table 5.x rating; null without a surveyed length. */
export function computeSectionRating(potholes, { lengthM, widthM, category }) {
  if (!lengthM || !widthM) return null
  const measured = potholes.filter((p) => p.areaM2 != null)
  const potholeArea = measured.reduce((sum, p) => sum + p.areaM2, 0)
  const areaPercent = (potholeArea / (lengthM * widthM)) * 100
  return {
    potholeArea,
    areaPercent,
    unmeasured: potholes.length - measured.length,
    ...sectionRating(areaPercent, category),
    ...ROAD_CATEGORIES[category],
  }
}

const A4 = { w: 210, h: 297 }
const MARGIN = 14
const CONTENT_W = A4.w - 2 * MARGIN
const BOTTOM = A4.h - 16
const SEVERITY_RGB = { severe: [220, 38, 38], moderate: [217, 119, 6], minor: [37, 99, 235] }
const RISK_RGB = { 'Very High': [220, 38, 38], High: [234, 88, 12], Medium: [202, 138, 4] }
const RISK_ORDER = { 'Very High': 0, High: 1, Medium: 2 }
const MUTED = [100, 116, 139]
const BORDER = [226, 232, 240]

function fmt(value, digits = 0) {
  return value == null ? 'N/A' : Number(value).toFixed(digits)
}

function lengthLabel(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}

function dateLabel(value) {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'
}

function mapsUrl(p) {
  return p.latitude != null && p.longitude != null ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}` : null
}

let jsPdfModule = null

/**
 * Loads the PDF library ahead of time. Each deploy renames its file and removes the old one, so a page
 * opened before a deploy (e.g. during a long scan) could no longer fetch it when the report is requested.
 */
export function preloadReportLibrary() {
  jsPdfModule ??= import('jspdf').catch((err) => {
    jsPdfModule = null
    throw err
  })
  return jsPdfModule
}

/**
 * Builds the PDF. `target` is a window opened synchronously in the click handler (so mobile
 * browsers don't block it); the finished PDF is shown there, or downloaded if no window is available.
 */
export async function openPotholeReport({ title, subtitle, potholes, survey, target }) {
  const { jsPDF } = await preloadReportLibrary().catch(() => {
    throw new Error('The app was updated since this page was opened. Save your potholes, then reload the page.')
  })
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const generatedAt = new Date()

  const text = (str, x, yy, { size = 10, style = 'normal', color = [15, 23, 42], align } = {}) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    doc.text(String(str), x, yy, align ? { align } : undefined)
  }
  const heading = (str, yy) => text(str, MARGIN, yy, { size: 12, style: 'bold' })
  /** Starts a new page when `height` mm doesn't fit; returns the y to draw at. */
  const ensureSpace = (yy, height) => {
    if (yy + height <= BOTTOM) return yy
    doc.addPage()
    return MARGIN + 4
  }

  // Header band
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, A4.w, 30, 'F')
  text('Pothole Survey Report', MARGIN, 13, { size: 18, style: 'bold', color: [255, 255, 255] })
  text(title, MARGIN, 20, { size: 10.5, color: [226, 232, 240] })
  if (subtitle) text(subtitle, MARGIN, 25.5, { size: 8, color: [148, 163, 184] })
  text('SmartRoad Audit', A4.w - MARGIN, 13, { size: 9, style: 'bold', color: [255, 255, 255], align: 'right' })
  text(`Generated ${dateLabel(generatedAt)}`, A4.w - MARGIN, 20, { size: 9, color: [226, 232, 240], align: 'right' })
  let y = 40

  // Highest risk first (SP:88 findings are listed by priority), then larger potholes.
  // `number` keeps the pothole's number from the app so the report matches the screen.
  potholes = potholes
    .map((p, i) => ({ ...p, number: p.number ?? i + 1 }))
    .sort((a, b) => (RISK_ORDER[a.riskLevel] ?? 3) - (RISK_ORDER[b.riskLevel] ?? 3) || (b.widthMm ?? 0) - (a.widthMm ?? 0))

  const counts = { minor: 0, moderate: 0, severe: 0 }
  const priorities = { Essential: 0, 'Highly Desirable': 0, Desirable: 0 }
  potholes.forEach((p) => {
    counts[p.severity] = (counts[p.severity] || 0) + 1
    if (p.actionPriority in priorities) priorities[p.actionPriority] += 1
  })
  const section = survey ? computeSectionRating(potholes, survey) : null

  // Summary tiles
  heading('Summary', y)
  y += 4
  const tiles = [
    ['Potholes', potholes.length, [15, 23, 42]],
    ['Large', counts.severe, SEVERITY_RGB.severe],
    ['Medium', counts.moderate, SEVERITY_RGB.moderate],
    ['Small', counts.minor, SEVERITY_RGB.minor],
    ['Essential repairs', priorities.Essential, RISK_RGB['Very High']],
  ]
  const gap = 3
  const tileW = (CONTENT_W - gap * (tiles.length - 1)) / tiles.length
  tiles.forEach(([label, value, color], i) => {
    const x = MARGIN + i * (tileW + gap)
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(...BORDER)
    doc.roundedRect(x, y, tileW, 18, 2, 2, 'FD')
    doc.setFillColor(...color)
    doc.rect(x, y + 2, 1.2, 14, 'F')
    text(value, x + tileW / 2, y + 9, { size: 15, style: 'bold', color, align: 'center' })
    text(label, x + tileW / 2, y + 14.5, { size: 7.5, color: MUTED, align: 'center' })
  })
  y += 25

  // Key figures
  const rows = [
    [
      'Priority, IRC:SP:88 (essential / highly desirable / desirable)',
      `${priorities.Essential} / ${priorities['Highly Desirable']} / ${priorities.Desirable}`,
    ],
    ['Total pothole area', section ? `${section.potholeArea.toFixed(2)} m²` : 'N/A'],
  ]
  if (section) {
    rows.push(
      ['Surveyed surface', `${lengthLabel(survey.lengthM)} × ${survey.widthM} m carriageway`],
      ['Pothole area (% of surveyed surface)', `${section.areaPercent.toFixed(3)} %`],
      [`Pothole rating, ${section.label} (${section.table})`, `${section.rating} – ${section.condition}`]
    )
  } else {
    rows.push(['Section rating (IRC Tables 5.1–5.3)', 'Not available: surveyed length unknown'])
  }
  rows.forEach(([label, value], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(MARGIN, y - 3.8, CONTENT_W, 5.6, 'F')
    }
    text(label, MARGIN + 2, y, { size: 9, color: [71, 85, 105] })
    text(value, A4.w - MARGIN - 2, y, { size: 9, style: 'bold', align: 'right' })
    y += 5.6
  })
  if (section?.unmeasured) {
    text(`${section.unmeasured} pothole(s) without a measured area are excluded from the area %.`, MARGIN, y + 1, {
      size: 7.5,
      color: [180, 83, 9],
    })
    y += 5
  }
  y += 6

  // Repair priority list: one line per pothole, for planning the repair work
  if (potholes.length) {
    const cols = [
      ['#', 0],
      ['Size class', 10],
      ['Risk', 32],
      ['Priority', 54],
      ['Depth', 88],
      ['Width', 106],
      ['Area', 124],
      ['Location', 142],
    ]
    const tableHeader = (yy) => {
      doc.setFillColor(241, 245, 249)
      doc.rect(MARGIN, yy - 4, CONTENT_W, 6, 'F')
      cols.forEach(([label, x]) => text(label, MARGIN + 2 + x, yy, { size: 7.5, style: 'bold', color: [71, 85, 105] }))
      return yy + 6
    }
    y = ensureSpace(y, 20)
    heading('Repair priority list', y)
    y = tableHeader(y + 6)
    potholes.forEach((p) => {
      if (y + 5 > BOTTOM) {
        doc.addPage()
        y = tableHeader(MARGIN + 4)
      }
      const cells = [
        String(p.number),
        IRC_CLASS_LABEL[p.severity] || p.severity,
        p.riskLevel || '–',
        p.actionPriority || '–',
        p.depthMm != null ? `${fmt(p.depthMm)} mm` : 'N/A',
        p.widthMm != null ? `${fmt(p.widthMm)} mm` : 'N/A',
        p.areaM2 != null ? `${fmt(p.areaM2, 3)} m²` : 'N/A',
        formatCoord(p.latitude, p.longitude),
      ]
      cells.forEach((cell, i) => {
        const color = i === 1 ? SEVERITY_RGB[p.severity] : i === 2 ? RISK_RGB[p.riskLevel] : undefined
        text(cell, MARGIN + 2 + cols[i][1], y, { size: 7.5, style: i < 3 ? 'bold' : 'normal', color })
      })
      const url = mapsUrl(p)
      if (url) doc.link(MARGIN + 2 + cols[7][1], y - 3, CONTENT_W - cols[7][1] - 2, 4, { url })
      doc.setDrawColor(241, 245, 249)
      doc.line(MARGIN, y + 1.6, A4.w - MARGIN, y + 1.6)
      y += 5
    })
    y += 7
  }

  // Pothole details with photos
  const IMG_W = 58
  const IMG_H = 43
  const ROW_H = IMG_H + 6

  y = ensureSpace(y, ROW_H + 8)
  heading('Pothole details', y)
  y += 5

  potholes.forEach((p) => {
    y = ensureSpace(y, ROW_H)
    doc.setDrawColor(...BORDER)
    doc.roundedRect(MARGIN, y, CONTENT_W, ROW_H - 2, 2, 2)
    doc.setFillColor(...(SEVERITY_RGB[p.severity] || MUTED))
    doc.rect(MARGIN, y + 3, 1.2, ROW_H - 8, 'F')

    // Photo, fitted inside the frame without distortion
    const ix = MARGIN + 3
    const iy = y + 2
    doc.setFillColor(241, 245, 249)
    doc.rect(ix, iy, IMG_W, IMG_H, 'F')
    if (p.snapshot) {
      try {
        const props = doc.getImageProperties(p.snapshot)
        const scale = Math.min(IMG_W / props.width, IMG_H / props.height)
        const w = props.width * scale
        const h = props.height * scale
        doc.addImage(p.snapshot, 'JPEG', ix + (IMG_W - w) / 2, iy + (IMG_H - h) / 2, w, h)
      } catch {
        text('Photo unavailable', ix + IMG_W / 2, iy + IMG_H / 2, { size: 7, color: [148, 163, 184], align: 'center' })
      }
    } else {
      text('No photo', ix + IMG_W / 2, iy + IMG_H / 2, { size: 7, color: [148, 163, 184], align: 'center' })
    }

    const tx = ix + IMG_W + 5
    let ty = y + 7
    text(`Pothole ${p.number}`, tx, ty, { size: 11, style: 'bold' })
    text(`${IRC_CLASS_LABEL[p.severity]} pothole`, A4.w - MARGIN - 3, ty, {
      size: 9,
      style: 'bold',
      color: SEVERITY_RGB[p.severity],
      align: 'right',
    })
    ty += 6
    const location = `${formatCoord(p.latitude, p.longitude)}${
      p.locationSource === 'gps' && p.gpsAccuracy != null
        ? ` (±${Math.round(p.gpsAccuracy)} m)`
        : p.locationSource === 'audit_center'
          ? ' (approx., audit centre)'
          : ''
    }`
    const detail = [
      ['Risk / priority', p.riskLevel ? `${p.riskLevel} risk · ${p.actionPriority}` : 'Not assessed', RISK_RGB[p.riskLevel]],
      ['Depth', p.depthMm != null ? `${fmt(p.depthMm)} mm (${p.depthSource === 'measured' ? 'measured' : 'estimated'})` : 'Not available'],
      ['Width / area', `${p.widthMm != null ? `${fmt(p.widthMm)} mm` : 'N/A'} / ${p.areaM2 != null ? `${fmt(p.areaM2, 3)} m²` : 'N/A'}`],
      ['Coordinates', location],
      [
        'Detected',
        `${dateLabel(p.detectedAt)}${p.speedKmh != null ? ` · ${Math.round(p.speedKmh)} km/h` : ''}${
          p.confidence != null ? ` · ${Math.round(p.confidence * 100)}% confidence` : ''
        }`,
      ],
    ]
    detail.forEach(([label, value, color]) => {
      text(label, tx, ty, { size: 8, color: MUTED })
      text(value, tx + 26, ty, { size: 8.5, style: color ? 'bold' : 'normal', color })
      ty += 5.6
    })
    const url = mapsUrl(p)
    if (url) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(37, 99, 235)
      doc.textWithLink('Open in Google Maps', tx + 26, ty, { url })
    }
    y += ROW_H
  })

  if (!potholes.length) {
    text('No potholes recorded.', MARGIN, y + 4, { size: 10, color: MUTED })
    y += 10
  }

  // Methodology
  const notes = [
    `Size class per ${IRC_REFERENCE} cl. 7.5.3.4: small up to 25 mm deep, 200 mm wide; medium 25–50 mm deep, 500 mm wide; large over 50 mm deep, 500 mm wide. Where depth and width fall in different classes, the higher class is used.`,
    `Risk per ${SP88_REFERENCE} cl. 4.6 (likelihood x consequence, Table 4.2): likelihood from the size class, consequence from traffic speed (the higher of the surveyor's GPS speed and the typical speed for the road class: local 30, collector 40, arterial 60 km/h). Priority per Table 4.3: Very High = Essential, High = Highly Desirable, Medium = Desirable. SP:88 risk is a qualitative judgement; the audit team should confirm each rating.`,
    `Essential: ${PRIORITY_GUIDANCE.Essential} Highly Desirable: ${PRIORITY_GUIDANCE['Highly Desirable']} Desirable: ${PRIORITY_GUIDANCE.Desirable}`,
    `Recommended treatment: ${POTHOLE_TREATMENT}`,
    'Depth is a visual estimate from the image unless marked "measured". Width and area are projected from camera height and tilt (approx. ±25%). Section rating per IRC:82 Tables 5.1–5.3: 1 Poor, 1.1–2 Fair, 2.1–3 Good.',
  ]
  const noteLines = notes.map((note) => doc.splitTextToSize(note, CONTENT_W))
  y = ensureSpace(y + 4, 14)
  heading('Methodology & recommended treatment', y)
  y += 6
  noteLines.forEach((lines) => {
    y = ensureSpace(y, lines.length * 3.4)
    text(lines.join('\n'), MARGIN, y, { size: 7.5, color: MUTED })
    y += lines.length * 3.4 + 1.2
  })

  // Footer on every page, once the page count is known
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.setDrawColor(...BORDER)
    doc.line(MARGIN, A4.h - 12, A4.w - MARGIN, A4.h - 12)
    text(`SmartRoad Audit · ${title}`, MARGIN, A4.h - 8, { size: 7, color: [148, 163, 184] })
    text(`Generated ${dateLabel(generatedAt)} · Page ${page} of ${pageCount}`, A4.w - MARGIN, A4.h - 8, {
      size: 7,
      color: [148, 163, 184],
      align: 'right',
    })
  }

  // Local date and time, so several reports from one day get distinct names
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())}_${pad(generatedAt.getHours())}${pad(generatedAt.getMinutes())}`
  const fileName = `pothole-report-${stamp}.pdf`
  if (target && !target.closed) {
    target.location.href = doc.output('bloburl', { filename: fileName })
  } else {
    doc.save(fileName)
  }
}

/** Opens a placeholder tab synchronously (inside the click) so the PDF can be shown when ready. */
export function openReportWindow() {
  const win = window.open('', '_blank')
  if (win) {
    win.document.title = 'Generating report…'
    win.document.body.style.fontFamily = 'system-ui, sans-serif'
    win.document.body.textContent = 'Generating pothole report…'
  }
  return win
}
