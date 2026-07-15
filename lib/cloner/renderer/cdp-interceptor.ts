import { Page, CDPSession } from "puppeteer";

/**
 * CDP 网络拦截 - 捕获所有网络资源
 */

export interface CapturedResource {
  url: string;
  type: string;
  mimeType: string;
  body?: string; // base64 encoded
}

export interface CDPInterceptor {
  getResources: () => CapturedResource[];
  cleanup: () => Promise<void>;
}

/**
 * 使用 CDP (Chrome DevTools Protocol) 拦截所有网络流量
 * 绕过 CORS 限制,捕获浏览器加载的每个资源
 */
export async function setupCDPInterception(page: Page): Promise<CDPInterceptor> {
  const cdp: CDPSession = await page.createCDPSession();
  const resources: CapturedResource[] = [];
  const requestMap = new Map<string, { url: string; type: string }>();

  // 启用网络域,允许访问响应体
  await cdp.send("Network.enable");

  // 跟踪所有请求
  cdp.on("Network.requestWillBeSent", (event: any) => {
    requestMap.set(event.requestId, {
      url: event.request.url,
      type: event.type || "Other",
    });
  });

  // 捕获响应体
  cdp.on("Network.responseReceived", async (event: any) => {
    const req = requestMap.get(event.requestId);
    if (!req) return;

    const mimeType = event.response.mimeType || "";
    const url = req.url;

    // 跳过 data URIs 和 blob URIs
    if (url.startsWith("data:") || url.startsWith("blob:")) return;

    // 根据 mime 类型确定资源类型
    let type = "other";
    if (mimeType.includes("css")) type = "css";
    else if (mimeType.includes("javascript")) type = "js";
    else if (mimeType.includes("image")) type = "image";
    else if (mimeType.includes("font")) type = "font";
    else if (mimeType.includes("video")) type = "video";
    else if (mimeType.includes("audio")) type = "audio";

    resources.push({ url, type, mimeType });
  });

  return {
    getResources: () => resources,
    cleanup: async () => {
      try {
        await cdp.detach();
      } catch {
        // 忽略分离错误
      }
    },
  };
}

/**
 * 提取 CDP 无法获取响应体的资源
 * 使用 Fetch.enable 拦截跨域响应
 */
export async function setupFetchInterception(page: Page): Promise<{
  getCapturedBodies: () => Map<string, Buffer>;
}> {
  const cdp: CDPSession = await page.createCDPSession();
  const bodies = new Map<string, Buffer>();

  await cdp.send("Fetch.enable", {
    patterns: [{ requestStage: "Response" }],
  });

  cdp.on("Fetch.requestPaused", async (event: any) => {
    const { requestId, request, responseStatusCode } = event;
    try {
      if (responseStatusCode && responseStatusCode < 400) {
        const response = await cdp.send("Fetch.getResponseBody", { requestId });
        const buffer = response.base64Encoded
          ? Buffer.from(response.body, "base64")
          : Buffer.from(response.body);
        bodies.set(request.url, buffer);
      }
    } catch {
      // 某些响应无法读取
    }
    // 继续请求
    await cdp.send("Fetch.continueRequest", { requestId }).catch(() => {});
  });

  return { getCapturedBodies: () => bodies };
}