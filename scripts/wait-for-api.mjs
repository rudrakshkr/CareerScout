const HEALTH_URL = process.env.CAREERSCOUT_API_HEALTH_URL || 'http://127.0.0.1:3001/api/health';
const TIMEOUT_MS = 45_000;
const REQUEST_TIMEOUT_MS = 1_200;
const RETRY_DELAY_MS = 250;

const startedAt = Date.now();
const deadline = startedAt + TIMEOUT_MS;
let lastError = 'No response received yet';

console.log(`Waiting for the CareerScout API: ${HEALTH_URL}`);

while (Date.now() < deadline) {
  try {
    const response = await fetch(HEALTH_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) {
      const health = await response.json();
      if (health?.status === 'ok' && health?.service === 'career-scout-api') {
        console.log(`CareerScout API is ready (${Date.now() - startedAt} ms). Starting dashboard.`);
        process.exit(0);
      }
      lastError = `Health endpoint returned an unexpected response (HTTP ${response.status}).`;
    } else {
      lastError = `Health endpoint returned HTTP ${response.status}.`;
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
}

console.error(`CareerScout API did not become ready within ${TIMEOUT_MS / 1000} seconds. Last check: ${lastError}`);
process.exit(1);
