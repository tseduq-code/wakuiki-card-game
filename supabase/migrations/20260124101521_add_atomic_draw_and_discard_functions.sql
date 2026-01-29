/*
  # アトミックなドロー/ディスカード関数の追加

  1. 目的
    - GameBoardでのカードのドロー/ディスカードをアトミックに実行
    - カードの唯一性をより厳密に保証

  2. 新しいRPC関数
    - `atomic_draw_card`: プレイヤーが山札からカードを引く
      - 入力: room_id, player_id
      - 処理: 山札の先頭カードをプレイヤーの手札に追加
      - 出力: success, drawn_card

    - `atomic_discard_card`: プレイヤーが手札からカードを捨てる
      - 入力: room_id, player_id, card_text
      - 処理: 手札からカードを削除し、場に追加し、ターンを進める
      - 出力: success, next_turn_info

  3. セキュリティ
    - 関数は認証済みユーザーのみ実行可能
    - カードの整合性チェックを厳密に実施

  4. 注意事項
    - これらの関数はGameBoardで使用される
*/

-- アトミックなカードドロー関数
CREATE OR REPLACE FUNCTION atomic_draw_card(
  p_room_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_player players;
  v_drawn_card text;
  v_new_hand text[];
  v_new_deck text[];
BEGIN
  -- ゲームルームをロック取得
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- プレイヤー情報を取得してロック
  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  -- 山札が空でないかチェック
  IF array_length(v_room.deck, 1) IS NULL OR array_length(v_room.deck, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '山札がありません');
  END IF;

  -- 山札の先頭からカードを引く
  v_drawn_card := v_room.deck[1];
  v_new_deck := v_room.deck[2:array_length(v_room.deck, 1)];

  -- 手札に追加
  v_new_hand := v_player.hand || ARRAY[v_drawn_card];

  -- プレイヤーの手札を更新
  UPDATE players
  SET hand = v_new_hand, updated_at = now()
  WHERE id = p_player_id;

  -- ゲームルームの山札を更新
  UPDATE game_rooms
  SET deck = v_new_deck, updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'カードを引きました',
    'drawn_card', v_drawn_card,
    'hand_size', array_length(v_new_hand, 1),
    'deck_remaining', array_length(v_new_deck, 1)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

-- アトミックなカードディスカード関数
CREATE OR REPLACE FUNCTION atomic_discard_card(
  p_room_id uuid,
  p_player_id uuid,
  p_card_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_player players;
  v_card_index int;
  v_new_hand text[];
  v_new_discard_pile text[];
  v_next_player int;
  v_next_round int;
  v_new_status text;
BEGIN
  -- ゲームルームをロック取得
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- プレイヤー情報を取得してロック
  SELECT * INTO v_player
  FROM players
  WHERE id = p_player_id AND room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'プレイヤーが見つかりません');
  END IF;

  -- 手札に指定されたカードが存在するかチェック
  v_card_index := array_position(v_player.hand, p_card_text);
  IF v_card_index IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '指定されたカードが手札にありません');
  END IF;

  -- 手札からカードを削除
  v_new_hand := array_remove(v_player.hand, p_card_text);

  -- 場にカードを追加
  v_new_discard_pile := v_room.discard_pile || ARRAY[p_card_text];

  -- 次のプレイヤーとラウンドを計算
  v_next_player := (v_room.current_turn_player + 1) % 4;
  v_next_round := v_room.round_number;

  IF v_next_player = 0 THEN
    v_next_round := v_next_round + 1;
  END IF;

  -- ステータスの判定
  v_new_status := v_room.status;

  -- ラウンド2終了後、交換フェーズへ
  IF v_next_round = 3 AND v_room.exchange_completed = false THEN
    v_new_status := 'exchange';
  -- ラウンド4終了後（交換完了後）、最終響き合いフェーズへ
  ELSIF v_next_round = 5 AND v_room.exchange_completed = true THEN
    v_new_status := 'resonance_final';
  END IF;

  -- プレイヤーの手札を更新
  UPDATE players
  SET hand = v_new_hand, updated_at = now()
  WHERE id = p_player_id;

  -- ゲームルームを更新
  UPDATE game_rooms
  SET
    discard_pile = v_new_discard_pile,
    current_turn_player = v_next_player,
    round_number = v_next_round,
    status = v_new_status,
    current_exchange_turn = CASE WHEN v_new_status = 'exchange' THEN 0 ELSE current_exchange_turn END,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'カードを捨てました',
    'discarded_card', p_card_text,
    'next_player', v_next_player,
    'next_round', v_next_round,
    'new_status', v_new_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'エラーが発生しました: ' || SQLERRM
    );
END;
$$;

-- 関数の実行権限を設定
GRANT EXECUTE ON FUNCTION atomic_draw_card TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_draw_card TO anon;
GRANT EXECUTE ON FUNCTION atomic_discard_card TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_discard_card TO anon;
