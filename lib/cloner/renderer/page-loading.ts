import { Page } from "puppeteer";

/**
 * 页面加载策略 - 导航、懒加载、智能滚动
 */

const NAVIGATION_STRATEGIES = [
  { waitUntil: "domcontentloaded" as const, timeout: 10000 },
  { waitUntil: "load" as const, timeout: 20000 },
  { waitUntil: "networkidle2" as const, timeout: 40000 },
];

/**
 * 智能页面导航 - 尝试多种策略直到成功
 */
export async function navigateToPage(page: Page, url: string): Promise<void> {
  for (const strategy of NAVIGATION_STRATEGIES) {
    try {
      await page.goto(url, strategy);
      return; // 成功,直接返回
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (strategy === NAVIGATION_STRATEGIES[NAVIGATION_STRATEGIES.length - 1]) {
        throw new Error(`页面加载失败: ${errMsg}。请检查URL是否正确,或网站是否阻止了自动访问。`);
      }
      // 继续尝试下一个策略
    }
  }
}

/**
 * 强制加载所有懒加载图片
 */
export async function forceLazyImageLoading(page: Page): Promise<void> {
  await page.evaluate(() => {
    // 移除 loading="lazy" 属性,使图片立即加载
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.removeAttribute("loading");
    });

    // 触发 IntersectionObserver 的懒加载器
    document.querySelectorAll("img").forEach((img) => {
      if (!img.src || img.src.startsWith("data:")) {
        // 检查常见的懒加载属性并提升到 src
        const lazySrc = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") ||
          img.getAttribute("data-original") || img.getAttribute("data-lazy");
        if (lazySrc) {
          img.src = lazySrc;
        }
      }
    });
  });
}

/**
 * 智能滚动加载 - 模拟真实用户滚动行为
 */
export async function performIntelligentScrolling(page: Page): Promise<void> {
  console.log("  📜 开始智能滚动加载...");

  await page.evaluate(async () => {
    const randomDelay = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;

    await new Promise<void>((resolve) => {
      let scrollAttempts = 0;
      const maxAttempts = 2; // 最多滚动 2 轮
      let lastHeight = 0;
      let unchangedCount = 0;
      const startTime = Date.now();
      const maxScrollTime = 8000; // 最大滚动时间 8 秒

      const performScroll = () => {
        let totalHeight = 0;
        const distance = 400 + randomDelay(-100, 100);
        const scrollDelay = randomDelay(60, 120); // 更快的滚动间隔

        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;

          // 检测是否有新内容加载
          if (scrollHeight !== lastHeight) {
            lastHeight = scrollHeight;
            unchangedCount = 0;
          } else {
            unchangedCount++;
          }

          // 更自然的滚动: 带微小随机偏移
          const randomOffset = randomDelay(-20, 20);
          window.scrollBy(0, distance + randomOffset);
          totalHeight += distance;

          // 检测滚动完成条件
          const reachedBottom = totalHeight >= scrollHeight && unchangedCount > 2;
          const timeExceeded = Date.now() - startTime > maxScrollTime;

          if (reachedBottom || timeExceeded) {
            clearInterval(timer);
            scrollAttempts++;

            if (scrollAttempts < maxAttempts && !timeExceeded) {
              // 回到顶部,准备下一轮
              window.scrollTo(0, 0);
              setTimeout(performScroll, randomDelay(300, 500));
            } else {
              // 滚动完成,回到顶部
              window.scrollTo(0, 0);
              setTimeout(resolve, randomDelay(800, 1200));
            }
          }
        }, scrollDelay);
      };

      performScroll();
    });
  });

  console.log("  ✅ 滚动完成");
}

/**
 * 等待资源加载完成(图片、字体)
 */
export async function waitForResourcesLoad(page: Page): Promise<void> {
  // 优化网络等待
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 });
  } catch {
    // 网络未完全空闲也继续
  }

  // 并行等待图片和字体加载
  const [imagesLoaded, fontsLoaded] = await Promise.allSettled([
    // 等待图片加载(最多 2s)
    page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return Promise.race([
        Promise.allSettled(
          imgs
            .filter((img) => !img.complete)
            .map((img) =>
              new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              })
            )
        ),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    }),
    // 等待字体加载(最多 1.5s)
    page.evaluate(() =>
      Promise.race([
        (document as any).fonts.ready,
        new Promise((r) => setTimeout(r, 1500)),
      ]).catch(() => {})
    ),
  ]);

  // 日志记录加载状态
  if (imagesLoaded.status === "fulfilled") {
    console.log("  ✅ 图片加载完成");
  } else {
    console.log("  ⏭️  图片加载超时,继续进行");
  }
  if (fontsLoaded.status === "fulfilled") {
    console.log("  ✅ 字体加载完成");
  } else {
    console.log("  ⏭️  字体加载超时,继续进行");
  }

  // 等待 CSS 过渡完成
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
}