# ws_manager.py
from fastapi import WebSocket
from typing import Dict, Optional
import json

class ConnectionState:
    """Represents the state of a single WebSocket connection"""
    def __init__(self, websocket: WebSocket, connection_id: str):
        self.ws = websocket
        self.connection_id = connection_id
        self.role = "spectator"  # "spectator" or "player"
        self.player_name: Optional[str] = None
        self.game_id: Optional[str] = None
        self.seat_index: Optional[int] = None
    
    def upgrade_to_player(self, player_name: str, seat_index: int):
        """Upgrade this connection from spectator to player"""
        self.role = "player"
        self.player_name = player_name
        self.seat_index = seat_index
        print(f"[WS] Connection {self.connection_id} upgraded to player: {player_name} at seat {seat_index}")
    
    def downgrade_to_spectator(self):
        """Downgrade player back to spectator"""
        print(f"[WS] Player {self.player_name} downgraded to spectator")
        self.role = "spectator"
        self.player_name = None
        self.seat_index = None
    
    def is_player(self) -> bool:
        return self.role == "player" and self.player_name is not None
    
    def can_see_private_cards(self, seat_index: int) -> bool:
        """Check if this connection can see private cards for a given seat"""
        return self.is_player() and self.seat_index == seat_index


class ConnectionManager:
    def __init__(self):
        # Map of game_id -> list of ConnectionState objects
        self.game_connections: Dict[str, list[ConnectionState]] = {}
        # Map of websocket -> ConnectionState for quick lookups
        self.ws_to_state: Dict[WebSocket, ConnectionState] = {}
        self.connection_counter = 0

    async def connect(self, game_id: str, websocket: WebSocket) -> ConnectionState:
        """Accept a new WebSocket connection"""
        await websocket.accept()
        
        # Create connection state
        self.connection_counter += 1
        conn_state = ConnectionState(websocket, f"conn_{self.connection_counter}")
        conn_state.game_id = game_id
        
        # Store in our maps
        if game_id not in self.game_connections:
            self.game_connections[game_id] = []
        self.game_connections[game_id].append(conn_state)
        self.ws_to_state[websocket] = conn_state
        
        print(f"[WS CONNECT] game={game_id} conn_id={conn_state.connection_id} total_connections={len(self.game_connections[game_id])}")
        return conn_state

    def disconnect(self, game_id: str, websocket: WebSocket):
        """Remove a WebSocket connection"""
        conn_state = self.ws_to_state.get(websocket)
        if not conn_state:
            return
        
        if game_id in self.game_connections:
            if conn_state in self.game_connections[game_id]:
                self.game_connections[game_id].remove(conn_state)
                print(f"[WS DISCONNECT] game={game_id} player={conn_state.player_name} conn_id={conn_state.connection_id}")
        
        if websocket in self.ws_to_state:
            del self.ws_to_state[websocket]
    
    def get_connection_state(self, websocket: WebSocket) -> Optional[ConnectionState]:
        """Get the connection state for a websocket"""
        return self.ws_to_state.get(websocket)
    
    def upgrade_connection_to_player(self, websocket: WebSocket, player_name: str, seat_index: int) -> bool:
        """Upgrade a connection from spectator to player"""
        conn_state = self.ws_to_state.get(websocket)
        if not conn_state:
            return False
        
        conn_state.upgrade_to_player(player_name, seat_index)
        return True
    
    def downgrade_connection_to_spectator(self, websocket: WebSocket) -> bool:
        """Downgrade a player connection back to spectator"""
        conn_state = self.ws_to_state.get(websocket)
        if not conn_state:
            return False
        
        conn_state.downgrade_to_spectator()
        return True
    
    async def send_personal_message(self, websocket: WebSocket, message: dict):
        """Send a message to a specific connection"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            print(f"[WS ERROR] Failed to send personal message: {e}")
    
    async def broadcast(self, game_id: str, game_state_obj):
        """
        Broadcast game state to all connections in a game.
        Each connection receives personalized state based on their role.
        """
        connections = self.game_connections.get(game_id, [])
        remove_list = []
        
        is_game_object = hasattr(game_state_obj, "get_game_state")
        
        print(f"[BCAST] game_id={game_id} is_game_object={is_game_object} connections={len(connections)}")
        
        for conn_state in connections:
            try:
                # Get personalized game state based on connection's role
                if is_game_object:
                    # If player, show their cards. If spectator, hide all cards.
                    viewer_name = conn_state.player_name if conn_state.is_player() else None
                    personalized_state = game_state_obj.get_game_state(viewer_name=viewer_name)
                    
                    message = {
                        "type": "state_update",
                        "state": personalized_state
                    }
                else:
                    message = game_state_obj
                
                await conn_state.ws.send_json(message)
                print(f"[BCAST SENT] to={conn_state.player_name or 'spectator'} conn_id={conn_state.connection_id} role={conn_state.role}")
            
            except Exception as e:
                print(f"[WS ERROR] Removing closed connection {conn_state.connection_id}: {e}")
                remove_list.append(conn_state)
        
        # Clean up dead connections
        for conn_state in remove_list:
            self.disconnect(game_id, conn_state.ws)