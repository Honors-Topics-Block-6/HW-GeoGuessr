import { useEffect, useRef, useState } from "react";
import "./DifficultySelect.css";

type DifficultyId = "all" | "easy" | "medium" | "hard";
type TotalRounds = 5 | 10 | 20;
type GameMode = "singleplayer" | "multiplayer";
type SingleplayerVariant = "classic" | "endless";

/** 0 means "no time limit" */
export type RoundTimeSeconds = number;

interface DifficultyOption {
  id: DifficultyId;
  label: string;
  icon: string;
  description: string;
}

/** Preset time options shown as buttons. 0 = no limit. */
interface TimePreset {
  value: number;
  label: string;
}

const DIFFICULTIES: DifficultyOption[] = [
  {
    id: "all",
    label: "All",
    icon: "🌐",
    description: "Any photo, any difficulty",
  },
  {
    id: "easy",
    label: "Easy",
    icon: "🟢",
    description: "Familiar spots around campus",
  },
  {
    id: "medium",
    label: "Medium",
    icon: "🟡",
    description: "Trickier angles and locations",
  },
  {
    id: "hard",
    label: "Hard",
    icon: "🔴",
    description: "For true experts only",
  },
];

const TIME_PRESETS: TimePreset[] = [
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
  { value: 0, label: "No Limit" },
];

const ROUND_PRESETS: { value: TotalRounds; label: string }[] = [
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
];

const CUSTOM_TIME_MIN = 3;
const CUSTOM_TIME_MAX = 600;

export interface DifficultySelectProps {
  onStart: (
    difficulty: DifficultyId,
    mode: GameMode,
    singleplayerVariant?: SingleplayerVariant,
    roundTimeSeconds?: RoundTimeSeconds,
    timePenaltyEnabled?: boolean,
    totalRounds?: TotalRounds,
  ) => void;
  onBack: () => void;
  isLoading: boolean;
}

