import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ---------- Helper: query Notion database ----------
async function queryNotionDatabase(databaseId: string, token: string) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Notion API Error (${res.status}): ${errorBody}`);
  }

  return res.json();
}

// ---------- Helper: get page blocks (optional description) ----------
async function getPageBlocksText(pageId: string, token: string) {
  try {
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
      },
      cache: 'no-store',
    });

    if (!res.ok) return '';
    const data = await res.json();

    return (data.results || [])
      .map((b: any) => {
        if (b.type === 'paragraph') return b.paragraph.rich_text?.map((t: any) => t.plain_text).join('');
        if (b.type === 'bulleted_list_item') return `• ${b.bulleted_list_item.rich_text?.map((t: any) => t.plain_text).join('')}`;
        if (b.type === 'numbered_list_item') return `1. ${b.numbered_list_item.rich_text?.map((t: any) => t.plain_text).join('')}`;
        return '';
      })
      .filter(Boolean)
      .join('\\n');
  } catch {
    return '';
  }
}

// ---------- Helper: escape iCal text ----------
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// ---------- Helper: format datetime for iCal ----------
function formatDT(isoString: string, isAllDay: boolean, isEnd = false): { line: string } {
  // For all-day events: keep date‑only, no timezone
  if (isAllDay) {
    const clean = isoString.split('+')[0].replace('Z', '');
    const [datePart] = clean.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    // isEnd is ignored – we never add a day here because Notion’s end is already exclusive
    const m = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return { line: `;VALUE=DATE:${year}${m}${dd}` };
  }

  // For timed events: parse as UTC and convert to Amsterdam local
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  return { line: `;TZID=Europe/Amsterdam:${year}${month}${day}T${hour}${minute}${second}` };
}

// ---------- GET handler ----------
export async function GET() {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!token || !databaseId) {
    return new NextResponse('Notion credentials not configured in .env.local', { status: 500 });
  }

  try {
    const data = await queryNotionDatabase(databaseId, token);
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EBC Youth//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:EBC Youth',
      'X-WR-TIMEZONE:Europe/Amsterdam',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Amsterdam',
      'X-LIC-LOCATION:Europe/Amsterdam',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'TZNAME:CEST',
      'DTSTART:19700329T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'TZNAME:CET',
      'DTSTART:19701025T030000',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'END:VTIMEZONE',
    ];

    // ----- Process each event -----
    for (const page of data.results || []) {
      const dateProp = page.properties?.Date?.date;
      if (!dateProp) continue;

      const start = dateProp.start;
      const end = dateProp.end;  // Notion's end is exclusive for all-day, exact for timed
      if (!start) continue;

      const isAllDay = !start.includes('T');
      const title = page.properties?.Name?.title?.[0]?.plain_text || 'Untitled';

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${page.id}@ebc-youth`);
      lines.push(`SUMMARY:${escapeICalText(title)}`);
      lines.push(`DTSTAMP:${now}`);

      // --- DTSTART ---
      const startLine = formatDT(start, isAllDay, false);
      lines.push(`DTSTART${startLine.line}`);

      // --- DTEND ---
      let endDate = end;
      if (isAllDay) {
        // All-day events MUST have an exclusive DTEND.
        // If Notion didn't give one, add 1 day to the start date.
        if (!endDate) {
          const d = new Date(start + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + 1);
          endDate = d.toISOString().split('T')[0]; // YYYY-MM-DD
        }
        // Notion's end is already exclusive, so we pass isEnd: false.
        const endLine = formatDT(endDate, true, false);
        lines.push(`DTEND${endLine.line}`);
      } else {
        // Timed events
        if (endDate) {
          // Notion's end is the exact datetime (already exclusive).
          const endLine = formatDT(endDate, false, false);
          lines.push(`DTEND${endLine.line}`);
        } else {
          // No end time provided – default to +1 hour
          const d = new Date(start);
          d.setHours(d.getHours() + 1);
          const endLine = formatDT(d.toISOString(), false, false);
          lines.push(`DTEND${endLine.line}`);
        }
      }

      // (Optional) Add description from page blocks
      // const description = await getPageBlocksText(page.id, token);
      // if (description) lines.push(`DESCRIPTION:${escapeICalText(description)}`);

      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    const ics = lines.join('\r\n');

    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="calendar.ics"',
      },
    });
  } catch (error) {
    console.error(error);
    return new NextResponse('Failed to generate calendar', { status: 500 });
  }
}