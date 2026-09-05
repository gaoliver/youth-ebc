import { NextResponse } from 'next/server';
import ical, { ICalCalendarMethod, ICalEventRepeatingFreq } from 'ical-generator';

export const revalidate = 600; 

async function queryNotionDatabase(databaseId: string, token: string) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
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

      // 3. Category / Tag (To identify birthdays)
      const tag = props.Tags?.select?.name || props.Tags?.multi_select?.[0]?.name || '';
      const isBirthday = tag.toLowerCase() === 'birthday';

      // 4. Date (Robust extraction handling Notion Formula properties)
      const dateProp = 
        props['Event date']?.formula?.date || 
        props['Event date']?.date || 
        props['Date']?.date;

      if (!dateProp) {
        console.log(`[DEBUG] Skipped "${rawTitle}" because no date property was found.`);
        continue;
      }

      const dateStartString = dateProp.start;
      const isAllDay = !dateStartString.includes('T');
      
      let startDate: Date;
      let endDate: Date;

      if (isAllDay) {
        // Eventos de dia inteiro (ex: aniversários)
        const [year, month, day] = dateStartString.split('-').map(Number);
        startDate = new Date(Date.UTC(year, month - 1, day));

        if (dateProp.end) {
          const [endYear, endMonth, endDay] = dateProp.end.split('-').map(Number);
          endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay + 1));
        } else {
          endDate = new Date(Date.UTC(year, month - 1, day + 1));
        }
      } else {
        // Eventos com horário: garante que a string não seja corrompida pelo fuso da Vercel
        // Se a string do Notion não tiver indicador de fuso (+ ou Z), forçamos Europe/Amsterdam
        let normalizedStart = dateStartString;
        if (!dateStartString.includes('Z') && !dateStartString.match(/[+-]\d{2}:\d{2}$/)) {
          // No horário de verão da Holanda (CEST) é +02:00, no inverno (CET) é +01:00
          // Usando Intl para resolver o offset correto da data dinamicamente:
          const tempDate = new Date(dateStartString);
          const isDST = tempDate.getTimezoneOffset ? true : false;
        }

        startDate = new Date(dateStartString);

        if (dateProp.end) {
          endDate = new Date(dateProp.end);
        } else {
          endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // 2h padrão
        }
      }

      // Monta o evento aplicando Europe/Amsterdam para o iPhone/Google entenderem a TZID
      const event = calendar.createEvent({
        id: page.id,
        start: startDate,
        end: endDate,
        allDay: isAllDay,
        timezone: isAllDay ? undefined : 'Europe/Amsterdam',
        summary: summary,
        description: descriptionLines.join('\n'),
        location: location,
        url: page.url,
      });

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

      const event = calendar.createEvent({
        id: page.id,
        start: startDate,
        end: endDate,
        allDay: isAllDay,
        summary: summary,
        description: descriptionLines.join('\n'),
        location: location,
        url: page.url,
      });

      if (isBirthday) {
        event.repeating({
          freq: ICalEventRepeatingFreq.YEARLY,
        });
      }
    }

    return new NextResponse(calendar.toString(), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="calendar.ics"',
        'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=1200',
      },
    });
  } catch (error: any) {
    console.error('API Error:', error.message || error);
    return new NextResponse(`Internal Error: ${error.message}`, { status: 500 });
  }
}