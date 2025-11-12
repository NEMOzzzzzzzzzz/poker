# main.py
#from poker_engine.heuristic_ai import HeuristicAI
#from poker_engine.simple_ai import SimpleAI
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uuid import uuid4
from concurrent.futures import ProcessPoolExecutor
import asyncio
from poker_engine.monte_carlo_ai import MonteCarloAI
from fastapi import Body
import random

# Import your engine
from poker_engine.poker_engine_api import PokerGame

app = FastAPI(title="Poker Game API")

# Allow requests from your React/Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for active games (room_id -> PokerGame)
games = {}
locks = {}
executor = ProcessPoolExecutor(max_workers=2)

# --- Request models ---
class CreateGameRequest(BaseModel):
    player_names: list[str]

class ActionRequest(BaseModel):
    player_index: int
    action: str
    raise_amount: int | None = 0


# --- Routes ---

@app.post("/create_game")
async def create_game(req: CreateGameRequest):
    """Create a new poker game session with 1 AI opponent."""
    if len(req.player_names) < 1:
        raise HTTPException(status_code=400, detail="Need at least one human player")

    game_id = str(uuid4())[:8]

    # Add a bot player automatically
    all_players = req.player_names + ["Bot"]
    game = PokerGame(all_players)

    # Mark bot flag
    for p in game.players:
        if p.name == "Bot":
            p.is_bot = True

    games[game_id] = game
    locks[game_id] = asyncio.Lock()
    return {"game_id": game_id, "state": game.get_game_state()}


@app.post("/start_hand/{game_id}")
async def start_hand(game_id: str):
    """Start a new hand for an existing game"""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    async with locks[game_id]:
        game.play_hand()
        return {"message": "New hand started", "state": game.get_game_state()}


@app.post("/action/{game_id}")
async def player_action(game_id: str, data: dict = Body(...)):
    """Execute a player's action, and trigger AI moves if it's the bot's turn."""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    async with locks[game_id]:
        player_index = data["player_index"]
        action = data["action"]
        raise_amount = data.get("raise_amount", 0)

        # Apply human action
        result = game.execute_action(player_index, action, raise_amount)
        state = game.get_game_state()

        # Log messages from human player
        messages = [f"{game.players[player_index].name} chose {action} {raise_amount if raise_amount else ''}".strip()]

        while (
            not game.game_over
            and game.current_player_index is not None
            and getattr(game.players[game.current_player_index], "is_bot", False)
        ):
            ai_player_obj = game.players[game.current_player_index]
            ai_name = ai_player_obj.name

            think_time = random.uniform(3, 5)
            await asyncio.sleep(think_time)

            ai_state = game.get_game_state()
            loop = asyncio.get_event_loop()

            # Create AI instance (MonteCarlo, Heuristic, etc.)
            ai_player = MonteCarloAI(name=ai_name, simulations=200)
            ai_decision = await loop.run_in_executor(executor, ai_player.decide, ai_state)

            move = ai_decision["move"]
            amt = ai_decision.get("raise_amount", 0)

            # Execute and log AI move
            print(f"[AI] {ai_name} chooses {move} {amt if amt else ''} after {think_time:.1f}s")
            messages.append(f"{ai_name} ({ai_player.__class__.__name__}) waited {think_time:.1f}s → {move} {amt if amt else ''}")

            game.execute_action(game.current_player_index, move, amt)
            state = game.get_game_state()

        return {"result": result, "state": state, "messages": messages}

@app.get("/state/{game_id}")
async def get_state(game_id: str):
    """Return full current state of the game"""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    return {"state": game.get_game_state()}
