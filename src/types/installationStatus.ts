export type WorkflowStatus =
  | "PENDIENTE"
  | "SOLUCIONADO"
  | "NO_SOLUCIONADO"
  | "RECHAZADO";

export type InstallationStatus = "FINALIZADA" | "PENDIENTE" | "NO_SOLUCIONADA";

export type InstallationReason =
  | "NO_ATENDIO"
  | "NO_ESTABAN"
  | "RECHAZA_SERVICIO"
  | "RECOORDINAR"
  | "OTRO";
