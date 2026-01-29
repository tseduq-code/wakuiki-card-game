/*
  # わくいきカードゲーム データベーススキーマ

  ## 概要
  4人用協力型カードゲームのリアルタイムマルチプレイヤー機能を実現するためのデータベース設計

  ## 新規テーブル
  
  ### 1. game_rooms
  ゲームルームの管理
  - `id` (uuid, primary key) - ルームID
  - `status` (text) - ゲーム状態 (waiting, voting, playing, exchange, resonance_final, gift_exchange, completed)
  - `purpose_card` (text) - 選ばれた目的カード
  - `current_turn_player` (integer) - 現在のターンのプレイヤー番号 (0-3)
  - `round_number` (integer) - 現在のラウンド数
  - `deck` (jsonb) - 山札の状態
  - `discard_pile` (jsonb) - 場のカード（捨て札）
  - `created_at` (timestamptz) - 作成日時
  - `updated_at` (timestamptz) - 更新日時

  ### 2. players
  プレイヤー情報
  - `id` (uuid, primary key) - プレイヤーID
  - `room_id` (uuid, foreign key) - ルームID
  - `player_number` (integer) - プレイヤー番号 (0-3)
  - `name` (text) - プレイヤー名
  - `hand` (jsonb) - 手札（3枚のカード）
  - `is_connected` (boolean) - 接続状態
  - `created_at` (timestamptz) - 作成日時

  ### 3. votes
  目的カード投票
  - `id` (uuid, primary key) - 投票ID
  - `room_id` (uuid, foreign key) - ルームID
  - `player_id` (uuid, foreign key) - プレイヤーID
  - `card_index` (integer) - 投票したカードのインデックス
  - `created_at` (timestamptz) - 作成日時

  ### 4. resonance_shares
  響き合いの共有
  - `id` (uuid, primary key) - 共有ID
  - `room_id` (uuid, foreign key) - ルームID
  - `player_id` (uuid, foreign key) - プレイヤーID
  - `phase` (text) - フェーズ (initial, final)
  - `percentage` (integer) - 響き合いのパーセンテージ
  - `created_at` (timestamptz) - 作成日時

  ### 5. gifts
  ギフト交換
  - `id` (uuid, primary key) - ギフトID
  - `room_id` (uuid, foreign key) - ルームID
  - `from_player_id` (uuid, foreign key) - 送信者ID
  - `to_player_id` (uuid, foreign key) - 受信者ID
  - `message` (text) - ギフトメッセージ
  - `created_at` (timestamptz) - 作成日時

  ## セキュリティ
  - すべてのテーブルでRLSを有効化
  - 認証なしでもプレイ可能（匿名アクセス許可）
  - 各テーブルに適切なポリシーを設定
*/

-- game_rooms テーブル
CREATE TABLE IF NOT EXISTS game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'waiting',
  purpose_card text,
  current_turn_player integer DEFAULT 0,
  round_number integer DEFAULT 0,
  deck jsonb DEFAULT '[]'::jsonb,
  discard_pile jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read game rooms"
  ON game_rooms FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create game rooms"
  ON game_rooms FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update game rooms"
  ON game_rooms FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- players テーブル
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_number integer NOT NULL,
  name text NOT NULL,
  hand jsonb DEFAULT '[]'::jsonb,
  is_connected boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(room_id, player_number)
);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read players"
  ON players FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create players"
  ON players FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update players"
  ON players FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- votes テーブル
CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  card_index integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(room_id, player_id)
);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read votes"
  ON votes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create votes"
  ON votes FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- resonance_shares テーブル
CREATE TABLE IF NOT EXISTS resonance_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  phase text NOT NULL,
  percentage integer NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  created_at timestamptz DEFAULT now(),
  UNIQUE(room_id, player_id, phase)
);

ALTER TABLE resonance_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read resonance shares"
  ON resonance_shares FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create resonance shares"
  ON resonance_shares FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update resonance shares"
  ON resonance_shares FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- gifts テーブル
CREATE TABLE IF NOT EXISTS gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  from_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read gifts"
  ON gifts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create gifts"
  ON gifts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_votes_room_id ON votes(room_id);
CREATE INDEX IF NOT EXISTS idx_resonance_shares_room_id ON resonance_shares(room_id);
CREATE INDEX IF NOT EXISTS idx_gifts_room_id ON gifts(room_id);