"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
};

// Seat positions for 6 players around an oval table
const SEAT_POSITIONS = [
  { top: "70%", left: "50%", transform: "translate(-50%, -50%)" }, // Bottom (Player 0)
  { top: "70%", left: "10%", transform: "translate(-50%, -50%)" }, // Bottom Left
  { top: "30%", left: "10%", transform: "translate(-50%, -50%)" }, // Top Left
  { top: "10%", left: "50%", transform: "translate(-50%, -50%)" }, // Top (Player 1 in 2p)
  { top: "30%", left: "90%", transform: "translate(-50%, -50%)" }, // Top Right
  { top: "70%", left: "90%", transform: "translate(-50%, -50%)" }, // Bottom Right
];

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
}: {
  player: Player | null;
  seatIndex: number;
  isCurrentPlayer: boolean;
  isDealer: boolean;
}) {
  const position = SEAT_POSITIONS[seatIndex];

  return (
    <motion.div
      className="absolute"
      style={position}
      animate={{
        scale: isCurrentPlayer ? 1.1 : 1,
      }}
      transition={{ type: "spring", stiffness: 200 }}
    >
      {player ? (
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
            {/* Dealer Button */}
            {isDealer && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg"
              >
                D
              </motion.div>
            )}

            {/* Player Name & Status */}
            <div className="mb-2">
              <p className="font-bold text-white text-sm truncate">{player.name}</p>
              <p className="text-green-400 text-xs">💰 ${player.chips}</p>
              {player.current_bet > 0 && (
                <p className="text-yellow-300 text-xs">Bet: ${player.current_bet}</p>
              )}
              {player.folded && (
                <p className="text-red-400 text-xs font-semibold">FOLDED</p>
              )}
            </div>

            {/* Cards */}
            <div className="flex gap-1 justify-center">
              {player.hand.map((card, i) => (
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
        <div
          className="bg-gray-700/50 rounded-2xl p-4 border-2 border-dashed border-gray-500 flex items-center justify-center"
          style={{ width: "180px", height: "140px" }}
        >
          <p className="text-gray-400 text-sm">Empty Seat</p>
        </div>
      )}
    </motion.div>
  );
}

export default function PokerTable() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerNames, setPlayerNames] = useState("Alice");
  const [raiseAmount, setRaiseAmount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);

  const apiBase = "http://localhost:8000";

  const animatedPot = useAnimatedNumber(gameState?.pot || 0);

  // WebSocket connection
  useEffect(() => {
    if (!gameId) return;

    const viewerName = playerNames.split(",")[0];
    const ws = new WebSocket(`ws://localhost:8000/ws/${gameId}/${viewerName}`);

    ws.onopen = () => console.log("🔗 WebSocket Connected");

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "state_update") {
        setGameState(message.state);
      }
    };

    ws.onclose = () => console.log("❌ WebSocket Disconnected");

    return () => ws.close();
  }, [gameId, playerNames]);

  // Create game
  async function createGame() {
    setLoading(true);
    const res = await fetch(`${apiBase}/create_game`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_names: playerNames.split(",") }),
    });

    const data = await res.json();
    setGameId(data.game_id);
    setGameState(data.state);
    setLoading(false);
  }

  // Start new hand
  async function startHand() {
    if (!gameId) return;
    setLoading(true);
    await fetch(`${apiBase}/start_hand/${gameId}`, { method: "POST" });
    setActionLog([]);
    setLoading(false);
  }

  // Execute action
  async function doAction(action: string) {
    if (!gameId || !gameState) return;

    setLoading(true);

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
    setLoading(false);

    if (data.messages?.length) {
      setActionLog((prev) => [...prev, ...data.messages]);
    }
  }

  // Render seats for up to 6 players
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
      />
    );
  });

  return (
    <div className="min-h-screen bg-linear-to-b from-green-900 via-green-800 to-green-900 flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-extrabold text-white mb-8 tracking-wider drop-shadow-lg">
        ♠️ POKER TABLE ♣️
      </h1>

      {!gameId ? (
        // Setup screen
        <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl">
          <input
            className="p-3 text-black rounded-lg w-full mb-4"
            value={playerNames}
            onChange={(e) => setPlayerNames(e.target.value)}
            placeholder="Your name"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={createGame}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg w-full text-white font-bold"
            disabled={loading}
          >
            Create Game
          </motion.button>
        </div>
      ) : (
        <div className="w-full max-w-7xl">
          {/* Table */}
          <div className="relative bg-linear-to-br from-green-700 to-green-800 rounded-[50%] shadow-2xl border-8 border-amber-900"
            style={{ width: "900px", height: "600px", margin: "0 auto" }}>
            
            {/* Inner felt */}
            <div className="absolute inset-8 bg-green-600 rounded-[50%] shadow-inner" />

            {/* Pot in center */}
            <motion.div
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-500 text-black font-bold px-6 py-3 rounded-full shadow-xl"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
            >
              POT: ${animatedPot}
            </motion.div>

            {/* Community Cards */}
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

            {/* Player Seats */}
            {seats}
          </div>

          {/* Controls */}
          <div className="mt-8 bg-gray-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-white text-sm">Stage: <span className="font-bold text-yellow-400">{gameState?.stage.toUpperCase()}</span></p>
                <p className="text-white text-sm">Current Bet: ${gameState?.current_bet}</p>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startHand}
                className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg text-white font-bold"
                disabled={loading}
              >
                New Hand
              </motion.button>
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

            {/* Action Buttons */}
            {gameState?.current_player && !gameState?.game_over && (
              <div className="bg-gray-700 p-4 rounded-lg">
                <p className="text-yellow-300 text-center mb-3 font-bold">
                  🎯 {gameState.current_player}&apos;s Turn (Call: ${gameState.to_call})
                </p>
                
                <div className="flex gap-3 justify-center flex-wrap">
                  {gameState.legal_actions.includes("check") && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => doAction("check")}
                      className="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-lg text-white font-bold"
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
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => doAction("raise")}
                        className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg text-white font-bold"
                      >
                        Raise
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Log */}
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