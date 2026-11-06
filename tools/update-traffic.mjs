import { mkdir, writeFile } from 'node:fs/promises';

const token = process.env.GOATCOUNTER_TOKEN;
if (!token) throw new Error('GOATCOUNTER_TOKEN is required');
const end = new Date();
end.setUTCHours(0, 0, 0, 0);
const start = new Date(end.getTime() - 30 * 86400000);
const url = new URL('https://observl.goatcounter.com/api/v0/stats/total');
url.searchParams.set('start', start.toISOString());
url.searchParams.set('end', end.toISOString());
// Retry transient network failures, rate limiting, and temporary server errors.
async function fetchStatistics() {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.json();
      const detail = (await response.text()).slice(0, 400);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 4) {
        throw new Error(`GoatCounter returned HTTP ${response.status}: ${detail}`);
      }
      console.warn(`GoatCounter HTTP ${response.status} (attempt ${attempt}/4): ${detail}`);
    } catch (error) {
      if (attempt === 4 || (error.message || '').startsWith('GoatCounter returned HTTP')) throw error;
      console.warn(`GoatCounter request failed (attempt ${attempt}/4): ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000 * 2 ** (attempt - 1)));
  }
}
const data = await fetchStatistics();
if (!Array.isArray(data.stats)) throw new Error('Invalid statistics response; previous chart preserved');
const counts = new Map();
for (const row of data.stats) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day) || !Number.isFinite(row.daily) || row.daily < 0) throw new Error('Invalid daily statistic');
  counts.set(row.day, row.daily);
}
const days = Array.from({ length: 30 }, (_, index) => {
  const day = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
  return { day, visits: counts.get(day) || 0 };
});
const max = Math.max(1, ...days.map(day => day.visits));
const points = days.map((day, index) => `${60 + index * 700 / 29},${230 - day.visits / max * 150}`).join(' ');
const total = days.reduce((sum, day) => sum + day.visits, 0);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" viewBox="0 0 800 300" role="img" aria-labelledby="title desc">
<title id="title">MaimaiDIY 每日访问趋势</title><desc id="desc">最近30个完整UTC日期的GoatCounter访问次数，共${total}次。</desc>
<rect width="800" height="300" rx="20" fill="#faf9ff"/>
<g font-family="system-ui,sans-serif" fill="#282438"><text x="40" y="36" font-size="20" font-weight="700">MaimaiDIY · 每日访问趋势</text><text x="40" y="59" font-size="12">最近30个完整日期 · UTC · 总访问 ${total}</text>
<path d="M60 80V230H760" stroke="#d9d5e7" fill="none"/><text x="28" y="86" font-size="12">${max}</text><text x="35" y="234" font-size="12">0</text>
<polyline points="${points}" stroke="#6c5ce7" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="60" y="255" font-size="12">${days[0].day}</text><text x="670" y="255" font-size="12">${days.at(-1).day}</text>
<text x="40" y="282" font-size="11" fill="#767080">来源：GoatCounter · 更新时间 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · 非仓库浏览量</text></g></svg>`;
await mkdir('docs/traffic', { recursive: true });
await writeFile('docs/traffic/daily.svg', svg);
await writeFile('docs/traffic/daily.json', JSON.stringify({ source: 'GoatCounter', metric: 'visits', timezone: 'UTC', days }, null, 2) + '\n');
console.log(`Updated daily chart: ${days.length} days, ${total} visits`);
