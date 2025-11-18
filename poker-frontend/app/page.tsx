"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReliableWebSocket } from "@/hooks/useWebSocket";

// Types
type Player = {
  name: string;
  chips: number;
  current_bet: number;
  folded: boolean;
  hand: string[];
};

type GameState = {
  stage: string;
  pot: number;
  current_bet: number;
  community_cards: string[];
  current_player: string | null;
  current_player_index: number | null;
  to_call: number;
  legal_actions: string[];
  game_over: boolean;
  winner: string | null;
  dealer: string;
  players: Player[];
  lobby_timer?: number;
  game_starting?: boolean;
};

// Seat positions for 6 players
const SEAT_POSITIONS = [
  { top: "70%", left: "50%", transform: "translate(-50%, -50%)" },
  { top: "70%", left: "10%", transform: "translate(-50%, -50%)" },
  { top: "30%", left: "10%", transform: "translate(-50%, -50%)" },
  { top: "10%", left: "50%", transform: "translate(-50%, -50%)" },
  { top: "30%", left: "90%", transform: "translate(-50%, -50%)" },
  { top: "70%", left: "90%", transform: "translate(-50%, -50%)" },
];

const LOBBY_TIMER_DURATION = 15;

function useAnimatedNumber(value: number, duration = 0.4) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const start = display;
    const diff = value - start;
    const startTime = performance.now();

    const step = (time: number) => {
      const progress = Math.min((time - startTime) / (duration * 1000), 1);
      setDisplay(start + diff * progress);
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }, [value, duration, display]);

  return Math.round(display);
}

