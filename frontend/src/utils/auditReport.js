import { formatCoord } from '../components/pothole/geo'
import { getAudit, getAuditChecklist, getAuditSegments } from '../services/api'
import { getRiskContributions } from './auditRisk'
import { preloadReportLibrary } from './potholeReport'

/**
 * Road-safety screening report for one audit, laid out like the pothole report.
 * Segments carry `contributions` (the five factor scores shown on the audit page):
 * [{ label, value, maximum, detail }].
 */

const A4 = { w: 210, h: 297 }
const MARGIN = 14
const CONTENT_W = A4.w - 2 * MARGIN
const BOTTOM = A4.h - 16
const RISK_RGB = { critical: [220, 38, 38], high: [234, 88, 12], medium: [202, 138, 4], low: [22, 163, 74] }
const RISK_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
const STATUS_RGB = { pass: [22, 163, 74], fail: [220, 38, 38], flagged: [220, 38, 38], review: [37, 99, 235] }
const PENDING_RGB = [217, 119, 6]
const MUTED = [100, 116, 139]
const BORDER = [226, 232, 240]

const TERRAIN_GROUP = { plain: 'Plain / rolling', rolling: 'Plain / rolling', mountainous: 'Mountainous / steep', steep: 'Mountainous / steep' }

function fmt(value, digits = 0) {
  return value == null || !Number.isFinite(Number(value)) ? 'N/A' : Number(value).toFixed(digits)
}

function lengthLabel(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}

function dateLabel(value) {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '–'
}

/** Loads an audit with its segments and checklist, then builds its report (for list pages). */
export async function openAuditReportById(auditId, target) {
  const [audit, segments, checklist] = await Promise.all([
    getAudit(auditId),
    getAuditSegments(auditId),
    getAuditChecklist(auditId),
  ])
  await openAuditReport({
    audit,
    segments: (segments || []).map((segment) => ({ ...segment, contributions: getRiskContributions(segment) })),
    checklist: checklist || [],
    target,
  })
}

/**
 * Builds the PDF. `target` is a window opened synchronously in the click handler (so mobile
 * browsers don't block it); the finished PDF is shown there, or downloaded if no window is available.
 */
