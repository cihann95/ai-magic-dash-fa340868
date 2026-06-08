// Upstash Redis REST client (lightweight, no deps)
// Tüm Blitz edge functions tarafından paylaşılır.
const URL = Deno.env.get("UPSTASH_REDIS_REST_URL");
const TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

export const redisEnabled = !!(URL && TOKEN);

async function call(command: (string | number)[]): Promise<any> {
  if (!redisEnabled) return null;
  const r = await fetch(URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!r.ok) {
    console.error("redis error", r.status, await r.text());
    return null;
  }
  const data = await r.json();
  return data.result;
}

async function pipeline(commands: (string | number)[][]): Promise<any[]> {
  if (!redisEnabled) return [];
  const r = await fetch(`${URL!}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!r.ok) {
    console.error("redis pipeline error", r.status, await r.text());
    return [];
  }
  const data = await r.json();
  return data.map((x: any) => x.result);
}

export const redis = {
  set: (k: string, v: string | number, ttl?: number) =>
    ttl ? call(["SET", k, v, "EX", ttl]) : call(["SET", k, v]),
  get: (k: string) => call(["GET", k]),
  del: (...keys: string[]) => call(["DEL", ...keys]),
  hset: (k: string, field: string, v: string | number) => call(["HSET", k, field, v]),
  hsetAll: (k: string, obj: Record<string, string | number>) => {
    const args: (string | number)[] = ["HSET", k];
    for (const [f, v] of Object.entries(obj)) args.push(f, v);
    return call(args);
  },
  hget: (k: string, field: string) => call(["HGET", k, field]),
  hgetall: async (k: string): Promise<Record<string, string>> => {
    const res = await call(["HGETALL", k]);
    if (!res || !Array.isArray(res)) return {};
    const out: Record<string, string> = {};
    for (let i = 0; i < res.length; i += 2) out[res[i]] = res[i + 1];
    return out;
  },
  hdel: (k: string, ...fields: string[]) => call(["HDEL", k, ...fields]),
  sadd: (k: string, ...members: string[]) => call(["SADD", k, ...members]),
  smembers: (k: string) => call(["SMEMBERS", k]),
  srem: (k: string, ...members: string[]) => call(["SREM", k, ...members]),
  rpush: (k: string, ...values: string[]) => call(["RPUSH", k, ...values]),
  lpop: (k: string) => call(["LPOP", k]),
  lrem: (k: string, count: number, value: string) => call(["LREM", k, count, value]),
  lrange: (k: string, start: number, stop: number) => call(["LRANGE", k, start, stop]),
  expire: (k: string, seconds: number) => call(["EXPIRE", k, seconds]),
  pipeline,
};
