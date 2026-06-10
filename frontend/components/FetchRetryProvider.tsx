"use client";

import { useEffect } from "react";

const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MAX_ATTEMPTS = 8;

function getMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function getDelay(attempt: number) {
  const baseDelay = Math.min(1200 * 2 ** attempt, 12000);
  return baseDelay + Math.floor(Math.random() * 350);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function FetchRetryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const method = getMethod(input, init);
      const canRetry = RETRYABLE_METHODS.has(method);

      if (!canRetry) {
        return originalFetch(input, init);
      }

      let lastError: unknown;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          const response = await originalFetch(input, init);

          if (
            !RETRYABLE_STATUSES.has(response.status) ||
            attempt === MAX_ATTEMPTS - 1
          ) {
            return response;
          }
        } catch (error) {
          lastError = error;

          if (attempt === MAX_ATTEMPTS - 1) {
            throw error;
          }
        }

        await wait(getDelay(attempt));
      }

      throw lastError;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <>{children}</>;
}
