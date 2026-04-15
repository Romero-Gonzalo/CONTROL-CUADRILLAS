export type MakeInstallationPayload = {
  fecha: string;
  cuadrilla: string;
  idInstalacion: string;
  observaciones: string;
  usuario: string;
  dayKey: string;
};

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

export async function sendInstallationToMake(payload: MakeInstallationPayload) {
  const endpoint = resolveMakeWebhookUrl();
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
