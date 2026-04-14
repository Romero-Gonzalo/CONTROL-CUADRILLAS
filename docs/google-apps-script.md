# Google Apps Script recomendado (robusto) para recibir IDs de instalación

Este script está pensado para usarse como **Web App** de Google Apps Script y recibir POST desde el front.

## Qué resuelve
- Valida campos obligatorios.
- Protege con token (`x-api-key`) opcional.
- Evita duplicados por `idInstalacion` (idempotencia básica).
- Usa `LockService` para reducir condiciones de carrera.
- Escribe siempre con `appendRow` y registra timestamp.
- Devuelve JSON con estado y mensaje.

## Estructura sugerida de hoja
Hoja: `Migraciones`

Columnas (fila 1):
1. `createdAt`
2. `idInstalacion`
3. `squadId`
4. `userId`
5. `source`
6. `status`
7. `error`

## Código (`Code.gs`)
```javascript
const SHEET_NAME = 'Migraciones';
const HEADER_ROW = 1;

/**
 * Configuración por Script Properties:
 * - SHEET_ID: ID del Google Sheet destino.
 * - API_KEY: token compartido para validar requests (opcional pero recomendado).
 */
function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    sheetId: props.getProperty('SHEET_ID'),
    apiKey: props.getProperty('API_KEY') || '',
  };
}

function jsonResponse_(obj, code) {
  // Apps Script no permite setear status code directo en TextOutput,
  // así que devolvemos siempre JSON con campos `ok`, `code`, etc.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Body vacío');
  }

  const raw = e.postData.contents;

  // Soporta JSON (recomendado)
  try {
    return JSON.parse(raw);
  } catch (_err) {
    // Fallback: x-www-form-urlencoded
    return e.parameter || {};
  }
}

function normalize_(payload) {
  return {
    idInstalacion: String(payload.idInstalacion || '').trim(),
    squadId: String(payload.squadId || '').trim(),
    userId: String(payload.userId || '').trim(),
    source: String(payload.source || 'control-cuadrillas').trim(),
  };
}

function validate_(data) {
  if (!data.idInstalacion) throw new Error('idInstalacion es obligatorio');
  if (!data.squadId) throw new Error('squadId es obligatorio');
  if (!data.userId) throw new Error('userId es obligatorio');
}

function getSheet_() {
  const cfg = getConfig_();
  if (!cfg.sheetId) throw new Error('Falta Script Property SHEET_ID');

  const ss = SpreadsheetApp.openById(cfg.sheetId);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No existe la hoja: ' + SHEET_NAME);
  return sheet;
}

function findByInstallationId_(sheet, idInstalacion) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW) return -1;

  // Columna B = idInstalacion
  const values = sheet.getRange(HEADER_ROW + 1, 2, lastRow - HEADER_ROW, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]).trim() === idInstalacion) {
      return HEADER_ROW + 1 + i;
    }
  }
  return -1;
}

function appendSuccess_(sheet, data) {
  sheet.appendRow([
    new Date(),
    data.idInstalacion,
    data.squadId,
    data.userId,
    data.source,
    'synced',
    '',
  ]);
}

function appendError_(sheet, data, err) {
  sheet.appendRow([
    new Date(),
    data.idInstalacion || '',
    data.squadId || '',
    data.userId || '',
    data.source || 'control-cuadrillas',
    'error',
    String(err && err.message ? err.message : err),
  ]);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  let data = null;
  try {
    const cfg = getConfig_();

    // API key opcional
    const incomingKey = (e && e.parameter && e.parameter.apiKey) || '';
    if (cfg.apiKey && incomingKey !== cfg.apiKey) {
      return jsonResponse_({ ok: false, code: 401, message: 'Unauthorized' });
    }

    const payload = parseBody_(e);
    data = normalize_(payload);
    validate_(data);

    const sheet = getSheet_();

    // Idempotencia: si ya existe idInstalacion, no duplica
    const existingRow = findByInstallationId_(sheet, data.idInstalacion);
    if (existingRow !== -1) {
      return jsonResponse_({
        ok: true,
        code: 200,
        duplicated: true,
        message: 'ID ya existente; no se duplica.',
        idInstalacion: data.idInstalacion,
      });
    }

    appendSuccess_(sheet, data);

    return jsonResponse_({
      ok: true,
      code: 200,
      duplicated: false,
      message: 'ID guardado correctamente.',
      idInstalacion: data.idInstalacion,
    });
  } catch (err) {
    try {
      const sheet = getSheet_();
      appendError_(sheet, data || {}, err);
    } catch (_ignore) {}

    return jsonResponse_({
      ok: false,
      code: 500,
      message: String(err && err.message ? err.message : err),
    });
  } finally {
    try { lock.releaseLock(); } catch (_e) {}
  }
}

function doGet() {
  return jsonResponse_({ ok: true, message: 'Apps Script activo', at: new Date().toISOString() });
}
```

## Deploy
1. En Apps Script: **Deploy > New deployment > Web app**.
2. Execute as: **Me**.
3. Who has access: **Anyone** (o restringido según necesidad).
4. Copiar la URL de Web App.

## Script Properties (obligatorio)
En Apps Script: **Project Settings > Script Properties**
- `SHEET_ID` = ID del Google Sheet.
- `API_KEY` = token secreto (opcional pero recomendado).

## Integración con el front actual
El front envía JSON con:
- `idInstalacion`
- `squadId`
- `userId`
- `source`

Configurar variable de entorno en la app:
- `VITE_APPS_SCRIPT_WEBAPP_URL=https://script.google.com/macros/s/.../exec`
- `VITE_APPS_SCRIPT_API_KEY=tu-token` (opcional, solo si configuraste `API_KEY` en Apps Script)

Si activas `API_KEY`, envíala también en el payload o como query param `?apiKey=...`.

## Error común: 401 Unauthorized
- Verificar que el Web App esté desplegado con acceso compatible con tu app cliente.
- Si configuraste `API_KEY` en Script Properties, también definir `VITE_APPS_SCRIPT_API_KEY` en el front.
- Si cambiaste permisos o código, redeployar y usar la URL `/exec` del deployment vigente.

## Nota importante de respuesta JSON
- Este script responde siempre HTTP 200 con JSON `{ ok: true|false, message }`.
- El cliente debe validar también el campo `ok` del JSON, no solo `response.ok` HTTP.
