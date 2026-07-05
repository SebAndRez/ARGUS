export function convertArcaShelterCheckinsToCustosStatus(checkins: Array<Record<string, unknown>>) {
  return checkins.map((checkin, index) => ({ id: `custos-arca-${index}`, status: checkin.safe ? "reported_safe" : "in_shelter", locationApproximate: true, exactLocationIncluded: false }));
}
