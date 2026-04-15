export type MakeInstallationPayload = {
  fecha: string;
  cuadrilla: string;
  idInstalacion: string;
  observaciones: string;
  usuario: string;
  dayKey: string;
};

type MakeDeliveryMode = "cors-json" | "no-cors-text";

const DEFAULT_MAKE_WEBHOOK_URL =
  "https://hook.us2.make.com/v23jm0lxoyl5761tqns5eziefxbkczws";

function resolveMakeWebhookUrl() {
  const configuredWebhook = (import.meta.env.VITE_MAKE_WEBHOOK_URL as string | undefined)?.trim();
  return configuredWebhook || DEFAULT_MAKE_WEBHOOK_URL;
}

export function getReadableNowTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

async function sendWithCorsJson(endpoint: string, payload: MakeInstallationPayload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Make webhook respondió ${response.status} ${response.statusText}. Body: ${responseBody}`,
    );
  }
}

async function sendWithNoCorsFallback(endpoint: string, payload: MakeInstallationPayload) {
  await fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
}

function shouldUseNoCorsFallback(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.message.includes("403") ||
    error.message.includes("405") ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  );
}

export async function sendInstallationToMake(
  payload: MakeInstallationPayload,
): Promise<{ mode: MakeDeliveryMode }> {
  const endpoint = resolveMakeWebhookUrl();

  try {
    await sendWithCorsJson(endpoint, payload);
    return { mode: "cors-json" };
  } catch (error) {
    if (!shouldUseNoCorsFallback(error)) throw error;

    await sendWithNoCorsFallback(endpoint, payload);
    return { mode: "no-cors-text" };
  }
}