# main.py
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uuid import uuid4
from concurrent.futures import ProcessPoolExecutor
import asyncio
from poker_engine.monte_carlo_ai import MonteCarloAI
from fastapi import Body
import random
from poker_engine.poker_engine_api import PokerGame
from ws_manager import ConnectionManager

manager = ConnectionManager()

app = FastAPI(title="Poker Game API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

games = {}
locks = {}
lobby_timers = {}
executor = ProcessPoolExecutor(max_workers=2)

LOBBY_DURATION = 15
MIN_PLAYERS = 2

# --- Request models ---
class CreateGameRequest(BaseModel):
    player_names: list[str]
    seat_count: int | None = 6

class ActionRequest(BaseModel):
    player_index: int
    action: str
    raise_amount: int | None = 0

class JoinSeatRequest(BaseModel):
    player_name: str
    seat_index: int

class LeaveSeatRequest(BaseModel):
    seat_index: int

class UpgradeToPlayerMessage(BaseModel):
    player_name: str
    seat_index: int

# --- Lobby Management ---
async def start_lobby_timer(game_id: str):
    """Start or restart the lobby timer for a game"""
    if game_id in lobby_timers:
        lobby_timers[game_id].cancel()
    
    lobby_timers[game_id] = asyncio.create_task(lobby_countdown(game_id))

async def lobby_countdown(game_id: str):
    """Countdown timer for lobby phase"""
    game = games.get(game_id)
    if not game:
        return

    try:
        for remaining in range(LOBBY_DURATION, -1, -1):
            game.lobby_timer = remaining
            game.game_starting = remaining <= 5 and remaining > 0
            
            await manager.broadcast(game_id, game)
            
            if remaining == 0:
                break
                
            await asyncio.sleep(1)
        
        await check_and_start_game(game_id)
        
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"Lobby timer error for game {game_id}: {e}")

async def check_and_start_game(game_id: str):
    """Check if game can start and begin if conditions are met"""
    game = games.get(game_id)
    if not game:
        return

    async with locks[game_id]:
        active_players = sum(1 for p in game.players if getattr(p, "name", "") and getattr(p, "name", "") != "")
        
        if active_players >= MIN_PLAYERS:
            print(f"Starting game {game_id} with {active_players} players")
            game.stage = "preflop"
            game.lobby_timer = None
            game.game_starting = False
            
            game.play_hand()
            await manager.broadcast(game_id, game)
        else:
            print(f"Not enough players for game {game_id} ({active_players}/{MIN_PLAYERS})")
            game.lobby_timer = LOBBY_DURATION
            await manager.broadcast(game_id, game)
            await start_lobby_timer(game_id)

def get_active_player_count(game: PokerGame) -> int:
    """Count how many players are actively seated"""
    return sum(1 for p in game.players if getattr(p, "name", "") and getattr(p, "name", "") != "")

# --- Routes ---
@app.post("/create_game")
async def create_game(req: CreateGameRequest):
    """Create a new poker game session with optional seat_count."""
    game_id = str(uuid4())[:8]
    seat_count = req.seat_count or 6

    initial_names = req.player_names.copy()
    while len(initial_names) < seat_count:
        initial_names.append("")

    game = PokerGame(initial_names)
    game.stage = "lobby"
    game.lobby_timer = LOBBY_DURATION
    game.game_starting = False

    for i, p in enumerate(game.players):
        if p.name == "Bot":
            p.is_bot = True
            print(f"Added Bot to seat {i}")

    games[game_id] = game
    locks[game_id] = asyncio.Lock()

    await start_lobby_timer(game_id)

    return {"game_id": game_id, "state": game.get_game_state()}

@app.post("/add_ai_player/{game_id}")
async def add_ai_player(game_id: str, payload: dict = Body(...)):
    """Add an AI player to an empty seat"""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    seat_index = payload.get("seat_index")
    ai_name = payload.get("ai_name", "AI Player")

    async with locks[game_id]:
        if game.stage != "lobby":
            raise HTTPException(status_code=400, detail="Can only add AI players during lobby phase")

        if seat_index < 0 or seat_index >= len(game.players):
            raise HTTPException(status_code=400, detail="Invalid seat index")

        existing = game.players[seat_index]
        if existing.name and existing.name != "":
            raise HTTPException(status_code=409, detail="Seat already taken")

        existing.name = ai_name
        existing.is_bot = True
        existing.folded = False
        existing.current_bet = 0
        if existing.chips <= 0:
            existing.chips = 1000
        existing.hand = []

        await start_lobby_timer(game_id)
        await manager.broadcast(game_id, game)

    return {"success": True, "state": game.get_game_state()}

