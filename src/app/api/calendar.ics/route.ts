import { NextResponse } from 'next/server';
import ical, { ICalCalendarMethod, ICalEventRepeatingFreq } from 'ical-generator';

export const revalidate = 600; // Atualiza a cada 10 minutos

// Função auxiliar para chamar a API do Notion via Fetch nativo
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
    throw new Error(`Erro API Notion (${res.status}): ${errorBody}`);
  }

  return res.json();
}

// Função auxiliar para buscar o texto interno da página
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
    return new NextResponse('Notion credentials not configured on Environment.', { status: 500 });
  }

  const calendar = ical({
    name: 'Youth EBC',
    timezone: 'Europe/Amsterdam',
    method: ICalCalendarMethod.PUBLISH,
  });

  try {
    const data = await queryNotionDatabase(databaseId, token);

    for (const page of data.results) {
      const props = page.properties;

      // 1. Ícone / Emoji
      const icon = page.icon?.type === 'emoji' ? `${page.icon.emoji} ` : '';

      // 2. Título
      const rawTitle = props.Name?.title?.[0]?.plain_text || 'No title';
      const summary = `${icon}${rawTitle}`;

      // 3. Tratar Datas (Eventos normais usam 'Date', Aniversários usam 'Birthday')
      const dateProp = props.Date?.date;
      const birthdayProp = props.Birthday?.date;

      let startDate: Date | null = null;
      let endDate: Date | null = null;
      let isAllDay = false;
      let isBirthday = false;

      if (dateProp) {
        startDate = new Date(dateProp.start);
        isAllDay = !dateProp.start.includes('T');
        if (dateProp.end) {
          endDate = new Date(dateProp.end);
        } else {
          endDate = isAllDay
            ? new Date(startDate.getTime() + 24 * 60 * 60 * 1000)
            : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
        }
      } else if (birthdayProp) {
        startDate = new Date(birthdayProp.start);
        endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
        isAllDay = true;
        isBirthday = true;
      }

      if (!startDate || !endDate) continue;

      // 4. Localização
      const location = props.Location?.rich_text?.[0]?.plain_text || props.Location?.select?.name || '';

      // 5. Categoria / Tag
      const tag = props.Tags?.select?.name || props.Tags?.multi_select?.[0]?.name || '';

      // 6. Texto interno do evento
      const pageContent = await getPageBlocksText(page.id, token);

      // 7. Descrição formatada
      const descriptionLines = [
        tag ? `Category: ${tag}` : '',
        pageContent ? `\n--- Details ---\n${pageContent}` : '',
        `\nSee on Notion: ${page.url}`,
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
    console.error('Error on calendar API:', error.message || error);
    return new NextResponse(`Internal error: ${error.message}`, { status: 500 });
  }
}