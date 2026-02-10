TechSpec.md — Harvard-Westlake GeoGuessr (Comprehensive)

⸻

0. System Overview

Harvard-Westlake GeoGuessr consists of two distinct but connected web applications built on a shared backend and database:
    1.    Game Client — the public-facing site where users play GeoGuessr-style games.
    2.    Creation / Submission Client — a restricted site used by students to submit new locations, images, and metadata.

Both clients:
    •    Are built in React for cross-platform compatibility (desktop + mobile)
    •    Share authentication, data models, and APIs
    •    Communicate with a Firebase-backed backend

⸻

1. Technology Stack

Frontend (Both Clients)
    •    Language: TypeScript
    •    Framework: React
    •    Routing: React Router
    •    State Management: React Context + Reducers
    •    Rendering:
    •    HTML5 Canvas (image display, map overlay)
    •    SVG (campus map layers, markers)
    •    Deployment Target: Web (PWA-ready)

⸻

Backend / Services
    •    Backend Platform: Firebase
    •    Authentication: Firebase Authentication
    •    Database: Firebase Firestore
    •    File Storage: Firebase Cloud Storage
    •    Server Logic: Firebase Cloud Functions

⸻

Firebase Services Used
    •    Firebase Auth (user identity)
    •    Firestore (structured game + submission data)
    •    Cloud Storage (images & videos)
    •    Cloud Functions (scoring, validation, matchmaking)

⸻

2. High-Level Architecture

[ Game Client (React) ] ─┐
                         ├── Firebase SDK ── Firestore
[ Creation Client ] ─────┘                     |
                                               ├── Cloud Storage
                                               └── Cloud Functions

No traditional REST server is required; both clients interface directly with Firebase via SDKs and callable functions.

⸻

3. Authentication & User Identity

UserIdentityService (Frontend)

Handles login, logout, and session persistence.

Interacts With: Firebase Auth

Variables
    •    currentUser: User | null
    •    authState: enum { LOADING, AUTHENTICATED, ANONYMOUS }

Methods
    •    signInWithEmail()
    •    signInAnonymously()
    •    signOut()
    •    onAuthStateChanged()

⸻

User (Shared Model)

Variables
    •    uid: string
    •    displayName: string
    •    profilePictureURL: string
    •    rank: number
    •    stats: UserStats
    •    roles: enum { PLAYER, CREATOR, ADMIN }

Roles determine access to the Creation Client.

⸻

4. Game Client — Class Structure

GameApp (Root Component)
    •    Initializes authentication
    •    Routes between screens

⸻

GameManager

Controls the full lifecycle of a game session.

Variables
    •    gameId: string
    •    mode: GameMode
    •    rounds: GameRound[]
    •    currentRoundIndex: number
    •    player: User

Methods
    •    startGame()
    •    advanceRound()
    •    endGame()

⸻

GameRound

Variables
    •    roundId: string
    •    locationId: string
    •    media: MediaAsset
    •    timeLimit: number
    •    guess: Guess | null

Methods
    •    submitGuess()

⸻

MapInteractionController

Handles all map clicks and coordinate translation.

Variables
    •    selectedFloor: number | null
    •    currentMarker: Point | null

Methods
    •    handleMapClick(x, y)
    •    setFloor(floor)

⸻

Guess

Variables
    •    x: number
    •    y: number
    •    floor: number | null
    •    timeTaken: number

⸻

ScoringEngine (Cloud Function)

Runs server-side to prevent cheating.

Methods
    •    calculatePenalty(guess, location)
    •    calculateScore()

⸻

5. PvP & Multiplayer

PvPMatchManager

Variables
    •    matchId: string
    •    players: User[]
    •    health: Map<User, number>

Methods
    •    submitGuess(user, guess)
    •    applyDamage()
    •    checkWin()

Uses Firestore real-time listeners.

⸻

6. Creation / Submission Client — Class Structure

CreationApp (Root)
    •    Auth-gated (CREATOR role required)

⸻

SubmissionManager

Coordinates the submission workflow.

Variables
    •    draftSubmission: SubmissionDraft

Methods
    •    startSubmission()
    •    submit()

⸻

SubmissionDraft

Variables
    •    photoFile: File
    •    videoFile: File
    •    locationPoint: Point
    •    floor: number | null
    •    description: string

⸻

MediaUploadService

Interacts With: Firebase Cloud Storage

Methods
    •    uploadImage(file)
    •    uploadVideo(file)

⸻

LocationValidationService (Cloud Function)

Responsibilities
    •    Ensure submissions are within campus bounds
    •    Normalize coordinates
    •    Reject malformed data

⸻

7. Shared Data Models (Firestore)

LocationDocument
    •    locationId
    •    x
    •    y
    •    floor
    •    section
    •    description

⸻

MediaAssetDocument
    •    mediaId
    •    imageURL
    •    videoURL
    •    difficultyRating

⸻

GameDocument
    •    gameId
    •    playerId
    •    roundIds[]
    •    finalScore

⸻

7.1 XP & Leveling

XP is earned from: completing rounds (round_complete), finishing a game (game_complete), and later PvP wins (pvp_win). Placeholder constants (e.g. XP_PER_ROUND, XP_GAME_COMPLETE_BONUS) and formulas can be tuned later.

User progress is stored in users/{uid} (or userProgress/{uid}) with at least:
    •    xp: number

Level is derived from total XP on read via xpToLevel(xp); getLevelProgress(xp) provides level, xpInCurrentLevel, xpToNextLevel, and progressFraction for the UI progress bar. Current implementation uses placeholder linear formulas (e.g. 100 XP per level).

⸻

8. Difficulty Classification System

DifficultyAnalyzer (Cloud Function)

Inputs
    •    Historical guess accuracy
    •    Average distance error

Outputs
    •    Updated difficulty rating

⸻

9. Out of Scope (Initial Release)
    •    Native mobile apps
    •    Automatic moderation via ML
    •    Real-time campus navigation

⸻

10. Development Order
    1.    Firebase Auth + roles
    2.    Campus map system
    3.    Submission pipeline
    4.    Single-player gameplay
    5.    Scoring engine
    6.    Difficulty analysis
    7.    PvP modes

⸻

11. Required Figma Diagram

Must include:
    •    Frontend classes
    •    Cloud Functions
    •    Firebase services
    •    Data relationships

This document defines the full technical implementation plan for Harvard-Westlake GeoGuessr.
