import 'server-only';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { publicEnv } from '@/lib/env';

export interface CertificateData {
  code: string;
  recipientName: string;
  courseTitle: string;
  courseSubtitle?: string | null;
  finalScorePct: number | null;
  hours: number | null;
  issuedAt: string;
  integrityHash: string;
}

const VOID = rgb(0.02, 0.027, 0.051);
const ION = rgb(0.2, 0.56, 0.984);
const EMBER = rgb(0.976, 0.494, 0.086);
const PAPER = rgb(0.988, 0.99, 0.996);
const MUTED = rgb(0.42, 0.47, 0.56);

/**
 * Renders an A4 landscape certificate.
 *
 * The verification URL and the integrity hash are both printed. The hash is
 * computed in the database over the canonical claim, so a recipient who edits
 * the PDF cannot make the altered claim verify.
 */
export async function buildCertificatePdf(data: CertificateData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`AfriOrbit certificate ${data.code}`);
  pdf.setAuthor('AfriOrbit Space');
  pdf.setSubject(data.courseTitle);
  pdf.setProducer('AfriOrbit Learning');
  pdf.setCreationDate(new Date(data.issuedAt));

  const page = pdf.addPage([842, 595]); // A4 landscape, points
  const { width, height } = page.getSize();

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  // Background
  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });

  // Top and bottom bands
  page.drawRectangle({ x: 0, y: height - 14, width, height: 14, color: VOID });
  page.drawRectangle({ x: 0, y: 0, width, height: 6, color: ION });

  // Orbit motif
  page.drawEllipse({
    x: width - 110,
    y: height - 120,
    xScale: 78,
    yScale: 30,
    borderColor: EMBER,
    borderWidth: 1.5,
    opacity: 0,
    borderOpacity: 0.75,
  });
  page.drawCircle({ x: width - 110, y: height - 120, size: 22, color: ION, opacity: 0.9 });
  page.drawCircle({ x: width - 40, y: height - 108, size: 5, color: EMBER });

  const left = 64;
  let y = height - 92;

  page.drawText('AFRIORBIT SPACE', {
    x: left,
    y,
    size: 11,
    font: bold,
    color: ION,
  });

  y -= 46;
  page.drawText('Certificate of Completion', {
    x: left,
    y,
    size: 32,
    font: bold,
    color: VOID,
  });

  y -= 44;
  page.drawText('This certifies that', { x: left, y, size: 12, font: regular, color: MUTED });

  y -= 40;
  const nameSize = data.recipientName.length > 34 ? 24 : 30;
  page.drawText(data.recipientName, { x: left, y, size: nameSize, font: bold, color: VOID });

  page.drawLine({
    start: { x: left, y: y - 12 },
    end: { x: Math.min(left + 520, width - 64), y: y - 12 },
    thickness: 1,
    color: ION,
    opacity: 0.5,
  });

  y -= 46;
  page.drawText('has successfully completed the course', {
    x: left,
    y,
    size: 12,
    font: regular,
    color: MUTED,
  });

  y -= 34;
  const titleSize = data.courseTitle.length > 48 ? 17 : 21;
  page.drawText(data.courseTitle, { x: left, y, size: titleSize, font: bold, color: VOID });

  if (data.courseSubtitle) {
    y -= 20;
    page.drawText(data.courseSubtitle, { x: left, y, size: 11, font: regular, color: MUTED });
  }

  // Facts strip
  y -= 52;
  const facts: [string, string][] = [
    ['Issued', new Date(data.issuedAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })],
  ];
  if (data.finalScorePct !== null) {
    facts.push(['Assessment average', `${Number(data.finalScorePct).toFixed(0)}%`]);
  }
  if (data.hours !== null) {
    facts.push(['Notional hours', Number(data.hours).toFixed(1)]);
  }

  let factX = left;
  for (const [label, value] of facts) {
    page.drawText(label.toUpperCase(), {
      x: factX,
      y,
      size: 7.5,
      font: bold,
      color: MUTED,
    });
    page.drawText(value, { x: factX, y: y - 16, size: 13, font: bold, color: VOID });
    factX += 170;
  }

  // Verification block
  const boxY = 64;
  page.drawRectangle({
    x: left,
    y: boxY,
    width: width - left * 2,
    height: 74,
    color: rgb(0.945, 0.957, 0.976),
    borderColor: rgb(0.87, 0.89, 0.925),
    borderWidth: 1,
  });

  page.drawText('VERIFICATION', {
    x: left + 18,
    y: boxY + 52,
    size: 7.5,
    font: bold,
    color: MUTED,
  });

  page.drawText(data.code, {
    x: left + 18,
    y: boxY + 30,
    size: 16,
    font: mono,
    color: VOID,
  });

  page.drawText(`${publicEnv.siteUrl}/verify/${data.code}`, {
    x: left + 18,
    y: boxY + 13,
    size: 9,
    font: regular,
    color: ION,
  });

  page.drawText('INTEGRITY HASH (SHA-256)', {
    x: left + 340,
    y: boxY + 52,
    size: 7.5,
    font: bold,
    color: MUTED,
  });
  page.drawText(data.integrityHash.slice(0, 32), {
    x: left + 340,
    y: boxY + 34,
    size: 8,
    font: mono,
    color: VOID,
  });
  page.drawText(data.integrityHash.slice(32), {
    x: left + 340,
    y: boxY + 22,
    size: 8,
    font: mono,
    color: VOID,
  });

  page.drawText(
    'Anyone can confirm this certificate at the address above without an account.',
    { x: left, y: 44, size: 8, font: regular, color: MUTED },
  );

  return pdf.save();
}
