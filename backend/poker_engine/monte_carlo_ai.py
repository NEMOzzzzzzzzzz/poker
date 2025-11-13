import random
from poker_engine.utils import eval_hand
from poker_engine.card import Deck, Card

class MonteCarloAI:
    def __init__(self, name="Bot", difficulty="medium", simulations=300):
        self.name = name
        self.difficulty = difficulty
        self.simulations = simulations
        self.isBot = True
    
    def estWin(self, hand, community, opponents=1):
        # FIX: Check if hand is EMPTY, not if it has cards
        if not hand or len(hand) == 0:
            return 0.0
        
        # Parse string cards to Card objects if needed
        if isinstance(hand[0], str):
            hand = [self._parse_card(c) for c in hand]
        if isinstance(community[0] if community else None, str):
            community = [self._parse_card(c) for c in community]
        
        deck = Deck()
        used_cards = set(hand + community)
        deck.cards = [c for c in deck.cards if c not in used_cards]
        
        wins = 0
        for _ in range(self.simulations):
            sim_deck = Deck()
            sim_deck.cards = deck.cards.copy()
            random.shuffle(sim_deck.cards)
            
            sim_community = community.copy()
            while len(sim_community) < 5:
                sim_community += sim_deck.deal(1)
            
            opp_hands = []
            for _ in range(opponents):
                opp_hands.append(sim_deck.deal(2))
            
            our_rank, _ = eval_hand(hand + sim_community)
            best_opp_rank = None
            
            for opp_hand in opp_hands:
                rank, _ = eval_hand(opp_hand + sim_community)
                if best_opp_rank is None or rank > best_opp_rank:
                    best_opp_rank = rank
            
            if best_opp_rank is None or our_rank >= best_opp_rank:
                wins += 1
                
        return wins / self.simulations
    
    def _parse_card(self, card_str):
        """Parse card string like '2h' into Card object"""
        if isinstance(card_str, Card):
            return card_str
        rank = card_str[:-1]
        suit = card_str[-1]
        return Card(rank, suit)
    
    def decide(self, state: dict) -> dict:
        actions = state.get("legal_actions", [])
        if not actions:
            return {"move": "check", "raise_amount": 0}
        
        players = state.get("players", [])
        bot = next((p for p in players if p["name"] == self.name), None)
        if not bot:
            return {"move": "fold", "raise_amount": 0}
        
        hand = bot.get("hand", [])
        community = state.get("community_cards", [])
        pot = state.get("pot", 0)
        to_call = state.get("to_call", 0)
        
        win_prob = self.estWin(hand, community, opponents=len(players) - 1)
        
        # Aggressive play with strong hands
        if win_prob > 0.7:
            if "raise" in actions:
                return {"move": "raise", "raise_amount": random.choice([30, 70, 150])}
            elif "call" in actions:
                return {"move": "call", "raise_amount": 0}
        
        # Call with decent hands if pot odds are good
        elif win_prob > 0.45:
            if "call" in actions and to_call < pot * 0.4:
                return {"move": "call", "raise_amount": 0}
            elif "check" in actions:
                return {"move": "check", "raise_amount": 0}
            else:
                return {"move": "fold", "raise_amount": 0}
        
        # Fold or bluff with weak hands
        else:
            bluff_chance = {"easy": 0.05, "medium": 0.1, "hard": 0.2}[self.difficulty]
            if "raise" in actions and random.random() < bluff_chance:
                return {"move": "raise", "raise_amount": 30}
            elif "check" in actions:
                return {"move": "check", "raise_amount": 0}
            else:
                return {"move": "fold", "raise_amount": 0}