TechSpec.md — Harvard-Westlake GeoGuessr

1. Technology Stack

Frontend (Web Game Client)
    •    Language: TypeScript / JavaScript
    •    Framework: React
    •    Rendering: HTML5 Canvas + SVG (for map interactions)
    •    State Management: React Context or Redux
    •    Mapping: Custom 2D campus map (vector-based, not Google Maps)

Rationale: React provides predictable UI state transitions for a round-based game. Canvas and SVG allow precise click placement on a custom campus map without relying on external map APIs.

⸻

Backend (Game Logic & Data)
    •    Language: TypeScript or Python
    •    Framework: Node.js with Express or FastAPI
    •    Database: PostgreSQL
    •    ORM: Prisma (Node) or SQLAlchemy (Python)
    •    File Storage: Cloud object storage (images + videos)

Responsibilities:
    •    Serve randomized game rounds
    •    Score guesses
    •    Store user profiles, images, and metadata
    •    Manage PvP lobbies and rankings

⸻

Mobile / Submission Interface
    •    Platform: Mobile-friendly web app
    •    Camera Access: HTML5 Media APIs
    •    GPS: Browser Geolocation API
    •    Map Selection: Shared campus map component

Note: A native mobile app is out of scope for the initial implementation.

⸻

External Services
    •    GeoGuessr Pro: Reference only
    •    Authentication: OAuth or email/password (TBD)

⸻

2. System Architecture

[ Web Client ]
     |
     |  REST / WebSocket
     |
[ Backend API ]
     |
     |  SQL + Object Storage
     |
[ Database ] —— [ Media Storage ]

Gameplay Flow
    1.    Player starts a new game
    2.    Backend selects 5 locations based on difficulty
    3.    Client displays image and campus map
    4.    Player submits a guess
    5.    Backend calculates score
    6.    Results are returned and displayed
    7.    Final score is saved to the user profile

⸻

3. Core Classes & Responsibilities

GameManager

Controls overall game state and round progression.

Variables
    •    currentRound: int
    •    totalRounds: int
    •    gameMode: enum
    •    player: User
    •    rounds: List<GameRound>

Methods
    •    startGame()
    •    advanceRound()
    •    endGame()
    •    calculateFinalScore()

⸻

GameRound

Represents a single guessing round.

Variables
    •    roundId: UUID
    •    location: Location
    •    image: MediaAsset
    •    timeLimit: int
    •    playerGuess: Guess | null

Methods
    •    submitGuess(Guess)
    •    revealAnswer()

⸻

Location

Represents the exact photographer position.

Variables
    •    locationId: UUID
    •    section: CampusSection
    •    x: float
    •    y: float
    •    floor: int | null
    •    description: string

⸻

CampusMap

Handles map projection and click-to-coordinate translation.

Variables
    •    sections: List<CampusSection>
    •    scaleFactor: float

Methods
    •    mapClickToCoordinates(x, y)
    •    calculateDistance(a, b)
    •    getSectionAtPoint(point)

⸻

Guess

Represents a player’s submitted answer.

Variables
    •    guessPoint: Point
    •    floorGuess: int | null
    •    timeTaken: int

⸻

ScoringEngine

Encapsulates all scoring calculations.

Methods
    •    calculatePenalty(Guess, Location)
    •    calculateScore(Guess, Location, mode)
    •    applyTimeModifier(score, time)

Penalty Components
    •    Section penalty
    •    Floor penalty
    •    Distance penalty (normalized by building size)

⸻

User

Represents a player account.

Variables
    •    userId: UUID
    •    username: string
    •    profilePicture: URL
    •    rank: int
    •    stats: UserStats

⸻

PvPMatch

Handles multiplayer game logic.

Variables
    •    players: List<User>
    •    health: Map<User, int>
    •    currentRound: int

Methods
    •    submitGuess(user, Guess)
    •    applyDamage()
    •    checkWinCondition()

⸻

SubmissionEntry

Represents a user-submitted location.

Variables
    •    media: MediaAsset
    •    location: Location
    •    submittedBy: User
    •    difficultyRating: float

⸻

4. Data Model Overview

User ──< Game >──< GameRound >── Location
  |                     |
  |                     └── Guess
  |
  └── SubmissionEntry ── MediaAsset

Notes
    •    Locations are reusable across games
    •    Difficulty ratings update dynamically
    •    Media assets are stored separately from relational data

⸻

5. Difficulty & Image Classification
    •    Each image tracks:
    •    Average distance error
    •    Correct floor percentage
    •    Difficulty tiers are assigned dynamically:
    •    Easy: frequently guessed correctly
    •    Hard: consistently inaccurate guesses

This system improves image categorization automatically over time.

⸻

6. Out of Scope (Initial Version)
    •    Native iOS / Android apps
    •    Street View-style navigation
    •    AI-generated images
    •    Full campus movement simulation
    •    Advanced moderation tools

⸻

7. Development Priorities
    1.    Campus map and coordinate system
    2.    Location submission workflow
    3.    Single-player game loop
    4.    Scoring engine
    5.    User profiles
    6.    Difficulty algorithm
    7.    PvP mode
    8.    Ranking system

⸻

8. Required Figma Class Diagram

The Figma diagram must include:
    •    All classes defined above
    •    Clear dependency arrows
    •    One-to-many and many-to-many relationships
    •    Separation between frontend, backend, and shared data models
