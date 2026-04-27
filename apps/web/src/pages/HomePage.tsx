import { Dice3 } from "lucide-react";
import type { GameID } from "@game-site/shared/commonTypes";

import { LoveLetterInfoDrawer } from "../components/LoveLetterInfoDrawer.js";
import { SkullKingInfoDrawer } from "../components/SkullKingInfoDrawer.js";

type HomePageProps = {
  games: Array<{
    id: GameID;
    title: string;
    description: string;
    available: boolean;
  }>;
  selectedGame: GameID | null;
  playerName: string;
  joinCode: string;
  pendingAction: "create" | "join" | null;
  message: string;
  onSelectGame: (gameId: GameID) => void;
  onPlayerNameChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
};

export function HomePage({
  games,
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
  const activeGame = games.find((g) => g.id === selectedGame);

  return (
    <main className="hub-layout">
      {/* Sidebar for Game Selection */}
      <aside className="hub-sidebar">
        <div className="hub-sidebar-header">
          <h1>Game Hub</h1>
        </div>
        <nav className="game-list">
          {games.map((game) => (
            <button
              key={game.id}
              type="button"
              className={`game-list-item ${selectedGame === game.id ? "is-selected" : ""} ${!game.available ? "is-disabled" : ""}`}
              onClick={() => game.available && onSelectGame(game.id)}
              disabled={!game.available}
            >
              <strong>{game.title}</strong>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Stage for Actions */}
      <section className="hub-main">
        {activeGame ? (
          <div className="hub-action-stage">
            <header className="stage-header">
              <div className="stage-header-row">
                <div>
                  <h2>{activeGame.title}</h2>
                  <p>{activeGame.description}</p>
                </div>
                {activeGame.id === "love-letter" ? (
                  <LoveLetterInfoDrawer
                    buttonClassName="info-trigger-button info-trigger-button-home"
                    buttonLabel="Rules & Cards"
                    buttonTitle="Open Love Letter rules and card guide"
                    mode={null}
                  />
                ) : activeGame.id === "skull-king" ? (
                  <SkullKingInfoDrawer
                    buttonClassName="info-trigger-button info-trigger-button-home"
                    buttonLabel="Rules & Cards"
                    buttonTitle="Open Skull King rules and card guide"
                  />
                ) : null}
              </div>
            </header>

            <div className="player-setup">
              <label>
                Display name
                <input 
                  value={playerName} 
                  onChange={(event) => onPlayerNameChange(event.target.value)} 
                  placeholder="Enter your name to join the table..." 
                />
              </label>
            </div>

            <div className="action-split">
              <div className="action-card">
                <h3>Host a Game</h3>
                <p>Create a new room and invite others.</p>
                <button type="button" className="primary-button" onClick={onCreateRoom} disabled={pendingAction !== null || !playerName}>
                  {pendingAction === "create" ? "Creating..." : "Create Room"}
                </button>
              </div>

              <div className="action-divider"><span>OR</span></div>

              <div className="action-card">
                <h3>Join a Game</h3>
                <p>Enter a code shared by the host.</p>
                <label>
                  <input 
                    value={joinCode} 
                    onChange={(event) => onJoinCodeChange(event.target.value)} 
                    placeholder="Room Code (e.g. AB12CD)" 
                  />
                </label>
                <button type="button" className="secondary-button action-button" onClick={onJoinRoom} disabled={pendingAction !== null || !playerName || !joinCode}>
                  {pendingAction === "join" ? "Joining..." : "Join Room"}
                </button>
              </div>
            </div>
            
            {message && <p className="helper-text error-text">{message}</p>}
          </div>
        ) : (
          <div className="hub-empty-state">
            <div className="empty-icon" aria-hidden="true">
              <Dice3 size={42} strokeWidth={1.9} />
            </div>
            <h2>Select a game</h2>
            <p>Choose a game from the sidebar to start playing.</p>
          </div>
        )}
      </section>
    </main>
  );
}
