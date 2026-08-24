/**
 * 高德开放平台 Web 服务 API 封装
 * 需要环境变量 AMAP_API_KEY（https://console.amap.com 申请，选择"Web服务"类型 key）
 */

const BASE = "https://restapi.amap.com";

export class AmapError extends Error {}

function checkV3(data: any, what: string): any {
  // v3 接口: status "1" 成功；失败时 info/infocode 说明原因
  if (data && data.status === "1") return data;
  const code = data?.infocode ?? "?";
  const info = data?.info ?? "未知错误";
  const hint = code === "10001" ? "（key 无效，请检查 AMAP_API_KEY）" : code === "10044" ? "（QPS 超限，稍后重试）" : "";
  throw new AmapError(`高德${what}失败 [${code}]: ${info} ${hint}`);
}

export class Amap {
  constructor(private key: string) {}

  /**
   * 关键词 POI 搜索
   * @returns pois: [{ name, type, address, location(lng,lat), tel, biz_ext(评分/费用) , photos }]
   */
  async poiSearch(params: { keywords: string; city?: string; citylimit?: boolean; page?: number; signal?: AbortSignal }) {
    const q = new URLSearchParams({
      key: this.key,
      keywords: params.keywords,
      offset: "10",
      page: String(params.page ?? 1),
      extensions: "all",
    });
    if (params.city) q.set("city", params.city);
    if (params.citylimit) q.set("citylimit", "true");

    const resp = await fetch(`${BASE}/v3/place/text?${q}`, { signal: params.signal });
    const data = await resp.json();
    checkV3(data, "POI 搜索");
    return {
      count: data.count,
      pois: (data.pois ?? []).map((p: any) => ({
        name: p.name,
        type: p.type,
        address: p.address,
        district: `${p.pname ?? ""}${p.cityname ?? ""}${p.adname ?? ""}`,
        location: p.location, // "lng,lat"
        tel: p.tel,
        rating: p.biz_ext?.rating,
        cost: p.biz_ext?.cost,
        openingTime: p.biz_ext?.opening_time,
        photo: p.photos?.[0]?.url,
      })),
    };
  }

  /** 地理编码：地址 → 坐标 */
  async geocode(params: { address: string; city?: string; signal?: AbortSignal }) {
    const q = new URLSearchParams({ key: this.key, address: params.address });
    if (params.city) q.set("city", params.city);
    const resp = await fetch(`${BASE}/v3/geocode/geo?${q}`, { signal: params.signal });
    const data = await resp.json();
    checkV3(data, "地理编码");
    const geos = data.geocodes ?? [];
    if (geos.length === 0) throw new AmapError(`地理编码无结果: ${params.address}`);
    return { location: geos[0].location, formatted: geos[0].formatted_address, level: geos[0].level };
  }

  /**
   * 路线规划
   * walking/driving: v3；bicycling: v4；transit: v3 (需 city)
   * @returns { distance(米), duration(秒), strategy/方案摘要 }
   */
  async route(params: {
    mode: "walking" | "driving" | "transit" | "bicycling";
    origin: string; // "lng,lat"
    destination: string; // "lng,lat"
    city?: string; // transit 必填
    signal?: AbortSignal;
  }) {
    const { mode, origin, destination, city, signal } = params;

    if (mode === "bicycling") {
      const q = new URLSearchParams({ key: this.key, origin, destination });
      const resp = await fetch(`${BASE}/v4/direction/bicycling?${q}`, { signal });
      const data = await resp.json();
      if (data.errcode !== 0) throw new AmapError(`高德骑行规划失败 [${data.errcode}]: ${data.errmsg}`);
      const path = data.data?.paths?.[0];
      if (!path) throw new AmapError("骑行规划无路线");
      return {
        mode,
        distance: Number(path.distance),
        duration: Number(path.duration),
      };
    }

    if (mode === "transit") {
      if (!city) throw new AmapError("公交规划需要 city 参数");
      const q = new URLSearchParams({ key: this.key, origin, destination, city, strategy: "0" });
      const resp = await fetch(`${BASE}/v3/direction/transit/integrated?${q}`, { signal });
      const data = await resp.json();
      checkV3(data, "公交规划");
      const transits = data.route?.transits ?? [];
      if (transits.length === 0) throw new AmapError("公交规划无方案（考虑打车/步行）");
      const t = transits[0];
      return {
        mode,
        distance: Number(data.route.distance),
        duration: Number(t.duration),
        waiting: t.waiting_time ? Number(t.waiting_time) : undefined,
        walkDistance: t.walking_distance ? Number(t.walking_distance) : undefined,
        segments: (t.segments ?? [])
          .flatMap((s: any) => s.bus?.buslines ?? [])
          .slice(0, 5)
          .map((b: any) => `${b.name} (${b.departure_stop?.name} → ${b.arrival_stop?.name}, ${b.duration}s)`),
      };
    }

    // walking / driving (v3)
    const q = new URLSearchParams({ key: this.key, origin, destination });
    const path = mode === "walking" ? "/v3/direction/walking" : "/v3/direction/driving";
    if (mode === "driving") q.set("strategy", "32"); // 时间优先
    const resp = await fetch(`${BASE}${path}?${q}`, { signal });
    const data = await resp.json();
    checkV3(data, mode === "walking" ? "步行规划" : "驾车规划");
    const p = data.route?.paths?.[0];
    if (!p) throw new AmapError("路线规划无结果");
    return {
      mode,
      distance: Number(p.distance),
      duration: Number(p.duration),
      strategy: p.strategy,
      tolls: mode === "driving" ? Number(p.tolls ?? 0) : undefined,
    };
  }
}
