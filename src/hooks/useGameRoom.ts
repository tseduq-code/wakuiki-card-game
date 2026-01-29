import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase, GameRoom, Player, ResonanceShare, Gift, ExchangeAction } from '../lib/supabase';
import { deduplicateHandStrings } from '../lib/gameUtils';

export function useGameRoom(roomId: string | null) {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [resonanceShares, setResonanceShares] = useState<ResonanceShare[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [exchangeActions, setExchangeActions] = useState<ExchangeAction[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<any>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSubscribedRef = useRef(false);

  const fetchGameData = useCallback(async () => {
    if (!roomId) return;

    const { data: roomData } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();

    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('player_number');

    setRoom((prevRoom) => {
      if (roomData) {
        const statusChanged = prevRoom && prevRoom.status !== roomData.status;
        const idChanged = prevRoom && prevRoom.id !== roomData.id;
        const updatedAtChanged = prevRoom && prevRoom.updated_at !== roomData.updated_at;
        const exchangeTurnChanged = prevRoom && prevRoom.current_exchange_turn !== roomData.current_exchange_turn;
        
        if (statusChanged) {
          console.info('🔀 [useGameRoom] ステータス変更を検知:', prevRoom.status, '→', roomData.status);
          console.info('📊 [useGameRoom] 変更詳細:', {
            prevStatus: prevRoom.status,
            newStatus: roomData.status,
            prevUpdatedAt: prevRoom.updated_at,
            newUpdatedAt: roomData.updated_at
          });
        }
        
        // Always return a new object when any relevant field changes (status, turn, updated_at)
        if (statusChanged || idChanged || updatedAtChanged || exchangeTurnChanged || !prevRoom) {
          return { ...roomData };
        }
        
        return prevRoom;
      }
      return prevRoom;
    });

    setPlayers(
      (playersData || []).map((p) => ({
        ...p,
        hand: deduplicateHandStrings(p.hand ?? []),
      }))
    );
    setLoading(false);
  }, [roomId]);

  const fetchResonanceShares = useCallback(async () => {
    if (!roomId) return;

    const { data, error } = await supabase
      .from('resonance_shares')
      .select('*')
      .eq('room_id', roomId);

    if (error) {
      console.error('❌ [useGameRoom] fetchResonanceSharesエラー:', error);
      return;
    }

    setResonanceShares(data || []);
  }, [roomId]);

  const fetchGifts = useCallback(async () => {
    if (!roomId) return;

    const { data } = await supabase
      .from('gifts')
      .select('*')
      .eq('room_id', roomId);

    setGifts(data || []);
  }, [roomId]);

  const fetchExchangeActions = useCallback(async () => {
    if (!roomId) return;

    const { data } = await supabase
      .from('exchange_actions')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    setExchangeActions(data || []);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    // 既存のチャンネルとポーリングをクリーンアップ
    if (channelRef.current) {
      console.info('🛑 [useGameRoom] 既存のチャンネルをクリーンアップします');
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      isSubscribedRef.current = false;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    console.info('🔌 [useGameRoom] リアルタイム購読を開始します - Room ID:', roomId);

    // 初回データ取得
    fetchGameData();
    fetchResonanceShares();
    fetchGifts();
    fetchExchangeActions();

    // 新しいチャンネルを作成
    const roomChannel = supabase
      .channel(`room:${roomId}`, {
        config: {
          broadcast: { self: true },
          presence: { key: '' },
        },
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, (payload) => {
        console.info('📡 [useGameRoom] game_rooms テーブル変更検知:', payload.eventType);
        fetchGameData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, (payload) => {
        console.info('📡 [useGameRoom] players テーブル変更検知:', payload.eventType);
        fetchGameData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resonance_shares', filter: `room_id=eq.${roomId}` }, () => {
        fetchResonanceShares();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gifts', filter: `room_id=eq.${roomId}` }, () => {
        fetchGifts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_actions', filter: `room_id=eq.${roomId}` }, () => {
        fetchExchangeActions();
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.info('✅ [useGameRoom] リアルタイム購読が成功しました');
          isSubscribedRef.current = true;
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [useGameRoom] チャンネルエラー:', err);
          isSubscribedRef.current = false;
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ [useGameRoom] 購読タイムアウト');
          isSubscribedRef.current = false;
        } else if (status === 'CLOSED') {
          console.warn('🔌 [useGameRoom] チャンネルがクローズされました');
          isSubscribedRef.current = false;
        }
      });

    channelRef.current = roomChannel;

    // フォールバックポーリング（Realtimeが動作していない場合のみ）
    pollIntervalRef.current = setInterval(() => {
      if (!isSubscribedRef.current) {
        console.info('🔄 [useGameRoom] Realtime未接続のため、フォールバックポーリングを実行します');
        fetchGameData();
      }
    }, 10000);

    return () => {
      console.info('🛑 [useGameRoom] リアルタイム購読とポーリングを停止します');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        isSubscribedRef.current = false;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [roomId, fetchGameData, fetchResonanceShares, fetchGifts, fetchExchangeActions]);

  return { room, players, resonanceShares, gifts, exchangeActions, loading, refetch: fetchGameData };
}
