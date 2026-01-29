import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      'X-Client-Info': 'wakuiki-card-game',
    },
  },
});

export type GameRoom = {
  id: string;
  status: 'waiting' | 'checkin' | 'voting' | 'voting_result' | 'resonance_initial' | 'playing' | 'exchange' | 'resonance_final' | 'gift_exchange' | 'completed' | 'complete';
  purpose_card: string | null;
  card_options: string[];
  voting_started_at?: string | null;
  current_turn_player: number;
  current_exchange_turn: number;
  current_final_turn: number;
  final_phase_turn?: number;
  final_phase_step?: 'sharing' | 'gifting' | 'reflection';
  round_number: number;
  exchange_completed: boolean;
  deck: string[];
  discard_pile: string[];
  created_at: string;
  updated_at: string;
};

// Card instance with unique ID for React key and duplicate detection
export type CardInstance = {
  name: string;
  instanceId: string;
};

export type Player = {
  id: string;
  room_id: string;
  player_number: number;
  name: string;
  player_name?: string;
  hand: string[];
  is_connected: boolean;
  role?: 'player' | 'spectator';
  preferred_name?: string;
  current_feeling?: string;
  has_checked_in?: boolean;
  ready_for_next_phase?: boolean;
  has_shared_final_resonance?: boolean;
  final_resonance_text?: string;
  final_resonance_percentage?: number;
  final_gifts_received?: any[];
  final_reflection_text?: string;
  has_given_final_gift?: boolean;
  created_at: string;
};

export type Vote = {
  id: string;
  room_id: string;
  player_id: string;
  card_index: number;
  card_text: string | null;
  created_at: string;
};

export type ResonanceShare = {
  id: string;
  room_id: string;
  player_id: string;
  phase: 'initial' | 'final';
  percentage: number;
  created_at: string;
};

export type Gift = {
  id: string;
  room_id: string;
  from_player_id: string;
  to_player_id: string;
  message: string;
  created_at: string;
};

export type ExchangeAction = {
  id: string;
  room_id: string;
  player_id: string;
  player_name: string;
  action_type: 'exchange' | 'skip';
  hand_card: string | null;
  board_card: string | null;
  turn_number: number;
  created_at: string;
};
