import fs from 'node:fs';
import path from 'node:path';
import { normalizeUsage } from './usage-ledger.mjs';
import { parseEnv } from 'node:util';
import { TOOL_DEFINITIONS, validateToolArguments } from './tool-definitions.mjs';

export const DEFAULT_MODEL = 'deepseek-flash';
export const DEFAULT_LIMITS = Object.freeze({ maxSteps: 20, maxToolCalls: 20, apiTimeoutMs: 60000, taskTimeoutMs: 180000, maxTokens: 2048, maxFrames: 4, maxFrameBytes: 2_000_000 });
export const HARD_LIMITS = Object.freeze({ ...DEFAULT_LIMITS, maxSteps: 10000, maxToolCalls: 10000, taskTimeoutMs: 604_800_000 });

export function normalizeApiConfig(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['apiKey', 'baseUrl', 'model', 'keySource'].includes(key)))
    throw new Error('API 设置只接受密钥、接口地址和模型。');
  const apiKey = (value.apiKey?.trim()) || '';
  const baseUrl = (value.baseUrl?.trim()) || 'https://api.deepseek.com';
  let url;
  try { url = new URL(baseUrl); }
  catch { throw new Error('DeepSeek 接口地址不是有效 URL。'); }
  if (baseUrl.length > 2048 || url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname))))
    throw new Error('DeepSeek 接口地址必须使用 HTTPS，或本机 HTTP 地址。');
  const model = (value.model?.trim()) || DEFAULT_MODEL;
  return { apiKey, baseUrl: url.href.replace(/\/+$/, ''), model, keySource: apiKey ? '本机 API 设置' : '未配置' };
}

export class ApiAgent {
  constructor({ controller, config, usageLedger, ...limits } = {}) {
    if (!controller || !config) throw new Error('缺少浏览器控制器或 API 配置。');
    const actualLimits = { ...DEFAULT_LIMITS, ...limits };
    for (const [name, val] of Object.entries(actualLimits)) {
      if (!(name in HARD_LIMITS) || !Number.isSafeInteger(val) || val < 1 || val > HARD_LIMITS[name])
        throw new Error(`预算参数 ${name} 必须是 1 至 ${HARD_LIMITS[name] ?? '硬上限'} 的整数。`);
    }
    Object.assign(this, { controller, config, usageLedger, toolDefinitions: TOOL_DEFINITIONS, ...actualLimits });
  }

  async decideWatch({ observation, context = '', watchOptions, shareContext, commentContext, signal, decisionProvider }) {
    const messages = []; // Simplified: in real code would use watchDecisionMessages etc.
    // For brevity we just call the model directly with observation JSON.
    const payload = {
      model: this.config.model,
      messages: [{ role: 'user', content: JSON.stringify(observation) }],
      max_tokens: this.maxTokens,
    };
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) throw new Error(`模型请求失败 ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    return { decision: text, usage: data.usage };
  }
}
