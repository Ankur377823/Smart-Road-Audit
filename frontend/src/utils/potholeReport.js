import { formatCoord } from '../components/pothole/geo'
import { IRC_CLASS_LABEL, IRC_REFERENCE, ROAD_CATEGORIES, sectionRating } from '../ml/pothole/irc82'
import { POTHOLE_TREATMENT, PRIORITY_GUIDANCE, SP88_REFERENCE } from '../ml/pothole/sp88'

/**
 * Pothole fields used by the report (normalised from scanner sessions or saved audit records):
 * { severity, riskLevel, actionPriority, depthMm, depthSource, widthMm, areaM2, confidence, latitude,
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
const SEVERITY_RGB = { severe: [220, 38, 38], moderate: [217, 119, 6], minor: [37, 99, 235] }
const RISK_ORDER = { 'Very High': 0, High: 1, Medium: 2 }

function fmt(value, digits = 0) {
  return value == null ? 'N/A' : Number(value).toFixed(digits)
}

function lengthLabel(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}

/**
 * Builds the PDF. `target` is a window opened synchronously in the click handler (so mobile
 * browsers don't block it); the finished PDF is shown there, or downloaded if no window is available.
 */
export async function openPotholeReport({ title, subtitle, potholes, survey, target }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const generatedAt = new Date()
  let y = MARGIN

  const text = (str, x, yy, { size = 10, style = 'normal', color = [15, 23, 42], align } = {}) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    doc.text(String(str), x, yy, align ? { align } : undefined)
  }

  // Header
  text('Pothole Survey Report', MARGIN, y + 6, { size: 18, style: 'bold' })
  text(title, MARGIN, y + 13, { size: 11 })
  if (subtitle) text(subtitle, MARGIN, y + 18.5, { size: 9, color: [100, 116, 139] })
  text(
    `Generated ${generatedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
    A4.w - MARGIN,
    y + 6,
    { size: 8, color: [100, 116, 139], align: 'right' }
  )
  y += 25
  doc.setDrawColor(226, 232, 240)
  doc.line(MARGIN, y, A4.w - MARGIN, y)
  y += 7

  // Highest risk first (SP:88 findings are listed by priority), then larger potholes
  potholes = [...potholes].sort(
    (a, b) => (RISK_ORDER[a.riskLevel] ?? 3) - (RISK_ORDER[b.riskLevel] ?? 3) || (b.widthMm ?? 0) - (a.widthMm ?? 0)
  )

  // Summary
  const counts = { minor: 0, moderate: 0, severe: 0 }
  const priorities = { Essential: 0, 'Highly Desirable': 0, Desirable: 0 }
  potholes.forEach((p) => {
    counts[p.severity] = (counts[p.severity] || 0) + 1
    if (p.actionPriority in priorities) priorities[p.actionPriority] += 1
  })
  const section = survey ? computeSectionRating(potholes, survey) : null

  text('Summary', MARGIN, y, { size: 12, style: 'bold' })
  y += 6
  const rows = [
    ['Potholes recorded', String(potholes.length)],
    ['Size class, IRC:82 (small / medium / large)', `${counts.minor} / ${counts.moderate} / ${counts.severe}`],
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
  rows.forEach(([label, value]) => {
    text(label, MARGIN, y, { size: 9, color: [71, 85, 105] })
    text(value, A4.w - MARGIN, y, { size: 9, style: 'bold', align: 'right' })
    y += 5.5
  })
  if (section?.unmeasured) {
    text(`${section.unmeasured} pothole(s) without a measured area are excluded from the area %.`, MARGIN, y, {
      size: 7.5,
      color: [180, 83, 9],
    })
    y += 5
  }
  y += 3

  const notes = [
    `Size class per ${IRC_REFERENCE} cl. 7.5.3.4: small up to 25 mm deep, 200 mm wide; medium 25–50 mm deep, 500 mm wide; large over 50 mm deep, 500 mm wide. Where depth and width fall in different classes, the higher class is used.`,
    `Risk per ${SP88_REFERENCE} cl. 4.6 (likelihood x consequence, Table 4.2): likelihood from the size class, consequence from traffic speed (the higher of the surveyor's GPS speed and the typical speed for the road class: local 30, collector 40, arterial 60 km/h). Priority per Table 4.3: Very High = Essential, High = Highly Desirable, Medium = Desirable. SP:88 risk is a qualitative judgement; the audit team should confirm each rating.`,
    `Essential: ${PRIORITY_GUIDANCE.Essential} Highly Desirable: ${PRIORITY_GUIDANCE['Highly Desirable']}`,
    `Recommended treatment: ${POTHOLE_TREATMENT}`,
    'Depth is a visual estimate from the image unless marked "measured". Width and area are projected from camera height and tilt (approx. ±25%). Section rating per IRC:82 Tables 5.1–5.3: 1 Poor, 1.1–2 Fair, 2.1–3 Good.',
  ]
  notes.forEach((note) => {
    const lines = doc.splitTextToSize(note, A4.w - 2 * MARGIN)
    text(lines.join('\n'), MARGIN, y, { size: 7.5, color: [100, 116, 139] })
    y += lines.length * 3.4 + 0.8
  })
  y += 4

  // Pothole entries
  const IMG_W = 58
  const IMG_H = 43
  const ROW_H = IMG_H + 6

  const footer = () => {
    const page = doc.getCurrentPageInfo().pageNumber
    text(`SmartRoad Audit · ${title}`, MARGIN, A4.h - 8, { size: 7, color: [148, 163, 184] })
    text(`Page ${page}`, A4.w - MARGIN, A4.h - 8, { size: 7, color: [148, 163, 184], align: 'right' })
  }

  text('Potholes', MARGIN, y, { size: 12, style: 'bold' })
  y += 5

  potholes.forEach((p, index) => {
    if (y + ROW_H > A4.h - 14) {
      footer()
      doc.addPage()
      y = MARGIN
    }
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(MARGIN, y, A4.w - 2 * MARGIN, ROW_H - 2, 2, 2)

    // Photo, fitted inside the frame without distortion
    const ix = MARGIN + 2
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
    text(`Pothole ${index + 1}`, tx, ty, { size: 11, style: 'bold' })
    text(`${IRC_CLASS_LABEL[p.severity]} pothole`, A4.w - MARGIN - 3, ty, {
      size: 9,
      style: 'bold',
      color: SEVERITY_RGB[p.severity],
      align: 'right',
    })
    ty += 6
    const detail = [
      ['Risk / priority', p.riskLevel ? `${p.riskLevel} risk · ${p.actionPriority}` : 'Not assessed'],
      ['Depth', p.depthMm != null ? `${fmt(p.depthMm)} mm (${p.depthSource === 'measured' ? 'measured' : 'estimated'})` : 'Not available'],
      ['Width / area', `${p.widthMm != null ? `${fmt(p.widthMm)} mm` : 'N/A'} / ${p.areaM2 != null ? `${fmt(p.areaM2, 3)} m²` : 'N/A'}`],
      [
        'Coordinates',
        `${formatCoord(p.latitude, p.longitude)}${
          p.locationSource === 'gps' && p.gpsAccuracy != null ? ` (±${Math.round(p.gpsAccuracy)} m)` : p.locationSource === 'audit_center' ? ' (approx., audit centre)' : ''
        }`,
      ],
      [
        'Detected',
        `${p.detectedAt ? new Date(p.detectedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}${
          p.speedKmh != null ? ` · ${Math.round(p.speedKmh)} km/h` : ''
        } · ${Math.round(p.confidence * 100)}% confidence`,
      ],
    ]
    detail.forEach(([label, value]) => {
      text(label, tx, ty, { size: 8, color: [100, 116, 139] })
      text(value, tx + 26, ty, { size: 8.5 })
      ty += 5.6
    })
    y += ROW_H
  })

  if (!potholes.length) {
    text('No potholes recorded.', MARGIN, y + 4, { size: 10, color: [100, 116, 139] })
  }
  footer()

  const fileName = `pothole-report-${generatedAt.toISOString().slice(0, 10)}.pdf`
  if (target && !target.closed) {
    target.location.href = doc.output('bloburl', { filename: fileName })
  } else {
    doc.save(fileName)
  }
}

/**
 * Chrome on Android has no reliable in-tab PDF viewer, so there the report is downloaded instead (the
 * phone offers to open it from the download notification). Desktop and iOS browsers show it in a tab.
 */
export function canShowPdfInTab() {
  return typeof navigator === 'undefined' || !/Android/i.test(navigator.userAgent)
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
