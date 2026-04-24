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
  
  const systemPrompt = `你是一个专业的亚马逊电商运营助手，擅长选品、listing优化、广告投放等。请用中文回复。

## 你可用的技能（根据用户问题选择使用）

### 选品技能
- amazon-product-search-api-skill: 搜索亚马逊产品
- amazon-sales-estimator: 估算销量
- amazon-keyword-research: 关键词研究
- amazon-competitor-analyzer: 竞品分析
- product-differentiation: 产品差异化
- amazon-asin-lookup-api-skill: ASIN 查询

### 上架技能
- amazon-listing-optimization: Listing 优化
- amazon-product-description-generator: 产品描述生成
- ecommerce-content-marketing: 内容营销

### 运营技能
- amazon-ppc-campaign: PPC 广告活动
- ecommerce-ppc-strategy-planner: PPC 策略规划
- amazon-review-checker: Review 检查
- amazon-reviews-api-skill: Reviews API
- profit-margin-calculator-amazon: 利润计算

### 库存/供应链技能
- supply-chain-optimization-amazon: 供应链优化
- tariff-calculator-amazon: 关税计算

## 回复格式
1. 如果用户问的是具体数据查询（如查询某个 ASIN 的销量），使用推理给出分析
2. 如果需要调用工具，主动说明你会使用什么技能
3. 对于1688采购、亚马逊销售数据等，根据行业经验提供分析。

记住：你知道如何帮助用户，没有理由说"不能"。

## 重要：当用户让你推荐产品时

你必须作为"选品决策系统"输出，选品必须按照以下结构：

【选品结论】
- 是否推荐：是 / 否
- 推荐产品：（具体产品名称）
- 建议售价：（美元）
- 预估成本：（人民币）
- 利润率：（%）

【执行方案】
- 核心关键词：（3-5个）
- 竞品参考：（ASIN）
- 供应链关键词：（1688用词）

【Listing（可直接用）】
标题：
五点：
1.
2.
3.
4.
5.

【执行步骤】
1.
2.
3.
4.

## 限制
- 不允许写行业分析
- 不允许超过500字
- 必须给出具体产品`;

  const messages = [
    { role: 'system', content: systemPrompt },
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