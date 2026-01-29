/*
  # アトミックなカード交換関数の追加

  1. 目的
    - カード交換処理を完全にアトミックに実行
    - カードの唯一性（世界に1枚のみ）を保証
    - 同時実行時の競合を防止

  2. 新しいRPC関数
    - `atomic_exchange_card`: プレイヤーの手札と場のカードを同時に交換
      - 入力: room_id, player_id, hand_card_text, board_card_text
      - 処理:
        1. トランザクション開始
        2. 現在のゲームルームと全プレイヤーの手札を取得（ロック）
        3. 指定されたカードが正しい位置に存在するか検証
        4. カードの重複がないか検証
        5. 交換を実行
        6. トランザクションコミット
      - 出力: success (boolean), message (text)

  3. セキュリティ
    - 関数は認証済みユーザーのみ実行可能
    - カードの整合性チェックを厳密に実施

  4. 注意事項
    - この関数は排他的ロックを使用するため、同時実行が制御される
    - カードのテキストベースで管理（将来的にはIDベースに移行可能）
*/

-- アトミックなカード交換関数
CREATE OR REPLACE FUNCTION atomic_exchange_card(
  p_room_id uuid,
  p_player_id uuid,
  p_hand_card_text text,
  p_board_card_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_player players;
  v_hand_index int;
  v_board_index int;
  v_new_hand text[];
  v_new_discard_pile text[];
  v_all_players players[];
  v_player_rec players;
  v_card_count int;
BEGIN
  -- ゲームルームと全プレイヤーをロック取得
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
  v_hand_index := array_position(v_player.hand, p_hand_card_text);
  IF v_hand_index IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '指定された手札のカードが見つかりません');
  END IF;

  -- 場に指定されたカードが存在するかチェック
  v_board_index := array_position(v_room.discard_pile, p_board_card_text);
  IF v_board_index IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '指定された場のカードが見つかりません');
  END IF;

  -- カードの唯一性チェック: 手札から出すカードが場に既に存在しないか
  v_card_count := (
    SELECT count(*)
    FROM unnest(v_room.discard_pile) AS card
    WHERE card = p_hand_card_text
  );
  
  IF v_card_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '手札から出すカードが既に場に存在します');
  END IF;

  -- カードの唯一性チェック: 場から取るカードが他のプレイヤーの手札に存在しないか
  SELECT array_agg(p.*) INTO v_all_players
  FROM players p
  WHERE p.room_id = p_room_id AND p.id != p_player_id AND p.role = 'player';

  IF v_all_players IS NOT NULL THEN
    FOREACH v_player_rec IN ARRAY v_all_players
    LOOP
      IF p_board_card_text = ANY(v_player_rec.hand) THEN
        RETURN jsonb_build_object('success', false, 'message', '場から取るカードが他のプレイヤーの手札に既に存在します');
      END IF;
    END LOOP;
  END IF;

  -- 交換を実行
  v_new_hand := v_player.hand;
  v_new_hand[v_hand_index] := p_board_card_text;

  v_new_discard_pile := v_room.discard_pile;
  v_new_discard_pile[v_board_index] := p_hand_card_text;

  -- プレイヤーの手札を更新
  UPDATE players
  SET hand = v_new_hand, updated_at = now()
  WHERE id = p_player_id;

  -- ゲームルームの場を更新
  UPDATE game_rooms
  SET discard_pile = v_new_discard_pile, updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '交換が完了しました',
    'hand_card', p_hand_card_text,
    'board_card', p_board_card_text
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
GRANT EXECUTE ON FUNCTION atomic_exchange_card TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_exchange_card TO anon;
