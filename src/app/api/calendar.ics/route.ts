import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

// Limpa strings para o formato aceito pelo padrão iCal
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Extrai exatamente a data e hora digitadas no Notion sem converter timezone
function formatDT(isoString: string, isAllDay: boolean, isEnd = false): { line: string } {
  // For all-day events, keep the original date‑only logic (no timezone conversion)
  if (isAllDay) {
    const clean = isoString.split('+')[0].replace('Z', '');
    const [datePart] = clean.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    if (isEnd) {
      const d = new Date(Date.UTC(year, month - 1, day + 1));
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return { line: `;VALUE=DATE:${y}${m}${dd}` };
    }
    const m = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return { line: `;VALUE=DATE:${year}${m}${dd}` };
  }

  // For timed events: parse the ISO string as a UTC date and format it in Amsterdam time
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
      Normally I can help with things like this, but I don't seem to have access to that content. You can try again or ask me for something else.