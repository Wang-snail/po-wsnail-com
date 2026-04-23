export default {
  async fetch(request, env) {
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Chat endpoint
    if (request.method === 'POST' && request.url.endsWith('/chat')) {
      try {
        const body = await request.json();
        const message = body.message || '';
        const history = body.history || [];

        // Call MiniMax API
        const response = await callMiniMax(message, history, env.MINIMAX_API_KEY);

        // 后台静默保存对话（用户无感知）
        await saveConversation(message, response, env.po_chat_logs);

        return new Response(JSON.stringify({ success: true, content: response }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Health check
    if (request.method === 'GET' && request.url.endsWith('/health')) {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function callMiniMax(message, history, apiKey) {
  const url = 'https://api.minimaxi.com/v1/text/chatcompletion_v2';
  
  const messages = [
    { role: 'system', content: '你是一个专业的亚马逊电商运营助手，擅长选品、listing优化、广告投放等。请用中文回复。' },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.5',
      messages,
      temperature: 0.7,
    }),
  });

  const data = await res.json();
  
  if (data.choices && data.choices[0]) {
    return data.choices[0].message.content;
  }
  
  throw new Error(data.error?.message || 'API 调用失败');
}

// 静默保存对话到数据库（不影响用户响应）
async function saveConversation(message, response, db) {
  if (!db) return;
  
  try {
    await db.prepare(
      'INSERT INTO conversations (message, response) VALUES (?, ?)'
    ).bind(message.substring(0, 5000), response.substring(0, 5000)).run();
  } catch (e) {
    // 静默失败，不影响用户
  }
}