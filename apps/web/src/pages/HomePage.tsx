type HomePageProps = {
  selectedGame: string | null;
  playerName: string;
  joinCode: string;
  pendingAction: "create" | "join" | null;
  message: string;
  onSelectGame: (gameId: string) => void;
  onPlayerNameChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
};

export function HomePage({
  selectedGame,
  playerName,
  joinCode,
  pendingAction,
  message,
  onSelectGame,
  onPlayerNameChange,
  onJoinCodeChange,
  onCreateRoom,
  onJoinRoom,
}: HomePageProps) {
  return (
    <main className="home-shell">
      <section className="home-card home-card-wide">
        <div className="home-header">
          <h1>Game Hub</h1>
          <p>Choose a game first, then create a room or join with a room code.</p>
        </div>

        <section className="game-picker">
          <button
            type="button"
            className={`game-card${selectedGame === "love-letter" ? " is-selected" : ""}`}
            onClick={() => onSelectGame("love-letter")}
          >
            <strong>Love Letter</strong>
            <span>Classic deduction card game</span>
          </button>
        </section>

        {selectedGame ? (
          <section className="setup-panel">
            <div className="setup-header">
              <h2>{selectedGame === "love-letter" ? "Love Letter" : "Selected game"}</h2>
              <p>Create a room or join an existing one for this game.</p>
            </div>

            <label>
              Display name
              <input value={playerName} onChange={(event) => onPlayerNameChange(event.target.value)} placeholder="Your name" />
            </label>

            <div className="setup-stack">
              <section className="action-card">
                <h3>Create room</h3>
                <p>A room code is generated automatically when you create one.</p>
                <button type="button" className="primary-button" onClick={onCreateRoom} disabled={pendingAction !== null}>
                  {pendingAction === "create" ? "Creating..." : "Create room"}
                </button>
              </section>

              <section className="action-card">
                <h3>Join room</h3>
                <p>Enter the room code shared by the host.</p>
                <label>
                  Room code
                  <input value={joinCode} onChange={(event) => onJoinCodeChange(event.target.value)} placeholder="AB12CD" />
                </label>
                <button type="button" className="secondary-button action-button" onClick={onJoinRoom} disabled={pendingAction !== null}>
                  {pendingAction === "join" ? "Joining..." : "Join room"}
                </button>
              </section>
            </div>
          </section>
        ) : null}

        <p className="helper-text">{message}</p>
      </section>
    </main>
  );
}
