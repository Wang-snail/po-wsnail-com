import { createServer } from 'http';
import { execSync } from 'child_process';

const PORT = process.env.PORT || 3003;
const ZEROCLAW_DIR = '/Users/woniu/zeroclaw/亚马逊调研团队';

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'zeroclaw' }));
    return;
  }
  
  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { message, history } = JSON.parse(body);
        console.log('收到消息:', message);
        
        const response = await callZeroclaw(message);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, content: response }));
      } catch (error) {
        console.error('Error:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end();
});

function callZeroclaw(message) {
  const fullCmd = `echo "${message.replace(/"/g, '\\"')}" | zeroclaw agent --config-dir ${ZEROCLAW_DIR}`;
  
  try {
    const output = execSync(fullCmd, {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });
    
    // 提取中文回复
    const lines = output.split('\n');
    let reply = '';
    let capture = false;
    
    for (const line of lines) {
      if (line.includes('🤔 Thinking')) {
        capture = true;
        continue;
      }
      if (capture && line.trim()) {
        reply += line + '\n';
      }
    }
    
    // 清理回复
    reply = reply.trim();
    if (!reply) {
      // fallback: 找任何中文句子
      const cnMatch = output.match(/[\u4e00-\u9fa5][^\n]*[\u4e00-\u9fa5]+/);
      reply = cnMatch ? cnMatch[0] : '收到消息';
    }
    
    return reply.substring(0, 2000); // 限制长度
  } catch (error) {
    console.error('exec error:', error.message);
    return '处理消息时出错: ' + error.message;
  }
}

server.listen(PORT, () => {
  console.log(`🚀 ZeroClaw Chat API: http://localhost:${PORT}/chat`);
});
