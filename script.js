// ============================================
// Po Chat - 前端配置
// ============================================

// 配置你的 Po Chat API 地址
// 使用 Cloudflare Workers API，更安全
const API_BASE_URL = 'https://po-chat-api.bing117119.workers.dev';

// 配置项
const CONFIG = {
  // API 端点（根据你的 ZeroClaw 配置调整）
  chatEndpoint: API_BASE_URL ? `${API_BASE_URL}/chat` : '',
  
  // 请求超时时间（毫秒）
  timeout: 60000,
  
  // 最大历史消息数
  maxHistory: 50,
};

// 消息历史
let messageHistory = [];

// DOM 元素
const messagesEl = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusEl = document.getElementById('status');

// 初始化
document.addEventListener('DOMContentLoaded', init);

function init() {
  chatForm.addEventListener('submit', handleSubmit);
  userInput.focus();
  
  // 更新状态
  if (!API_BASE_URL) {
    setStatus('未配置 API', true);
  } else {
    setStatus('就绪');
  }
}

// 处理表单提交
async function handleSubmit(e) {
  e.preventDefault();
  
  const message = userInput.value.trim();
  if (!message) return;
  
  // 添加用户消息
  addMessage('user', message);
  userInput.value = '';
  
  // 显示 Typing 状态
  const typingEl = addTypingMessage();
  
  try {
    const response = await sendMessage(message);
    removeTypingMessage(typingEl);
    addMessage('bot', response);
  } catch (error) {
    removeTypingMessage(typingEl);
    addMessage('error', error.message || '请求失败，请稍后重试');
  }
}

// 发送消息到 API
async function sendMessage(message) {
  if (!CONFIG.chatEndpoint) {
    // TODO: 这里填入你的 ZeroClaw API 响应
    // 暂时返回提示信息
    return getPlaceholderResponse(message);
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
  
  try {
    const res = await fetch(CONFIG.chatEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        history: messageHistory,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      throw new Error(`API 错误: ${res.status}`);
    }
    
    const data = await res.json();
    
    // 保存到历史记录
    messageHistory.push({ role: 'user', content: message });
    messageHistory.push({ role: 'bot', content: data.content || data.message || data.reply || '' });
    
    // 限制历史记录长度
    if (messageHistory.length > CONFIG.maxHistory * 2) {
      messageHistory = messageHistory.slice(-CONFIG.maxHistory);
    }
    
    return data.content || data.message || data.reply || '无响应';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
}

// 占位符响应（API 未配置时）
function getPlaceholderResponse(message) {
  // TODO: 这里填入你的 ZeroClaw API 地址后删除此函数
  const responses = [
    `收到消息: "${message}"\n\n⚠️ API 暂未配置。请在 script.js 中设置 API_BASE_URL。`,
    `你好！你说的问题是 "${message}"\n\n⚠️ 前端尚未连接 ZeroClaw API。\n请编辑 script.js 配置 API_BASE_URL。`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// 添加消息到界面
function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="avatar">${role === 'user' ? '👤' : '🐌'}</div>
    <div class="content">${escapeHtml(content)}</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

// 添加 Typing 消息
function addTypingMessage() {
  const div = document.createElement('div');
  div.className = 'message bot typing';
  div.innerHTML = `
    <div class="avatar">🐌</div>
    <div class="content">思考中</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

// 移除 Typing 消息
function removeTypingMessage(el) {
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

//滚动到底部
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 设置状态
function setStatus(text, disconnected = false) {
  statusEl.textContent = text;
  if (disconnected) {
    statusEl.classList.add('disconnected');
  } else {
    statusEl.classList.remove('disconnected');
  }
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}