@app.post("/start_hand/{game_id}")
async def start_hand(game_id: str):
    """Start a new hand for an existing game"""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    async with locks[game_id]:
        if getattr(game, 'stage', '') == 'lobby':
            active_players = get_active_player_count(game)
            if active_players < MIN_PLAYERS:
                raise HTTPException(status_code=400, detail=f"Need at least {MIN_PLAYERS} players to start")
            
            if game_id in lobby_timers:
                lobby_timers[game_id].cancel()
                del lobby_timers[game_id]
            
            game.stage = "preflop"
            game.lobby_timer = None
            game.game_starting = False
        
        game.play_hand()
        await manager.broadcast(game_id, game)

        return {"message": "New hand started", "state": game.get_game_state()}

@app.post("/join_seat/{game_id}")
async def join_seat(game_id: str, payload: JoinSeatRequest):
    """
    Join a seat in the game during lobby phase.
    NOTE: This is called via HTTP, not WebSocket message
    """
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    player_name = payload.player_name
    seat_index = payload.seat_index

    async with locks[game_id]:
        if getattr(game, 'stage', '') != 'lobby':
            raise HTTPException(status_code=400, detail="Can only join seats during lobby phase")

        if seat_index < 0 or seat_index >= len(game.players):
            raise HTTPException(status_code=400, detail="Invalid seat index")

        existing = game.players[seat_index]
        if getattr(existing, "name", "") and getattr(existing, "name", "") != "":
            raise HTTPException(status_code=409, detail="Seat already taken")

        existing.name = player_name
        existing.is_bot = False
        existing.folded = False
        existing.current_bet = 0
        if getattr(existing, "chips", 0) <= 0:
            existing.chips = 1000
        existing.hand = []

        await start_lobby_timer(game_id)
        await manager.broadcast(game_id, game)

    return {"success": True, "state": game.get_game_state()}

@app.post("/leave_seat/{game_id}")
async def leave_seat(game_id: str, payload: LeaveSeatRequest):
    """Leave a seat during lobby phase"""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    seat_index = payload.seat_index

    async with locks[game_id]:
        if getattr(game, 'stage', '') != 'lobby':
            raise HTTPException(status_code=400, detail="Can only leave seats during lobby phase")

        if seat_index < 0 or seat_index >= len(game.players):
            raise HTTPException(status_code=400, detail="Invalid seat index")

        player = game.players[seat_index]
        player_name = getattr(player, "name", "")
        
        if not player_name or player_name == "":
            raise HTTPException(status_code=400, detail="Seat is already empty")

        player.name = ""
        player.is_bot = False
        player.folded = False
        player.current_bet = 0
        player.hand = []

        await start_lobby_timer(game_id)
        await manager.broadcast(game_id, game)

    return {"success": True, "state": game.get_game_state()}

