# ProfileScreen.tsx – Merge conflict resolution (move-achievements vs main)

Apply these in order.

---

## Conflict 1 – Imports (top of file)

**Remove** the three conflict marker lines and the short move-achievements import block.

**Keep only this** (main’s imports):

```ts
import { useMemo, useState, useEffect, useRef, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, type BuildingStat, type DailyStatBucket } from '../../contexts/AuthContext';
import { useFriends } from '../../hooks/useFriends';
import { getFavoriteAndWorstBuildings } from '../../utils/buildingStats';
import { getAllAchievementMeta, isAchievementUnlocked, type AchievementId } from '../../services/achievementService';
import { DAILY_STREAK_UPDATED_EVENT, getDisplayDailyStreak, syncDailyStreakRollover } from '../../services/streakService';
```

If your main branch has HEIC support, also keep this line (otherwise delete it):

```ts
import { isHeicFile, normalizeImageFile } from '../../utils/compressImage';
```

Then keep: `import './ProfileScreen.css';`

---

## After the imports – add this interface

Right after `ProfileScreenProps` and before `function ProfileScreen`, add:

```ts
interface AchievementDefinition {
  id: AchievementId;
  icon: string;
  title: string;
  highlight: string;
  details: string;
  xpReward: number;
  target: number;
  progress: number;
  unlocked: boolean;
}
```

---

## Conflict 2 – After `const gamesPlayed: number = ...`

**Remove** the three conflict marker lines.

**Keep the entire main block** (do not keep the empty move-achievements side).  
So keep everything from:

`const { friends } = useFriends(user?.uid ?? null, userDoc?.username ?? '');`

through:

`const completedAchievements: number = achievementDefinitions.filter((achievement) => achievement.progress >= achievement.target).length;`

---

## Fix duplicate Level & XP section (before Conflict 3)

Find this structure (there are two “Level & XP” blocks and duplicate stat rows):

- First `{/* ── Level & XP Section ── */}` and its `<div className="profile-level-section">`
- Then a **second** `{/* ── Level & XP Section ── */}` and another full level section
- Inside that, the xp-bar and then **two** groups of stats (the second group has duplicate “Games Played” and “XP to Next Level”)

**Do this:**

1. Delete the **second** comment `{/* ── Level & XP Section ── */}` and the **second** `<div className="profile-level-section">` and its inner `<div className="profile-level-header">` (so you have only one level header).
2. Keep a **single** `profile-xp-bar-container` and **one** `profile-xp-stats` with exactly **three** items: Total XP, Games Played, XP to Next Level.
3. Remove the **two** extra stat divs that repeat “Games Played” and “XP to Next Level” (the ones that use `gamesPlayedAllTime` and the second `levelInfo.xpToNextLevel`).
4. Close the level section with **one** `</div>` before `{activeTab === 'profile' ? (`.

So the Level & XP block should look like this (one section, one header, one bar, three stats):

```tsx
        {/* ── Level & XP Section ── */}
        <div className="profile-level-section">
          <div className="profile-level-header">
            <span className="profile-level-badge">Lvl {levelInfo.level}</span>
            <span className="profile-level-title">{levelTitle}</span>
          </div>
          <div className="profile-xp-bar-container">
            ...
          </div>
          <div className="profile-xp-stats">
            <div className="profile-xp-stat">Total XP</div>
            <div className="profile-xp-stat">Games Played</div>
            <div className="profile-xp-stat">XP to Next Level</div>
          </div>
        </div>

        {activeTab === 'profile' ? (
```

---

## Conflict 3 – End of stats tab (after Favorite Emote field)

**Remove** the three conflict marker lines and the **entire** move-achievements block (the Achievements field, the Member Since field, and the extra `</div>`).

**Keep only main’s closing** so the ternary closes correctly:

```tsx
        )}
```

So the stats tab ends with the Favorite Emote field, then:

```tsx
          </div>
        )}
      </div>
```

---

## Add Achievements in the Profile tab

In the **Profile** tab (the first branch of `activeTab === 'profile' ? ... : ...`), find the block that has **Friends** and then **Member Since**.  

**Between** the Friends field and the Member Since field, insert this:

```tsx
            {onOpenAchievements && (
              <div className="profile-field">
                <span className="profile-label">Achievements</span>
                <div className="profile-value-row">
                  <span className="profile-value">Track your milestones and XP rewards</span>
                  <button
                    className="profile-friends-button"
                    onClick={onOpenAchievements}
                  >
                    View Achievements
                  </button>
                </div>
              </div>
            )}

            <div className="profile-field">
              <span className="profile-label">Member Since</span>
              <span className="profile-value">{formatTimestamp(userDoc?.createdAt)}</span>
            </div>
```

So the Profile tab has: Username → Email → Friends → **Achievements (if onOpenAchievements)** → Member Since, then `</div>` and `) : (`.

---

## Summary

| # | Location              | Action |
|---|-----------------------|--------|
| 1 | Imports               | Use main’s imports; add AchievementDefinition interface after props. |
| 2 | After `gamesPlayed`   | Keep main’s block (useFriends through completedAchievements). |
| – | Level & XP            | One level section, one xp bar, three xp stats; remove duplicates. |
| 3 | After Favorite Emote | Keep only `)}` from main. |
| – | Profile tab           | Add Achievements field (and Member Since with formatTimestamp) between Friends and end of profile-fields. |

After all edits, there should be no `<<<<<<<`, `=======`, or `>>>>>>>` left in the file.
