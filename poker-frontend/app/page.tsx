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
  legal_actions: string[];
  game_over: boolean;
  winner: string | null;
  dealer: string;
  players: Player[];
};

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]); 

  return Math.round(display);
}


export default function Page() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerNames, setPlayerNames] = useState("Alice,Bob");
  const [raiseAmount, setRaiseAmount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string>("");
  const [actionLog, setActionLog] = useState<string[]>([]);

  const apiBase = "http://localhost:8000";
  

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

  async function startHand() {
    if (!gameId) return;
    setLoading(true);
    const res = await fetch(`${apiBase}/start_hand/${gameId}`, { method: "POST" });
    const data = await res.json();
    setGameState(data.state);
    setLastAction("");
    setActionLog([]);
    setLoading(false);
  }

  async function doAction(action: string) {
    if (!gameId || !gameState) return;
    const currentIndex = gameState.current_player_index;
    setLoading(true);
    const res = await fetch(`${apiBase}/action/${gameId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_index: currentIndex,
        action,
        raise_amount: raiseAmount,
      }),
    });
    const data = await res.json();
    setGameState(data.state);
    setLoading(false);

    if (data.messages?.length) {
      const joined = data.messages.join(" → ");
      setLastAction(joined);
      setActionLog((prev) => [...prev, ...data.messages]);
    }
  }

  const animatedPot = useAnimatedNumber(gameState?.pot || 0);

  return (
    <main className="p-6 flex flex-col gap-6 text-white bg-linear-to-b from-gray-900 to-gray-800 min-h-screen">
      <motion.h1
        className="text-4xl font-extrabold text-center tracking-wide"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        ♠ Poker Game
      </motion.h1>

      {!gameId ? (
        <div className="flex flex-col items-center gap-3">
          <input
            className="p-2 text-black rounded"
            value={playerNames}
            onChange={(e) => setPlayerNames(e.target.value)}
            placeholder="Comma-separated player names"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={createGame}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
            disabled={loading}
          >
            Create Game
          </motion.button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <h2 className="text-lg">Game ID: {gameId}</h2>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startHand}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
            disabled={loading}
          >
            Start New Hand
          </motion.button>

          {gameState && (
            <motion.div
              layout
              className="w-full max-w-3xl bg-gray-800/80 p-4 rounded-lg shadow-xl backdrop-blur"
            >
              <div className="mb-4 text-center">
                <p>Stage: {gameState.stage}</p>
                <p className="text-lg">Pot: 💰 {animatedPot}</p>
                <p>Current Bet: {gameState.current_bet}</p>
                <p>Dealer: {gameState.dealer}</p>
                {gameState.game_over && (
                  <p className="text-green-400 font-bold mt-2">
                    🏆 Winner: {gameState.winner}
                  </p>
                )}
              </div>

              {/* 🃏 Community Cards Animation */}
              <div className="mb-6">
                <h3 className="font-semibold text-center mb-2">Community Cards</h3>
                <div className="flex gap-3 justify-center">
                  <AnimatePresence>
                    {gameState.community_cards.map((card, i) => (
                      <motion.span
                        key={card + i}
                        initial={{ opacity: 0, y: -20, rotate: -15 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          rotate: 0,
                          transition: {
                            delay: i * 0.2,
                            type: "spring",
                            stiffness: 120,
                          },
                        }}
                        exit={{ opacity: 0, y: 20 }}
                        className="bg-linear-to-br from-gray-700 to-gray-800 px-4 py-2 rounded-lg border border-gray-600 shadow-lg"
                      >
                        {card}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* 👥 Players */}
              <div className="mb-4">
                <h3 className="font-semibold mb-3 text-center">Players</h3>
                <div className="flex flex-col gap-3">
                  {gameState.players.map((p, i) => (
                    <motion.div
                      key={i}
                      layout
                      animate={{
                        scale:
                          i === gameState.current_player_index ? 1.05 : 1,
                        borderColor:
                          i === gameState.current_player_index
                            ? "#facc15"
                            : "#4b5563",
                      }}
                      transition={{ type: "spring", stiffness: 100 }}
                      className={`p-3 rounded-xl border bg-gray-900/70 shadow-md`}
                    >
                      <p className="font-semibold">
                        {p.name} — 💵 {p.chips}{" "}
                        {p.folded && (
                          <span className="text-red-400">(Folded)</span>
                        )}
                      </p>
                      <p className="text-sm">Current Bet: {p.current_bet}</p>

                      <div className="flex gap-2 mt-2">
                        {p.hand.map((c, j) => (
                          <motion.div
                            key={j}
                            initial={{ rotateY: 180, opacity: 0 }}
                            animate={{ rotateY: 0, opacity: 1 }}
                            transition={{
                              delay: j * 0.2,
                              duration: 0.5,
                              ease: "easeOut",
                            }}
                            className="bg-gray-700 px-3 py-2 rounded border border-gray-500 text-center shadow-sm"
                            style={{ transformStyle: "preserve-3d" }}
                          >
                            {c}
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* 🎯 Current Turn & Actions */}
              {gameState.current_player && !gameState.game_over && (
                <div className="flex flex-col items-center gap-3 mt-6">
                  <p className="text-yellow-300 text-lg animate-pulse">
                    🎯 Current Turn: {gameState.current_player}
                  </p>

                  {lastAction && (
                    <p className="text-gray-300 text-sm italic">
                      💬 Last Action: {lastAction}
                    </p>
                  )}

                  <div className="flex gap-3 flex-wrap justify-center mt-2">
                    {gameState.legal_actions.includes("check") && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => doAction("check")}
                        className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
                        disabled={loading}
                      >
                        Check
                      </motion.button>
                    )}
                    {gameState.legal_actions.includes("call") && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => doAction("call")}
                        className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
                        disabled={loading}
                      >
                        Call
                      </motion.button>
                    )}
                    {gameState.legal_actions.includes("fold") && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => doAction("fold")}
                        className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
                        disabled={loading}
                      >
                        Fold
                      </motion.button>
                    )}
                    {gameState.legal_actions.includes("raise") && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="w-20 p-1 text-black rounded"
                          value={raiseAmount}
                          onChange={(e) =>
                            setRaiseAmount(Number(e.target.value))
                          }
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => doAction("raise")}
                          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
                          disabled={loading}
                        >
                          Raise
                        </motion.button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 🧾 Action Log */}
              {actionLog.length > 0 && (
                <div className="bg-gray-700 mt-6 p-3 rounded-lg max-h-40 overflow-y-auto">
                  <h3 className="font-semibold mb-2 text-white text-center">
                    🧾 Action Log
                  </h3>
                  {actionLog.map((a, i) => (
                    <p
                      key={i}
                      className={`text-sm ${
                        a.toLowerCase().includes("bot")
                          ? "text-green-400"
                          : "text-blue-300"
                      }`}
                    >
                      {a}
                    </p>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </main>
  );
}