@app.post("/action/{game_id}")
async def player_action(game_id: str, data: dict = Body(...)):
    """Execute a player's action, and trigger AI moves if it's the bot's turn."""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    if getattr(game, 'stage', '') == 'lobby':
        raise HTTPException(status_code=400, detail="Game is in lobby phase - cannot perform actions")

    async with locks[game_id]:
        player_index = data["player_index"]
        action = data["action"]
        raise_amount = data.get("raise_amount", 0)

        print(f"[ACTION] Player {player_index} ({game.players[player_index].name}) action: {action} {raise_amount}")

        result = game.execute_action(player_index, action, raise_amount)
        print(f"[ACTION RESULT] {result}")
        
        state = game.get_game_state()
        await manager.broadcast(game_id, game)

        messages = [f"{game.players[player_index].name} chose {action} {raise_amount if raise_amount else ''}".strip()]

        # AI turn loop
        ai_iterations = 0
        max_ai_iterations = 20
        
        while (
            not game.game_over
            and game.current_player_index is not None
            and getattr(game.players[game.current_player_index], "is_bot", False)
            and ai_iterations < max_ai_iterations
        ):
            ai_iterations += 1
            ai_player_obj = game.players[game.current_player_index]
            ai_name = ai_player_obj.name

            print(f"[AI TURN] {ai_name} (iteration {ai_iterations})")

            think_time = random.uniform(1, 2)
            await asyncio.sleep(think_time)

            ai_state = game.get_game_state()
            loop = asyncio.get_event_loop()

            ai_player = MonteCarloAI(name=ai_name, simulations=200)
            
            try:
                ai_decision = await loop.run_in_executor(executor, ai_player.decide, ai_state)
                print(f"[AI DECISION] {ai_name}: {ai_decision}")
            except Exception as e:
                print(f"[AI ERROR] {ai_name} failed to decide: {e}")
                ai_decision = {"move": "fold", "raise_amount": 0}

            move = ai_decision["move"]
            amt = ai_decision.get("raise_amount", 0)

            print(f"[AI ACTION] {ai_name} chooses {move} {amt if amt else ''} after {think_time:.1f}s")
            messages.append(f"{ai_name} waited {think_time:.1f}s → {move} {amt if amt else ''}")

            result = game.execute_action(game.current_player_index, move, amt)
            print(f"[AI ACTION RESULT] {result}")
            
            state = game.get_game_state()
            await manager.broadcast(game_id, game)

        if ai_iterations >= max_ai_iterations:
            print(f"[WARNING] AI loop hit max iterations limit!")

        return {"result": result, "state": state, "messages": messages}

@app.get("/state/{game_id}")
async def get_state(game_id: str):
    """Return full current state of the game"""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    return {"state": game.get_game_state()}

@app.websocket("/ws/{game_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str):
    """
    Single WebSocket connection that handles both spectators and players.
    Clients upgrade from spectator to player via WebSocket messages.
    """
    # Connect as spectator initially
    conn_state = await manager.connect(game_id, websocket)
    print(f"[WS CONNECT] game={game_id} conn_id={conn_state.connection_id} role=spectator")

    game = games.get(game_id)
    if game:
        try:
            # Send initial state as spectator (no private cards visible)
            await websocket.send_json({
                "type": "state_update",
                "state": game.get_game_state(viewer_name=None)
            })
            print(f"[WS INIT STATE SENT] to={conn_state.connection_id} as spectator")
        except Exception as e:
            print(f"[WS INIT ERROR] to={conn_state.connection_id}: {e}")

    try:
        while True:
            # Listen for messages from client
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "upgrade_to_player":
                # Client wants to become a player
                player_name = data.get("player_name")
                seat_index = data.get("seat_index")
                
                print(f"[WS] Connection {conn_state.connection_id} requesting upgrade to player: {player_name} seat {seat_index}")
                
                # Upgrade the connection
                success = manager.upgrade_connection_to_player(websocket, player_name, seat_index)
                
                if success:
                    # Send updated state with private cards visible
                    if game:
                        personalized_state = game.get_game_state(viewer_name=player_name)
                        await websocket.send_json({
                            "type": "upgrade_success",
                            "state": personalized_state
                        })
                        print(f"[WS] Upgrade successful for {player_name}")
                else:
                    await websocket.send_json({
                        "type": "upgrade_failed",
                        "error": "Could not upgrade to player"
                    })
                    
            elif msg_type == "downgrade_to_spectator":
                # Player wants to become spectator again
                print(f"[WS] Player {conn_state.player_name} requesting downgrade to spectator")
                manager.downgrade_connection_to_spectator(websocket)
                
                # Send state without private cards
                if game:
                    await websocket.send_json({
                        "type": "state_update",
                        "state": game.get_game_state(viewer_name=None)
                    })
            
            elif msg_type == "ping":
                # Heartbeat
                await websocket.send_json({"type": "pong"})
            
            else:
                print(f"[WS] Unknown message type: {msg_type}")
                
    except WebSocketDisconnect:
        manager.disconnect(game_id, websocket)
        print(f"[WS DISCONNECT] game={game_id} conn_id={conn_state.connection_id}")

@app.delete("/game/{game_id}")
async def cleanup_game(game_id: str):
    """Clean up a game session"""
    if game_id in games:
        if game_id in lobby_timers:
            lobby_timers[game_id].cancel()
            del lobby_timers[game_id]
        del games[game_id]
        if game_id in locks:
            del locks[game_id]
    return {"message": "Game cleaned up"}