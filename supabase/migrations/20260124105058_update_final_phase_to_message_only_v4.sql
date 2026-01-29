/*
  # 最終フェーズをメッセージのみに変更

  1. 変更内容
    - ギフトはカードではなく、自由入力のテキストメッセージのみに変更
    - 手札からカードを削除する処理を削除
    - 響き合いのパーセンテージを保存するカラムを追加

  2. 追加するカラム
    - `players.final_resonance_percentage` - 響き合いのマッチ度（%）

  3. 修正する関数
    - share_final_resonance: パーセンテージを保存
    - give_final_gift: カードを削除せず、メッセージのみを保存
*/

-- playersテーブルに響き合いのパーセンテージを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'final_resonance_percentage'
  ) THEN
    ALTER TABLE players 
    ADD COLUMN final_resonance_percentage integer DEFAULT 50;
  END IF;
END $$;

-- 既存のgive_final_gift関数を明示的に削除（古いシグネチャ）
DROP FUNCTION IF EXISTS give_final_gift(uuid, uuid, uuid, text);

-- 響き合いを共有する関数（パーセンテージを追加）
CREATE OR REPLACE FUNCTION share_final_resonance(
  p_room_id uuid,
  p_player_id uuid,
  p_resonance_text text,
  p_percentage integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_player players;
BEGIN
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  IF v_room.final_phase_step != 'sharing' THEN
    RETURN jsonb_build_object('success', false, 'message', '現在は響き合いの共有フェーズではありません');
  END IF;

  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  IF v_player.player_number != v_room.final_phase_turn THEN
    RETURN jsonb_build_object('success', false, 'message', 'あなたのターンではありません');
  END IF;

  IF v_player.has_shared_final_resonance THEN
    RETURN jsonb_build_object('success', false, 'message', '既に響き合いを共有しています');
  END IF;

  UPDATE players
  SET 
    final_resonance_text = p_resonance_text,
    final_resonance_percentage = p_percentage,
    has_shared_final_resonance = true
  WHERE id = p_player_id;

  UPDATE game_rooms
  SET final_phase_step = 'gifting', updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '響き合いを共有しました'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

-- メッセージギフトを贈る関数（カード削除処理を削除）
CREATE FUNCTION give_final_message_gift(
  p_room_id uuid,
  p_from_player_id uuid,
  p_to_player_id uuid,
  p_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_from_player players;
  v_to_player players;
  v_new_gifts jsonb;
  v_gift_count int;
  v_all_gifted boolean;
BEGIN
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  IF v_room.final_phase_step != 'gifting' THEN
    RETURN jsonb_build_object('success', false, 'message', '現在はギフトフェーズではありません');
  END IF;

  SELECT * INTO v_from_player
  FROM players
  WHERE id = p_from_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  SELECT * INTO v_to_player
  FROM players
  WHERE id = p_to_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '贈り先のプレイヤーが見つかりません');
  END IF;

  IF v_to_player.player_number != v_room.final_phase_turn THEN
    RETURN jsonb_build_object('success', false, 'message', '現在のターンプレイヤーにのみギフトを贈れます');
  END IF;

  IF p_from_player_id = p_to_player_id THEN
    RETURN jsonb_build_object('success', false, 'message', '自分自身にギフトを贈ることはできません');
  END IF;

  IF v_from_player.has_given_final_gift THEN
    RETURN jsonb_build_object('success', false, 'message', '既にギフトを贈っています');
  END IF;

  IF p_message IS NULL OR trim(p_message) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'メッセージを入力してください');
  END IF;

  v_new_gifts := COALESCE(v_to_player.final_gifts_received, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'from_player_id', p_from_player_id,
      'from_player_name', COALESCE(v_from_player.preferred_name, v_from_player.name),
      'message', p_message
    )
  );

  UPDATE players
  SET has_given_final_gift = true
  WHERE id = p_from_player_id;

  UPDATE players
  SET final_gifts_received = v_new_gifts
  WHERE id = p_to_player_id;

  SELECT COUNT(*) INTO v_gift_count
  FROM players
  WHERE room_id = p_room_id 
    AND role = 'player'
    AND player_number != v_room.final_phase_turn
    AND has_given_final_gift = true;

  v_all_gifted := (v_gift_count >= 3);

  IF v_all_gifted THEN
    UPDATE game_rooms
    SET final_phase_step = 'reflection', updated_at = now()
    WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ギフトを贈りました',
    'all_gifted', v_all_gifted
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION share_final_resonance TO authenticated;
GRANT EXECUTE ON FUNCTION share_final_resonance TO anon;
GRANT EXECUTE ON FUNCTION give_final_message_gift TO authenticated;
GRANT EXECUTE ON FUNCTION give_final_message_gift TO anon;
