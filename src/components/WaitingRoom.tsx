import { Copy, Check } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Player } from '../lib/supabase';
import { supabase } from '../lib/supabase';

interface WaitingRoomProps {
  roomId: string;
  players: Player[];
  currentPlayerId: string;
}

export function WaitingRoom({ roomId, players, currentPlayerId }: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [localPlayers, setLocalPlayers] = useState<Player[]>(players);
  const initializationAttempted = useRef(false);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const startingTimeRef = useRef<number | null>(null);
  const forceCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const isTransitioning = useRef(false);
  const lastCheckedStatus = useRef<string | null>(null);

  useEffect(() => {
    setLocalPlayers(players);
  }, [players]);

  // Reset transition flag when component mounts or when starting state changes
  useEffect(() => {
    if (!starting) {
      isTransitioning.current = false;
      lastCheckedStatus.current = null;
    }
  }, [starting]);

  // Main initialization trigger when 4 players are present
  useEffect(() => {
    const activePlayers = localPlayers.filter(p => p.role !== 'spectator');
    if (activePlayers.length === 4 && !starting && !initializationAttempted.current) {
      console.info('🎮 [WaitingRoom] 4人のプレイヤーが揃いました！ゲーム開始処理を開始します');
      console.info('👥 [WaitingRoom] 参加プレイヤー:', activePlayers.map(p => `${p.name}(#${p.player_number})`).join(', '));
      initializationAttempted.current = true;
      handleGameStart();
    }
  }, [localPlayers.length, starting]);

  // Force check after 5 seconds if still starting
  useEffect(() => {
    if (starting && !startingTimeRef.current && !isTransitioning.current) {
      startingTimeRef.current = Date.now();
      console.info('⏱️ [WaitingRoom] 5秒タイムアウトタイマーを開始しました');

      forceCheckTimeout.current = setTimeout(async () => {
        // Guard: don't execute if already transitioning
        if (isTransitioning.current) {
          console.info('⏭️ [WaitingRoom] 既に遷移処理中のため、強制チェックをスキップします');
          return;
        }

        const elapsed = Date.now() - (startingTimeRef.current || 0);
        console.warn(`⚠️ [WaitingRoom] ${elapsed}ms経過 - 強制的にフェーズを確認します`);

        try {
          const { data: room } = await supabase
            .from('game_rooms')
            .select('status')
            .eq('id', roomId)
            .single();

          if (room) {
            console.info('🔍 [WaitingRoom] 強制チェック結果 - ステータス:', room.status);
            if (room.status !== 'waiting') {
              // Mark as transitioning to prevent duplicate calls
              if (!isTransitioning.current) {
                isTransitioning.current = true;
                lastCheckedStatus.current = room.status;
                console.info('✅ [WaitingRoom] フェーズが変わっています！親コンポーネントが遷移を処理します');
                // Stop polling
                if (pollingInterval.current) {
                  clearInterval(pollingInterval.current);
                  pollingInterval.current = null;
                }
              }
            } else {
              console.error('❌ [WaitingRoom] 5秒経過してもまだ waiting ステータスです。初期化に失敗した可能性があります');
            }
          }
        } catch (err) {
          console.error('❌ [WaitingRoom] 強制チェックでエラー:', err);
        }
      }, 5000);
    }

    return () => {
      if (forceCheckTimeout.current) {
        clearTimeout(forceCheckTimeout.current);
        forceCheckTimeout.current = null;
      }
      if (!starting) {
        startingTimeRef.current = null;
      }
    };
  }, [starting, roomId]);

  // Aggressive polling for room status when starting
  useEffect(() => {
    if (!starting || isTransitioning.current) return;

    console.info('🔄 [WaitingRoom] アグレッシブポーリングを開始します（1秒ごと）');

    // Immediate check
    checkRoomStatusAndTransition();

    // Poll every 1 second
    pollingInterval.current = setInterval(() => {
      // Stop polling if already transitioning
      if (isTransitioning.current) {
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        return;
      }
      checkRoomStatusAndTransition();
    }, 1000);

    return () => {
      if (pollingInterval.current) {
        console.info('🛑 [WaitingRoom] アグレッシブポーリングを停止しました');
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, [starting, roomId]);

  // Real-time subscription for players
  useEffect(() => {
    const channel = supabase
      .channel(`waiting_room:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'players',
        filter: `room_id=eq.${roomId}`
      }, () => {
        fetchPlayers();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'players',
        filter: `room_id=eq.${roomId}`
      }, () => {
        fetchPlayers();
      })
      .subscribe();

    const pollInterval = setInterval(fetchPlayers, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [roomId]);

  async function fetchPlayers() {
    try {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('player_number');

      if (data) {
        setLocalPlayers(data);
      }
    } catch (err) {
      console.error('Failed to fetch players:', err);
    }
  }

  async function checkRoomStatusAndTransition() {
    // Guard: don't check if already transitioning
    if (isTransitioning.current) {
      return;
    }

    try {
      const { data: room } = await supabase
        .from('game_rooms')
        .select('status')
        .eq('id', roomId)
        .single();

      if (!room) {
        return;
      }

      // If status hasn't changed, skip
      if (lastCheckedStatus.current === room.status) {
        return;
      }

      if (room.status !== 'waiting') {
        // Mark as transitioning to prevent duplicate calls
        if (!isTransitioning.current) {
          isTransitioning.current = true;
          lastCheckedStatus.current = room.status;
          
          console.info('📡 [WaitingRoom] ポーリング検知: ルームステータスが', room.status, 'に変わりました');
          console.info('🔀 [WaitingRoom] 親コンポーネント（App.tsx）が画面遷移を処理します');
          
          // Stop polling immediately
          if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
            console.info('🛑 [WaitingRoom] 遷移検知によりポーリングを停止しました');
          }
          
          // Parent component will detect this via useGameRoom hook and transition
          // No need to do anything here, just log for debugging
        }
      } else {
        // Update last checked status even if still waiting
        lastCheckedStatus.current = room.status;
      }
    } catch (err) {
      console.error('❌ [WaitingRoom] ルームステータスチェックエラー:', err);
    }
  }

  async function handleGameStart() {
    console.info('🚀 [WaitingRoom] handleGameStart() が呼び出されました');
    setStarting(true);

    // First, check if game already started
    try {
      const { data: currentRoom } = await supabase
        .from('game_rooms')
        .select('status')
        .eq('id', roomId)
        .single();

      console.info('🔍 [WaitingRoom] 現在のルームステータス:', currentRoom?.status);

      if (currentRoom && currentRoom.status !== 'waiting') {
        console.info('ℹ️ [WaitingRoom] ゲームは既に開始されています。初期化をスキップします');
        return;
      }
    } catch (err) {
      console.error('❌ [WaitingRoom] 初期ルームステータスチェックエラー:', err);
      setStarting(false);
      return;
    }

    // Determine if this player is the leader (player_number = 0)
    const currentPlayer = localPlayers.find(p => p.id === currentPlayerId);
    const isLeader = currentPlayer?.player_number === 0;

    console.info('👤 [WaitingRoom] 現在のプレイヤー:', currentPlayer?.name);
    console.info('🔢 [WaitingRoom] プレイヤー番号:', currentPlayer?.player_number);
    console.info('👑 [WaitingRoom] リーダーですか?', isLeader ? 'YES' : 'NO');

    if (isLeader) {
      // Leader executes initialization
      console.info('👑 [WaitingRoom] このプレイヤーはリーダーです - 初期化を実行します');
      await executeGameInitialization();
    } else {
      // Non-leaders just wait and poll
      console.info('👥 [WaitingRoom] このプレイヤーは非リーダーです - リーダーの初期化を待機します');
      // Polling is handled by the useEffect above
    }
  }

  async function executeGameInitialization() {
    try {
      console.info('👑🎯 [Leader] ゲーム初期化処理を開始します');

      // Get current room data
      const { data: room } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (!room) {
        console.error('❌ [Leader] ルームが見つかりません');
        setStarting(false);
        return;
      }

      console.info('✅ [Leader] ルーム情報を取得しました');

      // Double-check status
      if (room.status !== 'waiting') {
        console.info('ℹ️ [Leader] 他のプレイヤーが既にゲームを開始しています');
        return;
      }

      // Update room status to checkin
      console.info('🔄 [Leader] ルームステータスを checkin に更新します...');
      const { error: updateError, data: updatedRoom } = await supabase
        .from('game_rooms')
        .update({
          status: 'checkin'
        })
        .eq('id', roomId)
        .eq('status', 'waiting')
        .select();

      if (updateError) {
        console.error('❌ [Leader] ルームステータス更新エラー:', updateError);

        // Check if someone else succeeded
        const { data: checkRoom } = await supabase
          .from('game_rooms')
          .select('status')
          .eq('id', roomId)
          .single();

        if (checkRoom?.status === 'checkin') {
          console.info('ℹ️ [Leader] 他のプレイヤーが既にステータスを更新しました');
          return;
        }

        throw updateError;
      }

      if (!updatedRoom || updatedRoom.length === 0) {
        // Update didn't affect any rows - someone else already changed the status
        console.warn('⚠️ [Leader] 更新対象が0行 - 他のプレイヤーの方が早かったようです');

        const { data: checkRoom } = await supabase
          .from('game_rooms')
          .select('status')
          .eq('id', roomId)
          .single();

        if (checkRoom?.status === 'checkin') {
          console.info('✅ [Leader] 他のプレイヤーによってゲームが正常に開始されました');
          return;
        }
      } else {
        console.info('🎉 [Leader] チェックインフェーズの初期化が正常に完了しました！');
        console.info('📡 [Leader] リアルタイム通知が全クライアントに送信されます');
      }
    } catch (err) {
      console.error('❌ [Leader] ゲーム初期化エラー:', err);

      // Final check if another player succeeded
      try {
        const { data: room } = await supabase
          .from('game_rooms')
          .select('status')
          .eq('id', roomId)
          .single();

        if (room?.status === 'checkin') {
          console.info('✅ [Leader] エラー後の確認: 他のプレイヤーが初期化に成功しています');
          return;
        }
      } catch (checkErr) {
        console.error('❌ [Leader] 最終確認チェックエラー:', checkErr);
      }

      setStarting(false);
      initializationAttempted.current = false;
    }
  }

  function copyRoomCode() {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">
            {starting ? 'ゲームを開始しています...' : 'プレイヤーを待っています'}
          </h2>

          {!starting && (
            <>
              <div className="mb-8">
            <p className="text-sm text-gray-600 mb-2 text-center">ルームコード</p>
            <div className="flex items-center gap-3 justify-center">
              <code className="bg-gray-100 px-6 py-3 rounded-lg text-xl font-mono font-bold text-gray-800">
                {roomId}
              </code>
              <button
                onClick={copyRoomCode}
                className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-800">参加プレイヤー</h3>
              <span className="text-sm text-gray-600">{localPlayers.filter(p => p.role !== 'spectator').length}/4</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((index) => {
                const player = localPlayers.find(p => p.player_number === index && p.role !== 'spectator');
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-2 ${
                      player
                        ? 'bg-green-50 border-green-300'
                        : 'bg-gray-50 border-gray-300 border-dashed'
                    }`}
                  >
                    {player ? (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <span className="font-medium text-gray-800">{player.name}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">待機中...</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {localPlayers.filter(p => p.role === 'spectator').length > 0 && (
            <div className="mb-6">
              <h3 className="font-bold text-lg text-gray-800 mb-4">観戦者</h3>
              <div className="grid grid-cols-2 gap-4">
                {localPlayers.filter(p => p.role === 'spectator').map((spectator) => (
                  <div
                    key={spectator.id}
                    className="p-4 rounded-lg border-2 bg-blue-50 border-blue-300"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="font-medium text-gray-800">{spectator.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-700 text-center">
                  4人揃うと自動的にゲームが始まります
                </p>
              </div>
            </>
          )}

          {starting && (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
