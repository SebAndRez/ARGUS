import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bloque 8 / Fase E-H — guard SSRF central. DNS se mockea explícitamente
 * (`node:dns/promises`); `fetch` global ya está bloqueado por defecto por
 * `tests/setup.ts` y se re-stubea puntualmente en los casos "permitidos".
 */

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "node:dns/promises";
import {
  assertSafeOutboundUrl,
  safeOutboundFetch,
  SsrfGuardError,
  validateHost,
} from "@/lib/security/ssrfGuard";

const lookupMock = vi.mocked(lookup);

beforeEach(() => {
  // Por defecto, cualquier hostname "parece" público a menos que un test
  // configure lo contrario explícitamente.
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("validateHost — permitidos", () => {
  it("hostname público resuelve a IP pública", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const result = await validateHost("example.com");
    expect(result.ok).toBe(true);
  });

  it("api.open-meteo.com resuelve a IP pública", async () => {
    lookupMock.mockResolvedValue([{ address: "151.101.1.1", family: 4 }] as never);
    const result = await validateHost("api.open-meteo.com");
    expect(result.ok).toBe(true);
  });
});

describe("validateHost — bloqueados por nombre reservado", () => {
  it.each(["localhost", "localhost:3000".split(":")[0], "metadata.google.internal", "service.internal"])(
    "%s es bloqueado",
    async (host) => {
      const result = await validateHost(host);
      expect(result.ok).toBe(false);
      expect(lookupMock).not.toHaveBeenCalled();
    }
  );
});

describe("validateHost — bloqueados por IPv4 reservada", () => {
  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "255.255.255.255"])(
    "%s es bloqueado",
    async (ip) => {
      const result = await validateHost(ip);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/reserved range/);
    }
  );
});

describe("validateHost — bloqueados por representación alternativa de IPv4", () => {
  it.each(["2130706433", "0x7f000001", "017700000001", "127.1"])("%s es rechazado sin resolver DNS", async (form) => {
    const result = await validateHost(form);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/non-canonical/);
    expect(lookupMock).not.toHaveBeenCalled();
  });
});

describe("validateHost — bloqueados por IPv6 reservada", () => {
  it.each(["::1", "fc00::1", "fe80::1", "::"])("%s es bloqueado", async (ip) => {
    const result = await validateHost(ip);
    expect(result.ok).toBe(false);
  });
});

describe("validateHost — DNS rebinding / resolución privada", () => {
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254"])(
    "hostname aparentemente publico que resuelve a %s (IPv4) es rechazado",
    async (privateIp) => {
      lookupMock.mockResolvedValue([{ address: privateIp, family: 4 }] as never);
      const result = await validateHost("looks-public-but-rebinds.example.com");
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/reserved IPv4/);
    }
  );

  it("hostname que resuelve a ::1 (IPv6) es rechazado", async () => {
    lookupMock.mockResolvedValue([{ address: "::1", family: 6 }] as never);
    const result = await validateHost("looks-public-but-rebinds.example.com");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/reserved IPv6/);
  });

  it("hostname con múltiples respuestas: si CUALQUIERA es privada, se rechaza", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ] as never);
    const result = await validateHost("mixed-answers.example.com");
    expect(result.ok).toBe(false);
  });
});

describe("assertSafeOutboundUrl — esquema y credenciales", () => {
  it("bloquea esquemas no https por defecto", async () => {
    await expect(assertSafeOutboundUrl("file:///etc/passwd")).rejects.toThrow(SsrfGuardError);
    await expect(assertSafeOutboundUrl("gopher://127.0.0.1")).rejects.toThrow(SsrfGuardError);
    await expect(assertSafeOutboundUrl("ftp://127.0.0.1")).rejects.toThrow(SsrfGuardError);
  });

  it("bloquea URLs con credenciales embebidas", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(assertSafeOutboundUrl("https://user:password@example.com")).rejects.toThrow(
      /embedded credentials/
    );
  });

  it("URL invalida lanza SsrfGuardError, no una excepcion generica", async () => {
    await expect(assertSafeOutboundUrl("not a url")).rejects.toThrow(SsrfGuardError);
  });

  it("permite https explicitamente, rechaza http si no se habilita", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(assertSafeOutboundUrl("https://example.com")).resolves.toBeInstanceOf(URL);
    await expect(assertSafeOutboundUrl("http://example.com")).rejects.toThrow(/blocked protocol/);
  });
});

describe("safeOutboundFetch — redirecciones", () => {
  it("bloquea un redirect de un host publico a un host privado", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeOutboundFetch("https://public.example.com/start")).rejects.toThrow(SsrfGuardError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sigue un redirect hacia otro host publico y devuelve la respuesta final", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://public.example.com/final" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await safeOutboundFetch("https://public.example.com/start");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("detiene despues del maximo de redirecciones configurado", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://public.example.com/loop" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeOutboundFetch("https://public.example.com/start", {}, { maxRedirects: 2 })).rejects.toThrow(
      /too many redirects/
    );
    // intento inicial + 2 redirects = 3 llamadas antes de agotar el limite
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("safeOutboundFetch — timeout", () => {
  it("aborta una solicitud que excede el timeout configurado", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeOutboundFetch("https://public.example.com/slow", {}, { timeoutMs: 5 })).rejects.toThrow();
  });
});
