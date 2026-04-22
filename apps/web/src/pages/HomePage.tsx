type HomePageProps = {
  playerName: string;
  joinCode: string;
  pendingAction: "create" | "join" | null;
  message: string;
  onPlayerNameChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
};

export function HomePage({
  playerName,
  joinCode,
  pendingAction,
  message,
  onPlayerNameChange,
  onJoinCodeChange,
  onCreateRoom,
  onJoinRoom,
}: HomePageProps) {
  return (
    <main className="home-shell">
      <section className="home-card home-card-wide">
        <div className="home-header">
          <h1>Game Room</h1>
          <p>Create a private room or join with a room code.</p>
        </div>

        <label>
          Display name
          <input value={playerName} onChange={(event) => onPlayerNameChange(event.target.value)} placeholder="Your name" />
        </label>

        <div className="home-grid">
          <section className="action-card">
            <h2>Create room</h2>
            <p>A room code is generated automatically when you create one.</p>
            <button type="button" className="primary-button" onClick={onCreateRoom} disabled={pendingAction !== null}>
              {pendingAction === "create" ? "Creating..." : "Create room"}
            </button>
          </section>

          <section className="action-card">
            <h2>Join room</h2>
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

        <p className="helper-text">{message}</p>
      </section>
    </main>
  );
}
