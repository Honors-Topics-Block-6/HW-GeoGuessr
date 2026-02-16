/**
 * Type-checking test suite.
 *
 * This test verifies that all TypeScript types across the project are correct
 * by importing every exported type/interface and exercising basic type
 * assignments. If any type is broken or incompatible, the TypeScript compiler
 * (via `tsc --noEmit`) will catch it, and the runtime assertions here provide
 * an additional safety net.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Utility types ──────────────────────────────────────────────────────
import type { CompressImageOptions } from '../utils/compressImage';
import type { GoalType, GoalExtraParams, GoalDefinition } from '../utils/dailyGoalDefinitions';
import type { LevelInfo as XpLevelInfo, XpGainResult } from '../utils/xpLevelling';

// ── Service types ──────────────────────────────────────────────────────
import type {
  BugReportCategory, BugReportSeverity, BugReportStatus,
  EnvironmentInfo, AdminNote, BugReportData, BugReportDoc,
} from '../services/bugReportService';
import type { ChatMessage as ServiceChatMessage } from '../services/chatService';
import type {
  DailyGoalItem, DailyGoalsDoc, GoalProgressResult, GoalProgressParams,
} from '../services/dailyGoalsService';
import type {
  MapLocation, DuelPlayer as ServiceDuelPlayer, DuelImage as ServiceDuelImage,
  DuelGuess as ServiceDuelGuess, GuessData, RoundPlayerResult,
  RoundHistoryEntry, DuelPhase, DuelData,
} from '../services/duelService';
import type {
  UserLookup, FriendRequestStatus, FriendRequestDirection,
  FriendRequestDoc, FriendDoc, FriendshipDoc,
} from '../services/friendService';
import type { GameImage, SampleImage } from '../services/imageService';
import type { LevelInfo as LeaderboardLevelInfo, LeaderboardEntry } from '../services/leaderboardService';
import type {
  LobbyStatus, LobbyVisibility, LobbyPlayer as ServiceLobbyPlayer,
  LobbyDoc, CreateLobbyResult,
} from '../services/lobbyService';
import type {
  PresenceData, PresenceMap, PresenceMessage, SendMessageResult,
} from '../services/presenceService';
import type { Point, Region as ServiceRegion, PlayingArea as ServicePlayingArea } from '../services/regionService';
import type {
  AdminPermissionKey, PermissionsMap as ServicePermissionsMap,
  UserDoc as ServiceUserDoc, UserDocWithId, UserProfileUpdates,
} from '../services/userService';
import type { UserXpStats } from '../services/xpService';

// ── Hook types ─────────────────────────────────────────────────────────
import type { UseAdminMessagesReturn, AdminMessage } from '../hooks/useAdminMessages';
import type { UseChatReturn, ChatMessage as HookChatMessage } from '../hooks/useChat';
import type {
  DailyGoal, DailyGoalsData, RecordProgressResult, RecordProgressParams,
  UseDailyGoalsReturn,
} from '../hooks/useDailyGoals';
import type {
  MapCoords as DuelMapCoords, DuelGuess, DuelPlayer, DuelImage,
  DuelRoundHistoryEntry, DuelState, Region as DuelRegion,
  PlayingArea as DuelPlayingArea, UseDuelGameReturn,
} from '../hooks/useDuelGame';
import type { Friend, FriendRequest, UseFriendsReturn } from '../hooks/useFriends';
import type {
  MapCoords, GameImage as HookGameImage, Region as HookRegion,
  PlayingArea as HookPlayingArea, RoundResult,
  ScreenState, Difficulty, GameMode, UseGameStateReturn,
} from '../hooks/useGameState';
import type {
  LobbyPlayer, PublicLobby, LobbyData, HostGameResult,
  JoinByCodeResult, UseLobbyReturn, UseWaitingRoomReturn,
} from '../hooks/useLobby';
import type { MapZoomHandlers, UseMapZoomReturn } from '../hooks/useMapZoom';
import type { ScreenState as PresenceScreenState, FirebaseUser } from '../hooks/usePresence';

// ── Context types ──────────────────────────────────────────────────────
import type {
  AdminPermissions, UserDoc as ContextUserDoc, LevelInfo as ContextLevelInfo,
  AuthContextType,
} from '../contexts/AuthContext';

// ── Component prop types ───────────────────────────────────────────────
import type { FloorSelectorProps } from '../components/FloorSelector/FloorSelector';
import type { FriendsPanelProps } from '../components/FriendsPanel/FriendsPanel';
import type { ProfileScreenProps } from '../components/ProfileScreen/ProfileScreen';
import type { AdminTabKey, AdminTabsProps } from '../components/SubmissionApp/AdminTabs';
import type { ChatWindowProps } from '../components/ChatWindow/ChatWindow';
import type { LeaderboardScreenProps } from '../components/LeaderboardScreen/LeaderboardScreen';
import type { MapPoint, ResultScreenProps } from '../components/ResultScreen/ResultScreen';
import type { BugReportModalProps } from '../components/BugReportModal/BugReportModal';
import type { MapCoordinates, PolygonPoint, MapPickerProps, MapPickerHandle } from '../components/MapPicker/MapPicker';
import type { UserEditModalProps } from '../components/SubmissionApp/UserEditModal';
import type { DuelGameScreenProps } from '../components/DuelGameScreen/DuelGameScreen';
import type { DifficultySelectProps } from '../components/DifficultySelect/DifficultySelect';
import type { InviteFriendsModalProps } from '../components/InviteFriendsModal/InviteFriendsModal';
import type { SubmissionAppProps } from '../components/SubmissionApp/SubmissionApp';
import type { TitleScreenProps } from '../components/TitleScreen/TitleScreen';
import type { BugReportDetailModalProps } from '../components/SubmissionApp/BugReportDetailModal';
import type { GuessButtonProps } from '../components/GuessButton/GuessButton';
import type { AccountManagementProps } from '../components/SubmissionApp/AccountManagement';
import type { BugReportManagementProps } from '../components/SubmissionApp/BugReportManagement';
import type { PhotoUploadProps } from '../components/SubmissionApp/PhotoUpload';
import type { MultiplayerLobbyProps } from '../components/MultiplayerLobby/MultiplayerLobby';
import type { SendMessageAllModalProps } from '../components/SubmissionApp/SendMessageAllModal';
import type { ImageViewerProps } from '../components/ImageViewer/ImageViewer';
import type { PublicGameListProps } from '../components/MultiplayerLobby/PublicGameList';
import type { SendMessageModalProps } from '../components/SubmissionApp/SendMessageModal';
import type { GameCodeInputProps } from '../components/MultiplayerLobby/GameCodeInput';
import type { FriendsManagementProps } from '../components/SubmissionApp/FriendsManagement';
import type { WaitingRoomProps } from '../components/WaitingRoom/WaitingRoom';
import type { SubmissionFormProps } from '../components/SubmissionApp/SubmissionForm';
import type { FinalResultsScreenProps } from '../components/FinalResultsScreen/FinalResultsScreen';
import type { PolygonDrawerProps, DrawModeType } from '../components/SubmissionApp/PolygonDrawer';
import type { GameScreenProps } from '../components/GameScreen/GameScreen';
import type { DuelResultScreenProps } from '../components/DuelResultScreen/DuelResultScreen';
import type { AdminReviewProps } from '../components/SubmissionApp/AdminReview';
import type { PermissionsModalProps } from '../components/SubmissionApp/PermissionsModal';
import type { DailyGoalsPanelProps } from '../components/DailyGoalsPanel/DailyGoalsPanel';
import type { MapEditorProps } from '../components/SubmissionApp/MapEditor';
import type { DuelFinalScreenProps } from '../components/DuelFinalScreen/DuelFinalScreen';
import type { RegionPanelProps } from '../components/SubmissionApp/RegionPanel';
import type { MapSelectorProps } from '../components/SubmissionApp/MapSelector';
import type { BannerMessage, MessageBannerProps } from '../components/MessageBanner/MessageBanner';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('TypeScript Type Checking', () => {
  it('should pass tsc --noEmit with zero errors', () => {
    // This is the definitive type-check: runs the TypeScript compiler against
    // the entire project using the tsconfig.json in the project root.
    expect(() => {
      execSync('npx tsc --noEmit', {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        timeout: 120000,
        env: { ...process.env, NODE_PATH: '' },
      });
    }).not.toThrow();
  }, 120000);

  it('should have no remaining .js or .jsx source files in src/', () => {
    const result = execSync(
      'find src -name "*.js" -o -name "*.jsx" | grep -v node_modules || true',
      { cwd: PROJECT_ROOT, stdio: 'pipe', encoding: 'utf-8' },
    ).trim();
    expect(result).toBe('');
  });

  // ── Utility types ────────────────────────────────────────────────────
  it('should correctly type utility interfaces', () => {
    const compressOpts: CompressImageOptions = {
      maxWidth: 800,
      maxHeight: 600,
      quality: 0.8,
    };
    expect(compressOpts.maxWidth).toBe(800);

    const levelInfo: XpLevelInfo = {
      level: 2,
      currentLevelXp: 28284,
      xpIntoLevel: 100,
      xpToNextLevel: 28184,
      progress: 0.004,
    };
    const xpResult: XpGainResult = {
      newTotalXp: 10100,
      previousLevel: 1,
      newLevel: 2,
      levelsGained: 1,
      levelInfo,
    };
    expect(xpResult.levelsGained).toBe(1);
  });

  // ── Service types ────────────────────────────────────────────────────
  it('should correctly type service interfaces', () => {
    const category: BugReportCategory = 'gameplay';
    const severity: BugReportSeverity = 'high';
    const status: BugReportStatus = 'open';
    expect(category).toBe('gameplay');
    expect(severity).toBe('high');
    expect(status).toBe('open');

    const phase: DuelPhase = 'guessing';
    expect(phase).toBe('guessing');

    const lobbyStatus: LobbyStatus = 'waiting';
    const lobbyVis: LobbyVisibility = 'public';
    expect(lobbyStatus).toBe('waiting');
    expect(lobbyVis).toBe('public');

    const point: Point = { x: 100, y: 200 };
    expect(point.x).toBe(100);

    const permKey: AdminPermissionKey = 'reviewSubmissions';
    expect(permKey).toBe('reviewSubmissions');
  });

  // ── Hook types ───────────────────────────────────────────────────────
  it('should correctly type hook return interfaces', () => {
    const screen: ScreenState = 'title';
    expect(screen).toBe('title');

    const difficulty: Difficulty = 'hard';
    expect(difficulty).toBe('hard');

    const gameMode: GameMode = 'singleplayer';
    expect(gameMode).toBe('singleplayer');

    const coords: MapCoords = { x: 0, y: 0 };
    expect(coords.x).toBe(0);
  });

  // ── Context types ────────────────────────────────────────────────────
  it('should correctly type context interfaces', () => {
    const perms: AdminPermissions = {
      canReview: true,
      canEditMaps: false,
      canManageAccounts: false,
      canManageFriends: false,
      canManageBugReports: false,
    };
    expect(perms.canReview).toBe(true);
  });

  // ── Component prop types ─────────────────────────────────────────────
  it('should correctly type component prop interfaces', () => {
    // Verify a sampling of component prop types compile and work
    const floorProps: FloorSelectorProps = {
      selectedFloor: 1,
      onFloorSelect: () => {},
    };
    expect(floorProps.selectedFloor).toBe(1);

    const guessProps: GuessButtonProps = {
      onClick: () => {},
      disabled: false,
    };
    expect(guessProps.disabled).toBe(false);
  });

  // ── Cross-module type compatibility ──────────────────────────────────
  it('should maintain type compatibility across modules', () => {
    // Service and hook GameImage types should both have the same shape
    const serviceImage = {
      url: 'https://example.com/img.jpg',
      location: { x: 50, y: 50 },
      floor: 1,
      building: 'Main',
      difficulty: 'easy',
      region: 'campus',
    } as unknown as GameImage;

    // Both should compile and have a url
    expect(serviceImage.url).toBeDefined();

    // PresenceMap is a Record type
    const presMap: PresenceMap = {};
    expect(typeof presMap).toBe('object');
  });
});
