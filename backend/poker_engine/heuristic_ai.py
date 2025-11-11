import random
from poker_engine.utils import eval_hand


class HeuristicAI:
    """
    A smarter poker AI that makes decisions based on hand strength and simple risk logic.
    It uses deterministic rules + random bluffing to appear human-like.
    """

    def __init__(self, name="Bot", difficulty="medium"):
        self.name = name
        self.is_bot = True
        self.difficulty = difficulty  # "easy", "medium", "hard"

    def decide(self, state: dict) -> dict:
        """
        Decide what action to take based on the current game state.

        state keys:
          - legal_actions: list of available actions
          - stage: preflop / flop / turn / river
          - community_cards: list[str]
          - players: list of player dicts
          - pot, current_bet, to_call
        """

        actions = state.get("legal_actions", [])
        if not actions:
            return {"move": "check", "raise_amount": 0}

        # Extract the bot's own hand
        players = state.get("players", [])
        bot = next((p for p in players if p["name"] == self.name), None)
        if not bot:
            return {"move": "fold", "raise_amount": 0}

        hand = bot.get("hand", [])
        community = state.get("community_cards", [])
        stage = state.get("stage", "")
        pot = state.get("pot", 0)
        to_call = state.get("to_call", 0)

        # Evaluate hand strength using your existing eval_hand() util
        try:
            rank, _ = eval_hand(hand + community)
        except Exception:
            rank = None

        # Handle preflop or invalid rank
        if rank is None:
            if hand: 
                high_card_values = {"2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
                                    "7": 7, "8": 8, "9": 9, "10": 10,
                                    "J": 11, "Q": 12, "K": 13, "A": 14}
                values = [high_card_values.get(c[:-1], 0) for c in hand]  # c like 'AH' or '10S'
                avg_val = sum(values) / len(values)
                rank = max(1, int(avg_val / 1.5)) 
            else:
                rank = 5  
        normalized_rank = min(rank / 10.0, 1.0)


        # Calculate pot odds
        pot_odds = to_call / (pot + to_call) if (pot + to_call) > 0 else 0

        # --- Decision Logic ---

        # Strong hands → raise aggressively
        if normalized_rank >= 0.8:
            if "raise" in actions:
                raise_amt = random.choice([50, 100, 200])
                return {"move": "raise", "raise_amount": raise_amt}
            elif "call" in actions:
                return {"move": "call", "raise_amount": 0}

        # Decent hands → call/check depending on stage
        elif normalized_rank >= 0.4:
            if "call" in actions and pot_odds < 0.6:
                return {"move": "call", "raise_amount": 0}
            elif "check" in actions:
                return {"move": "check", "raise_amount": 0}
            else:
                return {"move": "fold", "raise_amount": 0}

        # Weak hands → fold most of the time, sometimes bluff
        else:
            bluff_chance = {"easy": 0.05, "medium": 0.15, "hard": 0.25}[self.difficulty]
            if "raise" in actions and random.random() < bluff_chance:
                raise_amt = random.choice([20, 30, 40])
                return {"move": "raise", "raise_amount": raise_amt}
            elif "check" in actions and to_call == 0:
                return {"move": "check", "raise_amount": 0}
            elif "call" in actions and pot_odds < 0.2:
                return {"move": "call", "raise_amount": 0}
            else:
                return {"move": "fold", "raise_amount": 0}

        # Fallback
        return {"move": random.choice(actions), "raise_amount": 0}
