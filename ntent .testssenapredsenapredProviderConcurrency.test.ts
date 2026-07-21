warning: in the working copy of 'src/lib/sources/chile/senapredProvider.ts', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/src/lib/sources/chile/senapredProvider.ts b/src/lib/sources/chile/senapredProvider.ts[m
[1mindex e3118f7..7e5ed11 100644[m
[1m--- a/src/lib/sources/chile/senapredProvider.ts[m
[1m+++ b/src/lib/sources/chile/senapredProvider.ts[m
[36m@@ -35,6 +35,18 @@[m [mconst SENAPRED_EVENTOS_BASE_URL = "https://www.senapred.cl/eventos/";[m
 /** Cheap pre-filter so we don't fetch full per-alert detail (comuna/provincia breakdown) for every routine green/monitoring alert — only for ones plausibly severe. Actual classification happens in `severeWeatherClassifier`. */[m
 const DETAIL_WORTHY_PATTERN = /roja|naranja|tornado|tromba|viento|tormenta|el[ée]ctrica|remoci[oó]n|aluvi[oó]n|inundaci[oó]n|desborde/i;[m
 [m
[32m+[m[32m/**[m
[32m+[m[32m * Confirmed root cause of the Global Watch 300s timeout (2026-07-21 audit):[m
[32m+[m[32m * this was previously a plain `for` loop doing `await fetchAlertaDetail(item.id)`[m
[32m+[m[32m * one at a time. During an active severe-weather period, dozens of alerts[m
[32m+[m[32m * match `DETAIL_WORTHY_PATTERN`, turning into that many strictly sequential[m
[32m+[m[32m * AppSync round trips with no concurrency — the single largest contributor[m
[32m+[m[32m * to the timeout. Bounded to a fixed worker-pool concurrency instead (same[m
[32m+[m[32m * queue-shift idiom already used by `globalWatchEngine.ts`'s[m
[32m+[m[32m * `PERSIST_CONCURRENCY`), not an unbounded `Promise.all`.[m
[32m+[m[32m */[m
[32m+[m[32mconst DETAIL_FETCH_CONCURRENCY = 8;[m
[32m+[m
 function stripHtml(value?: string): string {[m
   return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();[m
 }[m
[36m@@ -76,23 +88,44 @@[m [mexport async function fetchChileOfficialAlertsRaw(params?: {[m
   } while (nextToken && page < maxPages);[m
   if (nextToken) warnings.push(`Stopped after ${maxPages} pages; more SENAPRED alerts may exist in range.`);[m
 [m
[31m-  const alerts: ChileOfficialAlertRaw[] = [];[m
[31m-  for (const item of allItems) {[m
[32m+[m[32m  // Pass 1 (sync, cheap): derive per-item fields and decide which alerts[m
[32m+[m[32m  // actually need a detail lookup — no network I/O yet.[m
[32m+[m[32m  const prepared = allItems.map((item) => {[m
     const regionNames = item.regionesIds.map((id) => regionById.get(id)).filter((name): name is string => Boolean(name));[m
     const levelText = item.variableRiesgo?.tipoAlerta?.nombre ?? "";[m
     const threatTextBase = `${item.variableRiesgo?.nombre ?? ""} ${stripHtml(item.contenido)}`.trim();[m
[32m+[m[32m    const needsDetail = DETAIL_WORTHY_PATTERN.test(`${item.titulo} ${levelText} ${threatTextBase}`);[m
[32m+[m[32m    return { item, regionNames, levelText, threatTextBase, needsDetail };[m
[32m+[m[32m  });[m
 [m
[32m+[m[32m  // Pass 2 (network, bounded concurrency): fetch full detail only for the[m
[32m+[m[32m  // alerts that need it, `DETAIL_FETCH_CONCURRENCY` at a time instead of one[m
[32m+[m[32m  // at a time — same outcome per alert (best-effort, `null` on failure),[m
[32m+[m[32m  // just no longer serialized behind each other's round-trip latency.[m
[32m+[m[32m  const detailIds = prepared.filter((p) => p.needsDetail).map((p) => p.item.id);[m
[32m+[m[32m  const detailById = new Map<string, Awaited<ReturnType<typeof fetchAlertaDetail>>>();[m
[32m+[m[32m  const detailQueue = [...detailIds];[m
[32m+[m[32m  async function detailWorker() {[m
[32m+[m[32m    for (let id = detailQueue.shift(); id; id = detailQueue.shift()) {[m
[32m+[m[32m      const detail = await fetchAlertaDetail(id).catch(() => null);[m
[32m+[m[32m      if (detail) detailById.set(id, detail);[m
[32m+[m[32m    }[m
[32m+[m[32m  }[m
[32m+[m[32m  await Promise.all(Array.from({ length: Math.min(DETAIL_FETCH_CONCURRENCY, detailIds.length) }, () => detailWorker()));[m
[32m+[m
[32m+[m[32m  // Pass 3 (sync): assemble the final alerts using the pre-fetched details.[m
[32m+[m[32m  const alerts: ChileOfficialAlertRaw[] = prepared.map(({ item, regionNames, levelText, threatTextBase, needsDetail }) => {[m
     let province: string | undefined;[m
     let commune: string | undefined;[m
[31m-    if (DETAIL_WORTHY_PATTERN.test(`${item.titulo} ${levelText} ${threatTextBase}`)) {[m
[31m-      const detail = await fetchAlertaDetail(item.id).catch(() => null);[m
[32m+[m[32m    if (needsDetail) {[m
[32m+[m[32m      const detail = detailById.get(item.id);[m
       if (detail) {[m
         province = detail.provincias.map((id) => provinciaById.get(id)).find(Boolean);[m
         commune = detail.comunas.map((id) => comunaById.get(id)).find(Boolean);[m
       }[m
     }[m
 [m
[31m-    alerts.push({[m
[32m+[m[32m    return {[m
       title: stripHtml(item.titulo),[m
       region: regionNames[0],[m
       province,[m
[36m@@ -101,11 +134,11 @@[m [mexport async function fetchChileOfficialAlertsRaw(params?: {[m
       levelText,[m
       issuedAt: toIsoDate(item.fechaHora),[m
       updatedAt: toIsoDate(item.fechaHora),[m
[31m-      sourceId: "senapred_eventos",[m
[32m+[m[32m      sourceId: "senapred_eventos" as const,[m
       evidenceUrl: item.urlAccess ? `${SENAPRED_EVENTOS_BASE_URL}${item.urlAccess}` : SENAPRED_EVENTOS_BASE_URL,[m
       contenido: item.contenido,[m
[31m-    });[m
[31m-  }[m
[32m+[m[32m    };[m
[32m+[m[32m  });[m
 [m
   return { alerts, warnings, errors };[m
 }[m
