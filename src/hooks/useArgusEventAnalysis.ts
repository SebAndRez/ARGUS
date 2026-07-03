"use client";

import { useEffect, useMemo, useState } from "react";
import type { ArgusRiskAssessment } from "@/types/riskAssessment";
import type { ArgusPredictionResult } from "@/types/predictiveCore";

export interface ArgusEventAnalysisQuery {
  eventId?: string;
  externalEventId?: string;
  reportId?: string;
  sourceId?: string;
  externalId?: string;
  eventKind?: string;
}

interface ArgusEventAnalysisState {
  loading: boolean;
  error: string | null;
  assessments: ArgusRiskAssessment[];
  primaryAssessment: ArgusRiskAssessment | null;
  predictiveAnalysis: ArgusPredictionResult | null;
  emptyReason: string | null;
}

function buildQuery(input: ArgusEventAnalysisQuery) {
  const params = new URLSearchParams({ limit: "3" });
  const relatedExternalEventId = input.externalEventId ?? input.eventId;

  if (relatedExternalEventId) {
    params.set("relatedExternalEventId", relatedExternalEventId);
  }
  if (input.externalEventId) params.set("externalEventId", input.externalEventId);
  if (input.reportId) params.set("reportId", input.reportId);
  if (input.sourceId) params.set("sourceId", input.sourceId);
  if (input.externalId) params.set("externalId", input.externalId);

  return params;
}

function buildPredictiveQuery(input: ArgusEventAnalysisQuery) {
  const params = new URLSearchParams({ limit: "1" });
  const inputId = input.reportId ?? input.externalEventId ?? input.eventId;
  if (inputId) params.set("inputId", inputId);
  if (input.reportId) {
    params.set("kind", input.eventKind === "sos" || input.eventKind === "SOS" ? "sos" : "citizen_report");
  } else if (input.eventKind) {
    params.set("kind", input.eventKind);
  }
  return params;
}

export function useArgusEventAnalysis(input: ArgusEventAnalysisQuery) {
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        eventId: input.eventId,
        externalEventId: input.externalEventId,
        reportId: input.reportId,
        sourceId: input.sourceId,
        externalId: input.externalId,
        eventKind: input.eventKind,
      }),
    [
      input.eventId,
      input.externalEventId,
      input.reportId,
      input.sourceId,
      input.externalId,
      input.eventKind,
    ]
  );
  const [state, setState] = useState<ArgusEventAnalysisState>({
    loading: false,
    error: null,
    assessments: [],
    primaryAssessment: null,
    predictiveAnalysis: null,
    emptyReason: null,
  });

  useEffect(() => {
    const parsed = JSON.parse(requestKey) as ArgusEventAnalysisQuery;
    const hasQuery = Boolean(
      parsed.eventId ||
        parsed.externalEventId ||
        parsed.reportId ||
        parsed.sourceId ||
        parsed.externalId
    );

    if (!hasQuery) {
      queueMicrotask(() => {
        setState({
          loading: false,
          error: null,
          assessments: [],
          primaryAssessment: null,
          predictiveAnalysis: null,
          emptyReason: "Sin identificador suficiente para consultar hipotesis.",
        });
      });
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      setState((current) => ({ ...current, loading: true, error: null }));
    });

    async function loadAnalysis() {
      try {
        const predictiveResponse = await fetch(
          `/api/predictive/analysis?${buildPredictiveQuery(parsed)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const predictivePayload = (await predictiveResponse.json()) as {
          analyses?: ArgusPredictionResult[];
          error?: string;
        };

        const response = await fetch(`/api/risk-assessments?${buildQuery(parsed)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          assessments?: ArgusRiskAssessment[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "ARGUS no pudo revisar evidencia.");
        }

        const assessments = Array.isArray(payload.assessments)
          ? payload.assessments
          : [];
        setState({
          loading: false,
          error: null,
          assessments,
          primaryAssessment: assessments[0] ?? null,
          predictiveAnalysis: predictivePayload.analyses?.[0] ?? null,
          emptyReason:
            assessments.length === 0 && !predictivePayload.analyses?.[0]
              ? "ARGUS necesita mas evidencia o correlaciones para elevar una hipotesis."
              : null,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "ARGUS no pudo revisar evidencia.",
          assessments: [],
          primaryAssessment: null,
          predictiveAnalysis: null,
          emptyReason: null,
        });
      }
    }

    loadAnalysis();
    return () => controller.abort();
  }, [requestKey]);

  return state;
}