function Card({ card }: { card: string }) {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  
  const suitSymbols: Record<string, string> = {
    h: "♥",
    d: "♦",
    c: "♣",
    s: "♠",
  };
  
  const isRed = suit === "h" || suit === "d";
  
  return (
    <motion.div
      initial={{ rotateY: 180, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      className="relative w-12 h-16 bg-white rounded-lg shadow-xl flex flex-col items-center justify-center border-2 border-gray-300"
      style={{ transformStyle: "preserve-3d" }}
    >
      <span className={`text-2xl font-bold ${isRed ? "text-red-600" : "text-black"}`}>
        {rank}
      </span>
      <span className={`text-xl ${isRed ? "text-red-600" : "text-black"}`}>
        {suitSymbols[suit] || suit}
      </span>
    </motion.div>
  );
}

function PlayerSeat({
  player,
  seatIndex,
  isCurrentPlayer,
  isDealer,
  isInLobby,
  currentPlayerName,
  onJoinSeat,
  onLeaveSeat,
  onAddAI,
}: {
  player: Player | null;
  seatIndex: number;
  isCurrentPlayer: boolean;
  isDealer: boolean;
  isInLobby: boolean;
  currentPlayerName: string;
  onJoinSeat: (seatIndex: number) => void;
  onLeaveSeat: (seatIndex: number) => void;
  onAddAI: (seatIndex: number) => void;
}) {
  const position = SEAT_POSITIONS[seatIndex];

  return (
    <motion.div
      className="absolute"
      style={position}
      animate={{
        scale: isCurrentPlayer ? 1.1 : 1,
      }}
      transition={{ type: "spring", stiffness: 2000 }}
    >
      {player && player.name ? (
        <div className="relative">
          <motion.div
            className={`
              bg-linear-to-br from-gray-800 to-gray-900 
              rounded-2xl p-4 shadow-2xl border-4
              ${isCurrentPlayer ? "border-yellow-400" : "border-gray-600"}
              ${player.folded ? "opacity-50" : ""}
            `}
            style={{ width: "180px" }}
          >
            {isDealer && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg"
              >
                D
              </motion.div>
            )}

            <div className="mb-2">
              <p className="font-bold text-white text-sm truncate">
                {player.name}
                {player.name === currentPlayerName && " (You)"}
              </p>
              <p className="text-green-400 text-xs">💰 ${player.chips}</p>
              {player.current_bet > 0 && (
                <p className="text-yellow-300 text-xs">Bet: ${player.current_bet}</p>
              )}
              {player.folded && (
                <p className="text-red-400 text-xs font-semibold">FOLDED</p>
              )}
            </div>

            {isInLobby && player.name === currentPlayerName && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onLeaveSeat(seatIndex)}
                className="w-full bg-red-600 hover:bg-red-700 text-white text-xs py-1 rounded-lg mb-2 font-semibold"
              >
                Leave Table
              </motion.button>
            )}

            <div className="flex gap-1 justify-center">
              {player.hand && player.hand.map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ x: -50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card card={card} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      ) : (
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="cursor-pointer bg-gray-700/50 hover:bg-gray-700/70 rounded-2xl p-4 border-2 border-dashed border-gray-500 hover:border-gray-400 flex flex-col items-center justify-center transition-all"
          style={{ width: "180px", height: "140px" }}
        >
          <div className="text-center mb-2">
            <p className="text-gray-300 text-sm font-semibold mb-2">Empty Seat</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onJoinSeat(seatIndex)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded"
            >
              Join
            </button>
            <button
              onClick={() => onAddAI(seatIndex)}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1 rounded"
            >
              Add AI
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function PokerTable() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameIdInput, setGameIdInput] = useState("");
  const [raiseAmount, setRaiseAmount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayerName, setCurrentPlayerName] = useState<string>("");
  const [lobbyTimer, setLobbyTimer] = useState<number>(LOBBY_TIMER_DURATION);

  const apiBase = "http://localhost:8000";

  const animatedPot = useAnimatedNumber(gameState?.pot || 0);

  const isInLobby = gameState?.stage === "lobby" || !gameState?.stage;
  const activePlayers = gameState?.players.filter(p => p && p.name).length || 0;

  useEffect(() => {
    if (isInLobby && gameState?.lobby_timer !== undefined) {
      setLobbyTimer(gameState.lobby_timer);
    }
  }, [gameState?.lobby_timer, isInLobby]);

  // Single WebSocket connection - no player name in URL
  const wsUrl = gameId ? `ws://localhost:8000/ws/${gameId}` : "";
  
  const { isConnected, sendMessage } = useReliableWebSocket<GameState>(wsUrl, (msg) => {
    if (msg.type === "state_update") {
      const state = msg.state;
      if (state) {
        setGameState(state);
        if (typeof state.lobby_timer === "number") {
          setLobbyTimer(state.lobby_timer);
        }
      }
    } else if (msg.type === "upgrade_success") {
      console.log("[CLIENT] Successfully upgraded to player");
      if (msg.state) {
        setGameState(msg.state);
      }
    } else if (msg.type === "upgrade_failed") {
      console.error("[CLIENT] Failed to upgrade:", msg.error);
      setError(msg.error || "Failed to upgrade to player");
    }
  });

  async function joinSeat(seatIndex: number) {
    if (!gameId) {
      setError("You must create or open a game first.");
      return;
    }

    if (!isInLobby) {
      setError("Cannot join seat while game is in progress. Wait for the next lobby phase.");
      return;
    }

    const name = prompt("Enter your name to take this seat:", currentPlayerName || "Player");
    if (!name || name.trim() === "") return;

    const trimmedName = name.trim();

    setLoading(true);
    setError(null);

    try {
      // First, update game state via HTTP
      const res = await fetch(`${apiBase}/join_seat/${gameId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_name: trimmedName, seat_index: seatIndex }),
      });

      if (res.ok) {
        // Update local player name
        setCurrentPlayerName(trimmedName);
        
        // Now upgrade the WebSocket connection
        const success = sendMessage({
          type: "upgrade_to_player",
          player_name: trimmedName,
          seat_index: seatIndex,
        });

        if (success) {
          setActionLog((prev) => [...prev, `${trimmedName} joined seat ${seatIndex + 1}`]);
        } else {
          setError("WebSocket not connected. Reconnecting...");
        }
      } else {
        const errData: { detail?: string } = await res.json().catch(() => ({ detail: "Unknown error" }));
        setError(errData.detail || "Could not take seat");
      }
    } catch (err) {
      console.error("Error joining seat:", err);
      setError("Failed to connect to server. Make sure backend is running.");
    } finally {
      setLoading(false);
    }
  }

  async function leaveSeat(seatIndex: number) {
    if (!gameId || !gameState) return;

    if (!isInLobby) {
      setError("Cannot leave seat while game is in progress. Wait for the hand to finish.");
      return;
    }

    const player = gameState.players[seatIndex];
    if (!player || !player.name) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/leave_seat/${gameId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat_index: seatIndex }),
      });

      if (res.ok) {
        setActionLog((prev) => [...prev, `${player.name} left seat ${seatIndex + 1}`]);
        
        if (player.name === currentPlayerName) {
          // Downgrade connection back to spectator
          sendMessage({
            type: "downgrade_to_spectator"
          });
          setCurrentPlayerName("");
        }
      } else {
        const errData: { detail?: string } = await res.json().catch(() => ({ detail: "Unknown error" }));
        setError(errData.detail || "Could not leave seat");
      }
    } catch (err) {
      console.error("Error leaving seat:", err);
      setError("Failed to leave seat");
    } finally {
      setLoading(false);
    }
  }

  async function createGame() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/create_game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          player_names: [],
          seat_count: 6 
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create game");
      }

      const data = await res.json();
      setGameId(data.game_id);
      setGameState(data.state);
      setActionLog([`Game created with ID: ${data.game_id}`]);
    } catch (err) {
      console.error("Error creating game:", err);
      setError("Failed to create game. Make sure the backend is running on localhost:8000");
    } finally {
      setLoading(false);
    }
  }

  async function startHand() {
    if (!gameId) return;
    setLoading(true);
    setError(null);

    try {
      await fetch(`${apiBase}/start_hand/${gameId}`, { method: "POST" });
      setActionLog([]);
    } catch (err) {
      console.error("Error starting hand:", err);
      setError("Failed to start new hand");
    } finally {
      setLoading(false);
    }
  }

  async function addAIPlayer(seatIndex: number) {
    if (!gameId) return;
    
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/add_ai_player/${gameId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          seat_index: seatIndex,
          ai_name: `AI_${seatIndex + 1}`
        }),
      });

      if (res.ok) {
        setActionLog((prev) => [...prev, `AI Player added to seat ${seatIndex + 1}`]);
      } else {
        const errData = await res.json().catch(() => ({ detail: "Unknown error" }));
        setError(errData.detail || "Could not add AI player");
      }
    } catch (err) {
      console.error("Error adding AI player:", err);
      setError("Failed to add AI player");
    } finally {
      setLoading(false);
    }
  }

  async function doAction(action: string) {
    if (!gameId || !gameState) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/action/${gameId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_index: gameState.current_player_index,
          action,
          raise_amount: raiseAmount,
        }),
      });

      const data = await res.json();

      if (data.messages?.length) {
        setActionLog((prev) => [...prev, ...data.messages]);
      }
    } catch (err) {
      console.error("Error executing action:", err);
      setError("Failed to execute action");
    } finally {
      setLoading(false);
    }
  }

  const seats = Array.from({ length: 6 }, (_, i) => {
    const player = gameState?.players[i] || null;
    const isCurrentPlayer = i === gameState?.current_player_index;
    const isDealer = player?.name === gameState?.dealer;

    return (
      <PlayerSeat
        key={i}
        player={player}
        seatIndex={i}
        isCurrentPlayer={isCurrentPlayer}
        isDealer={isDealer}
        isInLobby={isInLobby}
        currentPlayerName={currentPlayerName}
        onJoinSeat={joinSeat}
        onLeaveSeat={leaveSeat}
        onAddAI={addAIPlayer}
      />
    );
  });

  return (
    <div className="min-h-screen bg-linear-to-b from-green-900 via-green-800 to-green-900 flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-extrabold text-white mb-8 tracking-wider drop-shadow-lg">
        ♠️ POKER TABLE ♣️
      </h1>

      {/* Connection Status */}
      {gameId && (
        <div className="mb-2">
          <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-600 text-white px-6 py-3 rounded-lg mb-4 shadow-lg max-w-md text-center"
        >
          {error}
        </motion.div>
      )}

      {!gameId ? (
        <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl max-w-md mx-auto space-y-6">
          <div>
            <h2 className="text-white text-xl font-bold mb-2">Create New Game</h2>
            <button
              onClick={createGame}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold"
            >
              Create Game
            </button>
          </div>
            
          <div className="border-t border-gray-700 pt-6" />
            
          <div>
            <h2 className="text-white text-xl font-bold mb-2">Join Existing Game</h2>
            <input
              placeholder="Enter Game ID"
              value={gameIdInput}
              onChange={(e) => setGameIdInput(e.target.value)}
              className="w-full px-4 py-2 rounded-lg mb-3 text-black"
            />
            <button
              onClick={() => {
                if (gameIdInput.trim() !== "") setGameId(gameIdInput.trim());
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold"
            >
              Join Game
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-7xl">
          <div className="text-center mb-4">
            <p className="text-white text-lg">Game ID: <span className="font-mono bg-gray-800 px-2 py-1 rounded">{gameId}</span></p>
            <p className="text-gray-300 text-sm">
              {isInLobby ? "Lobby Phase - Join seats before game starts" : "Game in progress"}
            </p>
          </div>

          {isInLobby && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="bg-blue-600 text-white px-6 py-3 rounded-full mb-4 text-center font-bold text-xl"
            >
              ⏰ Game starting in: {lobbyTimer}s
              <div className="text-sm font-normal mt-1">
                {activePlayers >= 2 ? `Ready with ${activePlayers} players` : 'Need at least 2 players to start'}
              </div>
            </motion.div>
          )}

          <div className="relative bg-linear-to-br from-green-700 to-green-800 rounded-[50%] shadow-2xl border-8 border-amber-900"
            style={{ width: "900px", height: "600px", margin: "0 auto" }}>
            
            <div className="absolute inset-8 bg-green-600 rounded-[50%] shadow-inner" />

            {!isInLobby && (
              <motion.div
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-500 text-black font-bold px-6 py-3 rounded-full shadow-xl"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                POT: ${animatedPot}
              </motion.div>
            )}

            {!isInLobby && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-16 flex gap-2">
                <AnimatePresence>
                  {gameState?.community_cards.map((card, i) => (
                    <motion.div
                      key={card + i}
                      initial={{ opacity: 0, y: -50, rotate: -15 }}
                      animate={{ opacity: 1, y: 0, rotate: 0 }}
                      transition={{ delay: i * 0.2 }}
                    >
                      <Card card={card} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {seats}
          </div>

          <div className="mt-8 bg-gray-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-white text-sm">Stage: <span className="font-bold text-yellow-400">
                  {isInLobby ? 'LOBBY' : gameState?.stage.toUpperCase()}
                </span></p>
                <p className="text-white text-sm">Players: {activePlayers}/6</p>
                {!isInLobby && (
                  <p className="text-white text-sm">Current Bet: ${gameState?.current_bet}</p>
                )}
              </div>
              
              {isInLobby && activePlayers >= 2 && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={startHand}
                  className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg text-white font-bold disabled:opacity-50"
                  disabled={loading}
                >
                  Start Game Now
                </motion.button>
              )}
            </div>

            {gameState?.game_over && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="bg-green-600 text-white p-4 rounded-lg mb-4 text-center font-bold text-xl"
              >
                🏆 {gameState.winner} WINS!
              </motion.div>
            )}
              
            {!isInLobby && gameState?.current_player && !gameState?.game_over && (
              <div className="bg-gray-700 p-4 rounded-lg">
                <p className="text-yellow-300 text-center mb-3 font-bold">
                  🎯 {gameState.current_player === currentPlayerName ? "Your Turn" : `${gameState.current_player}'s Turn`} 
                  {gameState.to_call > 0 && ` (Call: $${gameState.to_call})`}
                </p>

                <div className="flex gap-3 justify-center flex-wrap">
                  {gameState.legal_actions.includes("check") && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => doAction("check")}
                      className="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-lg text-white font-bold"
                      disabled={loading || gameState.current_player !== currentPlayerName}
                    >
                      Check
                    </motion.button>
                  )}

                  {gameState.legal_actions.includes("call") && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => doAction("call")}
                      className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg text-white font-bold"
                      disabled={loading || gameState.current_player !== currentPlayerName}
                    >
                      Call ${gameState.to_call}
                    </motion.button>
                  )}

                  {gameState.legal_actions.includes("fold") && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => doAction("fold")}
                      className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg text-white font-bold"
                      disabled={loading || gameState.current_player !== currentPlayerName}
                    >
                      Fold
                    </motion.button>
                  )}

                  {gameState.legal_actions.includes("raise") && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-24 p-2 text-black rounded-lg"
                        value={raiseAmount}
                        onChange={(e) => setRaiseAmount(Number(e.target.value))}
                        min={gameState.to_call + 1}
                        max={gameState.players.find(p => p.name === currentPlayerName)?.chips || 1000}
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => doAction("raise")}
                        className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg text-white font-bold"
                        disabled={loading || gameState.current_player !== currentPlayerName}
                      >
                        Raise
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isInLobby && (
              <div className="bg-blue-600 p-4 rounded-lg text-center">
                <p className="text-white font-bold mb-2">🎪 LOBBY PHASE</p>
                <p className="text-white text-sm">
                  Click on empty seats to join. Current players can click &quot;Leave Table&quot; to leave.
                  Game will automatically start when timer reaches 0 with at least 2 players.
                </p>
              </div>
            )}

            {actionLog.length > 0 && (
              <div className="mt-4 bg-gray-900 p-4 rounded-lg max-h-40 overflow-y-auto">
                <h3 className="text-white font-bold mb-2">Action Log</h3>
                {actionLog.map((msg, i) => (
                  <p key={i} className="text-gray-300 text-sm">{msg}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}