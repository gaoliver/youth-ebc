import { NextResponse } from 'next/server';
import ical, { ICalCalendarMethod, ICalEventRepeatingFreq } from 'ical-generator';

// Desabilita o cache da rota para que as correções de horário reflitam imediatamente
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
      .join('\n');
  } catch {
    return '';
  }
}

export async function GET() {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!token || !databaseId) {
    return new NextResponse('Notion credentials not configured in .env.local', { status: 500 });
  }

  const calendar = ical({
    name: 'EBC Youth',
    timezone: 'Europe/Amsterdam',
    x: [
      { key: 'X-WR-TIMEZONE', value: 'Europe/Amsterdam' },
      { key: 'X-WR-CALNAME', value: 'EBC Youth' },
    ],
    method: ICalCalendarMethod.PUBLISH,
  });

  try {
    const data = await queryNotionDatabase(databaseId, token);

    for (const page of data.results) {
      const props = page.properties;

      // 1. Icon / Emoji
      const icon = page.icon?.type === 'emoji' ? `${page.icon.emoji} ` : '';

      // 2. Title
      const rawTitle = props.Name?.title?.[0]?.plain_text || 'Untitled Event';
      const summary = `${icon}${rawTitle}`;

      // 3. Category / Tag
      const tag = props.Tags?.select?.name || props.Tags?.multi_select?.[0]?.name || '';
      const isBirthday = tag.toLowerCase() === 'birthday';

      // 4. Date Extraction (Formula and Native)
      const dateProp = 
        props['Event date']?.formula?.date || 
        props['Event date']?.date || 
        props['Date']?.date;

      if (!dateProp) {
        continue;
      }

      const dateStartString = dateProp.start;
      const isAllDay = !dateStartString.includes('T');
      
      let startDate: Date;
      let endDate: Date;

      if (isAllDay) {
        // Eventos de dia inteiro (ex: aniversários): YYYY-MM-DD
        const [year, month, day] = dateStartString.split('-').map(Number);
        startDate = new Date(Date.UTC(year, month - 1, day));

        if (dateProp.end) {
          const [endYear, endMonth, endDay] = dateProp.end.split('-').map(Number);
          endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay + 1));
        } else {
          endDate = new Date(Date.UTC(year, month - 1, day + 1));
        }
      } else {
        // Eventos com horário marcado:
        // Como o Notion envia com offset (+02:00), o construtor nativo Date()
        // calcula o timestamp UTC absoluto exato.
        startDate = new Date(dateStartString);

        if (dateProp.end) {
          endDate = new Date(dateProp.end);
        } else {
          endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // 2h de duração padrão
        }
      }

      // 5. Location
      const location = props.Location?.rich_text?.[0]?.plain_text || props.Location?.select?.name || '';

      // 6. Internal event text
      const pageContent = await getPageBlocksText(page.id, token);

      // 7. Formatted description
      const descriptionLines = [
        tag ? `Category: ${tag}` : '',
        pageContent ? `\n--- Details ---\n${pageContent}` : '',
        `\nView on Notion: ${page.url}`,
      ].filter(Boolean);

      // 8. Event Creation
      // NÃO passamos timezone individual no evento.
      // O evento emite o padrão UTC (Z) absoluto e o X-WR-TIMEZONE do cabeçalho
      // instrui o Apple Calendar / Google Calendar a renderizar em Europe/Amsterdam.
      calendar.createEvent({
        id: page.id,
        start: startDate,
        end: endDate,
        allDay: isAllDay,
        summary: summary,
        description: descriptionLines.join('\n'),
        location: location,
        url: page.url,
        repeating: isBirthday ? { freq: ICalEventRepeatingFreq.YEARLY } : undefined,
      });
    }

    return new NextResponse(calendar.toString(), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="calendar.ics"',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error: any) {
    console.error('API Error:', error.message || error);
    return new NextResponse(`Internal Error: ${error.message}`, { status: 500 });
  }
}