function DifficultySelect({
  onStart,
  onBack,
  isLoading,
}: DifficultySelectProps): React.ReactElement {
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<DifficultyId>("all");
  const [selectedRounds, setSelectedRounds] = useState<TotalRounds>(5);
  const [selectedMode, setSelectedMode] = useState<GameMode>("singleplayer");
  const [selectedSingleplayerVariant, setSelectedSingleplayerVariant] =
    useState<SingleplayerVariant>("classic");
  const [timePenaltyEnabled, setTimePenaltyEnabled] = useState<boolean>(false);

  // Time setting: preset value or 'custom'
  const [timeSelection, setTimeSelection] = useState<number | "custom">(30);
  const [customTime, setCustomTime] = useState<string>("60");
  const [customTimeError, setCustomTimeError] = useState<string | null>(null);
  const customTimeInputRef = useRef<HTMLInputElement | null>(null);

  const parsedCustom = parseInt(customTime, 10);
  const customIsValid =
    timeSelection !== "custom" ||
    (!isNaN(parsedCustom) &&
      parsedCustom >= CUSTOM_TIME_MIN &&
      parsedCustom <= CUSTOM_TIME_MAX);

  /** Resolve the actual round time in seconds (0 = no time limit) */
  const resolvedTime: number =
    timeSelection === "custom"
      ? Math.max(
          CUSTOM_TIME_MIN,
          Math.min(
            CUSTOM_TIME_MAX,
            isNaN(parsedCustom) ? CUSTOM_TIME_MIN : parsedCustom,
          ),
        )
      : timeSelection;

  const handleStart = (): void => {
    if (!selectedDifficulty) return;

    if (timeSelection === "custom") {
      if (!customIsValid) {
        setCustomTimeError(
          `Enter a time between ${CUSTOM_TIME_MIN} and ${CUSTOM_TIME_MAX} seconds.`,
        );
        return;
      }
      // Normalize the input to the clamped value so the user sees what will be used
      setCustomTime(String(resolvedTime));
      setCustomTimeError(null);
    }

    onStart(
      selectedDifficulty,
      selectedMode,
      selectedMode === "singleplayer" ? selectedSingleplayerVariant : undefined,
      selectedMode === "singleplayer" ? resolvedTime : undefined,
      timePenaltyEnabled,
      selectedMode === "singleplayer" &&
        selectedSingleplayerVariant === "classic"
        ? selectedRounds
        : undefined,
    );
  };

  const disabledReason: string | null = (() => {
    if (!selectedDifficulty) return "Select a difficulty.";
    if (!selectedMode) return "Select a game mode.";
    if (timeSelection === "custom" && !customIsValid) {
      return `Enter a custom time between ${CUSTOM_TIME_MIN} and ${CUSTOM_TIME_MAX} seconds.`;
    }
    return null;
  })();

  const handleCustomTimeChange = (value: string): void => {
    // Allow only digits while typing
    const digits = value.replace(/\D/g, "");
    setCustomTime(digits);
    setCustomTimeError(null);
  };

  const handleCustomTimeBlur = (): void => {
    const parsed = parseInt(customTime, 10);
    if (isNaN(parsed) || parsed < CUSTOM_TIME_MIN) {
      setCustomTime(String(CUSTOM_TIME_MIN));
      setCustomTimeError(null);
    } else if (parsed > CUSTOM_TIME_MAX) {
      setCustomTime(String(CUSTOM_TIME_MAX));
      setCustomTimeError(null);
    }
  };

  useEffect(() => {
    if (timeSelection === "custom") {
      customTimeInputRef.current?.focus();
    }
  }, [timeSelection]);

  return (
    <div className="difficulty-screen">
      <div className="difficulty-background">
        <div className="difficulty-overlay"></div>
      </div>

      <div className="difficulty-content">
        <button className="difficulty-back-button" onClick={onBack}>
          ← Back
        </button>

        <h2 className="difficulty-heading">Choose Difficulty</h2>
        <div className="difficulty-options">
          {DIFFICULTIES.map((diff: DifficultyOption) => (
            <button
              key={diff.id}
              className={`difficulty-card ${selectedDifficulty === diff.id ? "selected" : ""}`}
              onClick={() => setSelectedDifficulty(diff.id)}
            >
              <span className="difficulty-card-icon">{diff.icon}</span>
              <span className="difficulty-card-label">{diff.label}</span>
              <span className="difficulty-card-desc">{diff.description}</span>
            </button>
          ))}
        </div>

        <h2 className="time-heading">Round Time</h2>
        <div className="time-options">
          {TIME_PRESETS.map((preset) => (
            <button
              key={preset.value}
              className={`time-card ${timeSelection === preset.value ? "selected" : ""}`}
              onClick={() => setTimeSelection(preset.value)}
            >
              <span className="time-card-icon">
                {preset.value === 0 ? "∞" : "⏱"}
              </span>
              <span className="time-card-label">{preset.label}</span>
            </button>
          ))}
          <div
            className={`time-card time-card-custom ${timeSelection === "custom" ? "selected" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setTimeSelection("custom")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setTimeSelection("custom");
              }
            }}
          >
            <span className="time-card-icon">✏️</span>
            {timeSelection === "custom" ? (
              <div className="time-custom-inline">
                <input
                  id="custom-time-input"
                  ref={customTimeInputRef}
                  className="time-custom-input"
                  type="text"
                  inputMode="numeric"
                  value={customTime}
                  onChange={(e) => handleCustomTimeChange(e.target.value)}
                  onBlur={handleCustomTimeBlur}
                  min={CUSTOM_TIME_MIN}
                  max={CUSTOM_TIME_MAX}
                  placeholder="60"
                  aria-label="Custom time in seconds"
                />
                <span className="time-custom-unit">s</span>
              </div>
            ) : (
              <span className="time-card-label">Custom</span>
            )}
          </div>
        </div>
        {customTimeError && (
          <div className="time-custom-error">{customTimeError}</div>
        )}

        {selectedMode === "singleplayer" && (
          <>
            <h2 className="mode-heading">Game Mode</h2>
            <div className="mode-options-single">
              <button
                className={`mode-card ${selectedSingleplayerVariant === "classic" ? "selected" : ""}`}
                onClick={() => setSelectedSingleplayerVariant("classic")}
              >
                <span className="mode-card-icon">📋</span>
                <span className="mode-card-label">Classic</span>
                <span className="mode-card-desc">5, 10, or 20 rounds</span>
              </button>
              <button
                className={`mode-card ${selectedSingleplayerVariant === "endless" ? "selected" : ""}`}
                onClick={() => setSelectedSingleplayerVariant("endless")}
              >
                <span className="mode-card-icon">♾️</span>
                <span className="mode-card-label">Endless</span>
                <span className="mode-card-desc">HP until you run out</span>
              </button>
            </div>

            <div className="time-penalty-row">
              <span className="time-penalty-label">Time penalty</span>
              <div className="time-penalty-toggle">
                <button
                  className={`time-penalty-btn ${!timePenaltyEnabled ? "selected" : ""}`}
                  onClick={() => setTimePenaltyEnabled(false)}
                >
                  Off
                </button>
                <button
                  className={`time-penalty-btn ${timePenaltyEnabled ? "selected" : ""}`}
                  onClick={() => setTimePenaltyEnabled(true)}
                >
                  On
                </button>
              </div>
            </div>
          </>
        )}

        {selectedMode === "singleplayer" &&
          selectedSingleplayerVariant === "classic" && (
            <>
              <h2 className="rounds-heading">Number of Rounds</h2>
              <div className="rounds-options">
                {ROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    className={`rounds-card ${selectedRounds === preset.value ? "selected" : ""}`}
                    onClick={() => setSelectedRounds(preset.value)}
                  >
                    <span className="rounds-card-icon">🔁</span>
                    <span className="rounds-card-label">{preset.label}</span>
                    <span className="rounds-card-suffix">Rounds</span>
                  </button>
                ))}
              </div>
            </>
          )}

        <div className="difficulty-footer">
          <button
            className="play-button"
            onClick={handleStart}
            disabled={!selectedDifficulty || isLoading}
          >
            {isLoading ? (
              <>
                <span className="button-spinner"></span>
                Loading...
              </>
            ) : (
              "Play"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DifficultySelect;
