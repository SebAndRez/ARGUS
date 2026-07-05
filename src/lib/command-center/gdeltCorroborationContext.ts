export function buildGdeltCommandCenterContext(context: Record<string, unknown>) {
  return {
    panel: "GDELT OSINT / Media Signals",
    signal: context,
    stateLabels: ["Signal", "Candidate", "Confirmed"],
    confirmedByGdeltAlone: false,
    citizenAlertsDisabled: true,
  };
}
