import { Page } from "puppeteer";

/**
 * 浏览器配置 - HTTP Headers 和反检测
 */

// 真实浏览器的 Accept-Language 变体
const ACCEPT_LANGUAGES = [
  'zh-CN,zh;q=0.9,en;q=0.8',
  'en-US,en;q=0.9',
  'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
];

/**
 * 配置页面基础设置(视口、CSP等)
 */
export async function setupPageBasics(page: Page): Promise<void> {
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setBypassCSP(true);
}

/**
 * 设置增强的 HTTP Headers 模拟真实浏览器指纹
 */
export async function setupHttpHeaders(page: Page): Promise<void> {
  const randomLanguage = ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];

  await page.setExtraHTTPHeaders({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': randomLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Sec-CH-UA': '"Chromium";v="121", "Not(A:Brand";v="24", "Google Chrome";v="121"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"macOS"',
    'Cache-Control': 'max-age=0',
  });
}

/**
 * 注入反检测脚本(在页面加载前执行)
 */
export async function injectAntiDetectionScript(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    // 覆盖 webdriver 标识
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // 添加更真实的插件信息
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ],
    });

    // 覆盖 permissions API
    const originalQuery = window.navigator.permissions.query;
    // @ts-ignore - 反检测需要覆盖内部方法
    window.navigator.permissions.query = (parameters: any) => (
      parameters.name === 'notifications' ?
        Promise.resolve({
          state: 'prompt' as PermissionState,
          name: 'notifications',
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true
        }) :
        originalQuery(parameters)
    );

    // 覆盖 chrome 对象(使其看起来像真实浏览器)
    (window as any).chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
    };
  });
}
