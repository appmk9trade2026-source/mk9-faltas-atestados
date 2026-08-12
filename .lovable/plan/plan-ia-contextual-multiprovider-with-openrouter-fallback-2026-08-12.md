# Plan: IA Contextual Multiprovider with OpenRouter Fallback

This plan implements a server-side fallback mechanism for the Action Plan AI suggestions. It ensures that if the primary Lovable AI Gateway fails (due to rate limits, timeouts, or transient errors), the system automatically attempts to get a suggestion from OpenRouter before returning an error to the user.

## Proposed Changes

### Backend Logic (`src/lib/planos-acao-ia.functions.ts`)

- Refactor `gerarSugestaoPlanoAcao` to include a fallback block.
- Refactor `gerarResumoGerencialIA` to include a fallback block.
- Implement a generic `callAiWithFallback` utility (or internal logic) that:
    1. Attempts Lovable AI Gateway.
    2. Checks if the error is "eligible" for fallback (429, 5xx, timeout, or general fetch failure).
    3. If eligible and `OPENROUTER_API_KEY` is present, attempts OpenRouter.
    4. Normalizes the JSON output to match the existing contract.

### Assistant Infrastructure (Refinement)

- Update `src/lib/assistente/ai-provider.server.ts` to optionally support OpenRouter if we want to centralize provider logic (though the plan asks specifically for the Action Plan AI). I will focus on the server functions as requested.

## Technical Details

- **OpenRouter Endpoint:** `https://openrouter.ai/api/v1/chat/completions`
- **Fallback Model:** `google/gemini-2.0-flash-001` (or equivalent authorized for the key).
- **Security:** API Key read only within the server function handler.
- **Normalization:** Ensure both providers return the same JSON schema (Meta SMART, Indicadores, Ações).

## Verification Plan

### Automated Tests (Playwright)
- Create a diagnostic script that mocks or triggers AI failures (if possible via environment) to verify the fallback logic.
- Verify that the API Key is never exposed in network traces or browser logs.

### Manual Verification
- Check server logs for `provider: openrouter` and `fallback_used: true` during simulated outages.
- Verify that the Home route (`/`) remains a pure redirect.
