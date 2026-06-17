import { createLogoutResponse } from "@/services/authService";

export async function POST() {
  return createLogoutResponse();
}
