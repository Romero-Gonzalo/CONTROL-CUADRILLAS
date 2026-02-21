export type Role = "AUDITOR" | "INSTALLER";

export type UserProfile = {
  uid: string;
  role: Role;
  squadId?: string; // solo para INSTALLER
  displayName: string; // ej: "Cuadrilla 07 (Jefe)"
};