export async function openAuditReport({ audit, segments, checklist, target }) {
  const { jsPDF } = await preloadReportLibrary().catch(() => {
    throw new Error('The app was updated since this page was opened. Reload the page and try again.')
  })
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const generatedAt = new Date()
  const title = `Audit #${audit.id} · ${audit.location_name || 'Road audit'}`

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
  /** First line of `value` that fits in `width` mm at the current font, with an ellipsis if cut. */
  const fit = (value, width, size) => {
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(String(value), width)
    return lines.length > 1 ? `${lines[0].replace(/\s+\S*$/, '')}…` : lines[0] || ''
  }

  // Header band
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, A4.w, 30, 'F')
  text('Road Safety Audit Report', MARGIN, 13, { size: 18, style: 'bold', color: [255, 255, 255] })
  text(title, MARGIN, 20, { size: 10.5, color: [226, 232, 240] })
  if (audit.location_address) {
    text(fit(audit.location_address, 120, 8), MARGIN, 25.5, { size: 8, color: [148, 163, 184] })
  }
  text('SmartRoad Audit', A4.w - MARGIN, 13, { size: 9, style: 'bold', color: [255, 255, 255], align: 'right' })
  text(`Generated ${dateLabel(generatedAt)}`, A4.w - MARGIN, 20, { size: 9, color: [226, 232, 240], align: 'right' })
  let y = 40

  // Highest risk first, so the segments that need attention lead the report
  segments = [...segments].sort(
    (a, b) =>
      (RISK_ORDER[a.risk_level?.toLowerCase()] ?? 4) - (RISK_ORDER[b.risk_level?.toLowerCase()] ?? 4) ||
      (b.risk_score ?? 0) - (a.risk_score ?? 0)
  )

  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  segments.forEach((s) => {
    const level = s.risk_level?.toLowerCase()
    if (level in counts) counts[level] += 1
  })
  const scores = segments.map((s) => s.risk_score).filter((s) => typeof s === 'number')
  const averageRisk = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null
  const totalLength = segments.reduce((sum, s) => sum + (Number(s.length_m) || 0), 0)

  const status = { pass: 0, review: 0, flagged: 0, fail: 0, pending: 0 }
  let fieldChecks = 0
  checklist.forEach((item) => {
    const s = item.status?.toLowerCase()
    status[s in status ? s : 'pending'] += 1
    if (item.field_verification_required) fieldChecks += 1
  })

  // Summary tiles
  heading('Summary', y)
  y += 4
  const tiles = [
    ['Segments', segments.length, [15, 23, 42]],
    ['Critical', counts.critical, RISK_RGB.critical],
    ['High', counts.high, RISK_RGB.high],
    ['Medium', counts.medium, RISK_RGB.medium],
    ['Low', counts.low, RISK_RGB.low],
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
  const terrain = audit.terrain_class
    ? `${TERRAIN_GROUP[audit.terrain_class] || capitalize(audit.terrain_class)} (IRC class: ${audit.terrain_class}${
        audit.terrain_cross_slope_percent != null ? `, ${audit.terrain_cross_slope_percent}% cross slope` : ''
      })`
    : 'Not classified'
  const rows = [
    ['Average segment risk (0–100)', averageRisk != null ? `${averageRisk.toFixed(1)} / 100` : 'N/A'],
    ['Audit centre', formatCoord(audit.center_lat, audit.center_lng)],
    ['Audit radius / road class', `${lengthLabel(audit.radius_m)} / ${capitalize(audit.road_class)}`],
    ['Terrain', terrain],
    ['Road length screened', totalLength ? lengthLabel(totalLength) : 'N/A'],
    ['Compliance score', audit.compliance_score != null ? fmt(audit.compliance_score, 1) : 'N/A'],
    [
      'Checklist (pass / review / flagged / fail / pending)',
      `${status.pass} / ${status.review} / ${status.flagged} / ${status.fail} / ${status.pending}`,
    ],
    ['Checks needing a site visit', String(fieldChecks)],
  ]
  rows.forEach(([label, value], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(MARGIN, y - 3.8, CONTENT_W, 5.6, 'F')
    }
    text(label, MARGIN + 2, y, { size: 9, color: [71, 85, 105] })
    text(value, A4.w - MARGIN - 2, y, { size: 9, style: 'bold', align: 'right' })
    if (i === 1 && audit.center_lat != null && audit.center_lng != null) {
      doc.link(A4.w - MARGIN - 60, y - 3.5, 58, 4.5, { url: `https://www.google.com/maps?q=${audit.center_lat},${audit.center_lng}` })
    }
    y += 5.6
  })
  y += 6

  // Segment risk list: one line per segment, for planning site visits
  if (segments.length) {
    const cols = [
      ['Segment', 0],
      ['Road', 20],
      ['Length', 64],
      ['Gradient', 79],
      ['Curve', 94],
      ['Speed', 108],
      ['Traffic', 124],
      ['Pedestrians', 140],
      ['Score', 158],
      ['Risk', 169],
    ]
    const tableHeader = (yy) => {
      doc.setFillColor(241, 245, 249)
      doc.rect(MARGIN, yy - 4, CONTENT_W, 6, 'F')
      cols.forEach(([label, x]) => text(label, MARGIN + 2 + x, yy, { size: 7.5, style: 'bold', color: [71, 85, 105] }))
      return yy + 6
    }
    y = ensureSpace(y, 20)
    heading('Segment risk list', y)
    y = tableHeader(y + 6)
    segments.forEach((s) => {
      if (y + 5 > BOTTOM) {
        doc.addPage()
        y = tableHeader(MARGIN + 4)
      }
      const level = s.risk_level?.toLowerCase()
      const cells = [
        s.segment_code || '–',
        fit(s.road_name || 'Unnamed road', 44, 7.5),
        s.length_m != null ? `${fmt(s.length_m)} m` : 'N/A',
        s.gradient != null ? `${s.gradient}%` : 'N/A',
        s.curve_radius != null ? `${fmt(s.curve_radius)} m` : '–',
        s.operating_speed != null ? `${fmt(s.operating_speed)} km/h` : 'N/A',
        capitalize(s.traffic_level),
        capitalize(s.pedestrian_activity),
        typeof s.risk_score === 'number' ? s.risk_score.toFixed(1) : '–',
        capitalize(level),
      ]
      cells.forEach((cell, i) => {
        const color = i === 9 || i === 8 ? RISK_RGB[level] : undefined
        text(cell, MARGIN + 2 + cols[i][1], y, { size: 7.5, style: i === 0 || i >= 8 ? 'bold' : 'normal', color })
      })
      doc.setDrawColor(241, 245, 249)
      doc.line(MARGIN, y + 1.6, A4.w - MARGIN, y + 1.6)
      y += 5
    })
    y += 7
  }

  // Segment details: the five factor scores behind each risk score
  const ROW_H = 41
  y = ensureSpace(y, ROW_H + 8)
  heading('Segment details', y)
  y += 5

  segments.forEach((s) => {
    y = ensureSpace(y, ROW_H)
    const level = s.risk_level?.toLowerCase()
    doc.setDrawColor(...BORDER)
    doc.roundedRect(MARGIN, y, CONTENT_W, ROW_H - 2, 2, 2)
    doc.setFillColor(...(RISK_RGB[level] || MUTED))
    doc.rect(MARGIN, y + 3, 1.2, ROW_H - 8, 'F')

    const tx = MARGIN + 5
    let ty = y + 7
    text(`${s.segment_code || 'Segment'}  ·  ${fit(s.road_name || 'Unnamed road', 100, 11)}`, tx, ty, { size: 11, style: 'bold' })
    text(
      `${capitalize(level)} risk${typeof s.risk_score === 'number' ? ` · ${s.risk_score.toFixed(1)} / 100` : ''}`,
      A4.w - MARGIN - 3,
      ty,
      { size: 9, style: 'bold', color: RISK_RGB[level] || MUTED, align: 'right' }
    )
    ty += 4.8
    text(
      `${s.length_m != null ? `${fmt(s.length_m)} m` : 'Length N/A'} · ${capitalize(s.road_class)} road · ${
        TERRAIN_GROUP[s.terrain_class] || 'Terrain unavailable'
      }${s.max_speed != null ? ` · max speed ${fmt(s.max_speed)} km/h` : ''}`,
      tx,
      ty,
      { size: 8, color: MUTED }
    )
    ty += 6

    // Factor rows: label, measurement, points and a small bar like the audit page
    const BAR_X = A4.w - MARGIN - 48
    const BAR_W = 30
    ;(s.contributions || []).forEach((f) => {
      text(f.label, tx, ty, { size: 8, color: MUTED })
      text(fit(f.detail, BAR_X - tx - 42, 8.5), tx + 36, ty, { size: 8.5 })
      doc.setFillColor(226, 232, 240)
      doc.rect(BAR_X, ty - 2.2, BAR_W, 1.8, 'F')
      if (f.value > 0) {
        doc.setFillColor(...(RISK_RGB[level] || [51, 65, 85]))
        doc.rect(BAR_X, ty - 2.2, (BAR_W * f.value) / f.maximum, 1.8, 'F')
      }
      text(`${f.value} / ${f.maximum}`, A4.w - MARGIN - 3, ty, {
        size: 8.5,
        style: f.value > 0 ? 'bold' : 'normal',
        align: 'right',
      })
      ty += 4.9
    })
    y += ROW_H
  })

  if (!segments.length) {
    text('No road segments available.', MARGIN, y + 4, { size: 10, color: MUTED })
    y += 10
  }

  // Screening checklist: rows grow to fit the question and reason
  if (checklist.length) {
    const codes = Object.fromEntries(segments.map((s) => [String(s.id), s.segment_code]))
    const cols = [
      ['Segment', 0],
      ['Check', 22],
      ['Status', 150],
      ['Site visit', 166],
    ]
    const CHECK_W = 124
    const tableHeader = (yy) => {
      doc.setFillColor(241, 245, 249)
      doc.rect(MARGIN, yy - 4, CONTENT_W, 6, 'F')
      cols.forEach(([label, x]) => text(label, MARGIN + 2 + x, yy, { size: 7.5, style: 'bold', color: [71, 85, 105] }))
      return yy + 6
    }
    y = ensureSpace(y + 8, 20)
    heading('Screening checklist', y)
    y = tableHeader(y + 6)
    checklist.forEach((item) => {
      doc.setFontSize(7.5)
      const question = doc.splitTextToSize(`${item.code ? `${item.code}: ` : ''}${item.question}`, CHECK_W)
      const reason = item.reason ? doc.splitTextToSize(item.reason, CHECK_W) : []
      const rowH = (question.length + reason.length) * 3.3 + 1.8
      if (y + rowH > BOTTOM) {
        doc.addPage()
        y = tableHeader(MARGIN + 4)
      }
      const s = item.status?.toLowerCase() || 'pending'
      text(codes[String(item.segment_id)] || (item.segment_id ? 'Segment' : 'Audit-wide'), MARGIN + 2, y, {
        size: 7.5,
        style: 'bold',
      })
      text(question.join('\n'), MARGIN + 2 + cols[1][1], y, { size: 7.5 })
      if (reason.length) {
        text(reason.join('\n'), MARGIN + 2 + cols[1][1], y + question.length * 3.3, { size: 7, color: MUTED })
      }
      text(capitalize(s), MARGIN + 2 + cols[2][1], y, { size: 7.5, style: 'bold', color: STATUS_RGB[s] || PENDING_RGB })
      text(item.field_verification_required ? 'Required' : '–', MARGIN + 2 + cols[3][1], y, { size: 7.5 })
      doc.setDrawColor(241, 245, 249)
      doc.line(MARGIN, y + rowH - 3.2, A4.w - MARGIN, y + rowH - 3.2)
      y += rowH
    })
    y += 4
  }

  // Methodology
  const notes = [
    'Risk score (0–100) = sum of five factors, each worth up to 20 points: gradient above 4% (20); curve radius below the IRC:86-2018 minimum for the design speed (20); operating speed above the design speed by up to 15% / 15–30% / more (8 / 14 / 20); estimated congestion medium / high (10 / 20); pedestrian activity medium / high (8 / 20). Missing data is not scored.',
    'Risk bands: 0–24 Low, 25–49 Medium, 50–74 High, 75–100 Critical. The score compares segments consistently; it is a screening index, not a measured crash probability.',
    'Design speed from IRC:86-2018 Table 3.1 by road class and terrain; minimum curve radius from Table 8.2 (7% superelevation); 4% gradient limit from Clause 9.2. Terrain is classified from the road cross slope (plain < 10%, rolling 10–25%, mountainous 25–60%, steep > 60%).',
    'Data: Google Maps Routes, Roads, Elevation and Places APIs. Congestion compares traffic-aware and static route times; pedestrian activity counts nearby activity places. Both are project screening proxies, not IRC limits. Checks marked "Required" need a site visit; this report does not replace a full road safety audit under IRC:SP:88-2019.',
  ]
  const noteLines = notes.map((note) => doc.splitTextToSize(note, CONTENT_W))
  y = ensureSpace(y + 4, 14)
  heading('Methodology & basis', y)
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
  const fileName = `audit-report-${audit.id}-${stamp}.pdf`
  if (target && !target.closed) {
    target.location.href = doc.output('bloburl', { filename: fileName })
  } else {
    doc.save(fileName)
  }
}
