import AchievementBadge from "@/components/trust/AchievementBadge";
import type {
  AchievementDefinition,
  UserAchievement,
} from "@/types/trustAchievements";

export default function AchievementGrid({
  definitions,
  achievements,
}: {
  definitions: AchievementDefinition[];
  achievements: UserAchievement[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {definitions.map((definition) => (
        <AchievementBadge
          key={definition.id}
          definition={definition}
          achievement={achievements.find(
            (achievement) => achievement.achievementId === definition.id
          )}
        />
      ))}
    </div>
  );
}
