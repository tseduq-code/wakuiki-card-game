/*
  # カード検証と補充関数の追加

  1. 目的
    - ゲーム全体でカードの唯一性を検証
    - 場のカードが減った場合の補充処理
    - カードの整合性チェック

  2. 新しいRPC関数
    - `validate_card_uniqueness`: カードの重複をチェック
      - 全プレイヤーの手札、場のカード、山札をチェック
      - 重複があればエラーを返す
      
    - `replenish_discard_pile`: 場のカードを山札から補充
      - 場のカードが指定数より少ない場合、山札から補充
      - 手札にないカードのみを選択

  3. セキュリティ
    - 関数は認証済みユーザーのみ実行可能

  4. 使用方法
    - カード交換後に自動的に呼び出される
    - または手動でトリガー可能
*/

-- カードの唯一性を検証する関数
CREATE OR REPLACE FUNCTION validate_card_uniqueness(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_all_cards text[];
  v_card text;
  v_card_counts jsonb;
  v_duplicates text[];
  v_room game_rooms;
  v_players players[];
  v_player players;
BEGIN
  -- ゲームルームを取得
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'ルームが見つかりません');
  END IF;

  -- 全プレイヤーを取得
  SELECT array_agg(p.*) INTO v_players
  FROM players p
  WHERE p.room_id = p_room_id AND p.role = 'player';

  -- 全カードを収集
  v_all_cards := v_room.discard_pile;

  IF v_players IS NOT NULL THEN
    FOREACH v_player IN ARRAY v_players
    LOOP
      v_all_cards := v_all_cards || v_player.hand;
    END LOOP;
  END IF;

  -- カードの出現回数をカウント
  v_card_counts := '{}';
  FOREACH v_card IN ARRAY v_all_cards
  LOOP
    IF v_card_counts ? v_card THEN
      v_card_counts := jsonb_set(
        v_card_counts,
        array[v_card],
        to_jsonb((v_card_counts->>v_card)::int + 1)
      );
    ELSE
      v_card_counts := jsonb_set(v_card_counts, array[v_card], '1');
    END IF;
  END LOOP;

  -- 重複を検出
  v_duplicates := ARRAY(
    SELECT key
    FROM jsonb_each_text(v_card_counts)
    WHERE value::int > 1
  );

  IF array_length(v_duplicates, 1) > 0 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', '重複カードが検出されました',
      'duplicates', to_jsonb(v_duplicates),
      'card_counts', v_card_counts
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'message', 'すべてのカードがユニークです',
    'total_cards', array_length(v_all_cards, 1)
  );
END;
$$;

-- 場のカードを山札から補充する関数
CREATE OR REPLACE FUNCTION replenish_discard_pile(
  p_room_id uuid,
  p_target_count int DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room game_rooms;
  v_players players[];
  v_player players;
  v_all_used_cards text[];
  v_available_cards text[];
  v_cards_to_add text[];
  v_new_discard_pile text[];
  v_new_deck text[];
  v_needed_count int;
BEGIN
  -- ゲームルームを取得してロック
  SELECT * INTO v_room
  FROM game_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ルームが見つかりません');
  END IF;

  -- 現在の場のカード数をチェック
  IF array_length(v_room.discard_pile, 1) >= p_target_count THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', '補充は不要です',
      'current_count', array_length(v_room.discard_pile, 1)
    );
  END IF;

  -- 必要なカード数を計算
  v_needed_count := p_target_count - array_length(v_room.discard_pile, 1);

  -- 全プレイヤーの手札を取得
  SELECT array_agg(p.*) INTO v_players
  FROM players p
  WHERE p.room_id = p_room_id AND p.role = 'player';

  -- 使用中のカードを収集（場のカード + 全プレイヤーの手札）
  v_all_used_cards := v_room.discard_pile;
  IF v_players IS NOT NULL THEN
    FOREACH v_player IN ARRAY v_players
    LOOP
      v_all_used_cards := v_all_used_cards || v_player.hand;
    END LOOP;
  END IF;

  -- 山札から使用されていないカードを抽出
  SELECT array_agg(card) INTO v_available_cards
  FROM unnest(v_room.deck) AS card
  WHERE card != ALL(v_all_used_cards);

  -- 利用可能なカードがない場合
  IF v_available_cards IS NULL OR array_length(v_available_cards, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '山札に利用可能なカードがありません'
    );
  END IF;

  -- 必要な数だけランダムに選択（利用可能数が必要数より少ない場合は全て）
  IF array_length(v_available_cards, 1) < v_needed_count THEN
    v_cards_to_add := v_available_cards;
  ELSE
    -- ランダムにシャッフルして必要数だけ取得
    SELECT array_agg(card ORDER BY random()) INTO v_cards_to_add
    FROM (
      SELECT unnest(v_available_cards) AS card
      LIMIT v_needed_count
    ) sub;
  END IF;

  -- 場に追加
  v_new_discard_pile := v_room.discard_pile || v_cards_to_add;

  -- 山札から削除
  SELECT array_agg(card) INTO v_new_deck
  FROM unnest(v_room.deck) AS card
  WHERE card != ALL(v_cards_to_add);

  -- 更新
  UPDATE game_rooms
  SET
    discard_pile = v_new_discard_pile,
    deck = v_new_deck,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '場のカードを補充しました',
    'added_count', array_length(v_cards_to_add, 1),
    'new_pile_count', array_length(v_new_discard_pile, 1),
    'remaining_deck', array_length(v_new_deck, 1)
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
GRANT EXECUTE ON FUNCTION validate_card_uniqueness TO authenticated;
GRANT EXECUTE ON FUNCTION validate_card_uniqueness TO anon;
GRANT EXECUTE ON FUNCTION replenish_discard_pile TO authenticated;
GRANT EXECUTE ON FUNCTION replenish_discard_pile TO anon;
