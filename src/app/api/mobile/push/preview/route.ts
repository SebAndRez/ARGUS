import { NextResponse } from "next/server";
import {
  buildDeadManSwitchPush,
  buildPossibleCrashPush,
  buildPossibleFallPush,
  buildPossibleQuakePush,
  buildSafetyCheckPush,
  buildTestPush,
} from "@/lib/mobile/pushPayloadBuilder";

export async function GET() {
  return NextResponse.json({
    mode: "preview_only",
    sendsPush: false,
    payloads: [
      buildSafetyCheckPush(),
      buildPossibleCrashPush(),
      buildPossibleQuakePush(),
      buildPossibleFallPush(),
      buildDeadManSwitchPush(),
      buildTestPush(),
    ],
  });
}
