import { useState, useEffect } from 'react';
import { supabase, Vote } from './lib/supabase';
import { useGameRoom } from './hooks/useGameRoom';
import { Lobby } from './components/Lobby';
import { WaitingRoom } from './components/WaitingRoom';
import { CheckIn } from './components/CheckIn';
import { ResonanceSharing } from './components/ResonanceSharing';
import { PurposeVoting } from './components/PurposeVoting';
import { VotingResult } from './components/VotingResult';
import { GameBoard } from './components/GameBoard';
import { CardExchange } from './components/CardExchange';
import { FinalPhase } from './components/FinalPhase';
import { GameComplete } from './components/GameComplete';

function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [joinStartedAt, setJoinStartedAt] = useState<number | null>(null);

  const { room, players, resonanceShares, gifts, exchangeActions, loading } = useGameRoom(roomId);

  useEffect(() => {
    if (room) {
      console.info('🎯 [App] ルームステータスが変更されました:', room.status);
      console.info('📍 [App] 現在の画面遷移先を決定します');
      console.info('🔍 [App] ルームオブジェクト:', { id: room.id, status: room.status, updated_at: room.updated_at });
    }
  }, [room?.status, room?.id]);

  useEffect(() => {
    if (!roomId) return;

    fetchVotes();

    const votesChannel = supabase
      .channel(`votes:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, () => {
        fetchVotes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(votesChannel);
    };
  }, [roomId]);

  async function fetchVotes() {
    if (!roomId) return;

    const { data } = await supabase
      .from('votes')
      .select('*')
      .eq('room_id', roomId);

    setVotes(data || []);
  }

  function handleJoinRoom(newRoomId: string, newPlayerId: string) {
    setJoinStartedAt(Date.now());
    setRoomId(newRoomId);
    setPlayerId(newPlayerId);
  }


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center">
        <div className="text-xl text-gray-600">読み込み中...</div>
      </div>
    );
  }

  if (!roomId || !playerId) {
    return <Lobby onJoinRoom={handleJoinRoom} />;
  }

  if (!room) {
    const isWithinJoinGracePeriod =
      joinStartedAt !== null && Date.now() - joinStartedAt < 3000;

    if (isWithinJoinGracePeriod) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center">
          <div className="text-xl text-gray-700 text-center">
            <p>接続中です…🌱</p>
            <p className="mt-2 text-sm text-gray-500">
              いま、みんなのいるルームにつながっています。少しだけお待ちください。
            </p>
          </div>
        </div>
      );
    }

    console.error('❌ [App] ルームが見つかりません');
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center">
        <div className="text-xl text-gray-700 text-center">
          <p>ルームが見つかりませんでした</p>
          <p className="mt-2 text-sm text-gray-500">
            ルームコードや通信状況を、すこしだけ確認してみてください。
          </p>
        </div>
      </div>
    );
  }

  // Debug: Log current status before rendering decision
  console.info('🎨 [App] レンダリング判定:', {
    status: room.status,
    roomId: room.id,
    playerCount: players.length,
    timestamp: new Date().toISOString()
  });

  if (room.status === 'waiting') {
    console.info('✅ [App] WaitingRoom をレンダリングします');
    return <WaitingRoom roomId={roomId} players={players} currentPlayerId={playerId} />;
  }

  if (room.status === 'checkin') {
    console.info('✅ [App] CheckIn をレンダリングします');
    return <CheckIn roomId={roomId} playerId={playerId} players={players} />;
  }

  if (room.status === 'voting') {
    return (
      <PurposeVoting
        roomId={roomId}
        playerId={playerId}
        players={players}
        votes={votes}
        room={room}
      />
    );
  }

  if (room.status === 'voting_result') {
    return (
      <VotingResult
        roomId={roomId}
        purposeCard={room.purpose_card || ''}
        votes={votes}
      />
    );
  }

  if (room.status === 'resonance_initial') {
    return (
      <ResonanceSharing
        roomId={roomId}
        playerId={playerId}
        players={players}
        phase="initial"
        purposeCard={room.purpose_card || ''}
        resonanceShares={resonanceShares}
      />
    );
  }

  if (room.status === 'playing') {
    return <GameBoard room={room} players={players} currentPlayerId={playerId} />;
  }

  if (room.status === 'exchange') {
    return <CardExchange room={room} players={players} currentPlayerId={playerId} exchangeActions={exchangeActions} />;
  }

  if (room.status === 'resonance_final') {
    return (
      <FinalPhase
        roomId={roomId}
        currentPlayerId={playerId}
        players={players}
        purposeCard={room.purpose_card || ''}
        currentFinalTurn={room.final_phase_turn ?? 0}
        finalPhaseStep={room.final_phase_step || 'sharing'}
        deck={room.deck}
        discardPile={room.discard_pile}
      />
    );
  }

  if (room.status === 'gift_exchange') {
    return (
      <FinalPhase
        roomId={roomId}
        currentPlayerId={playerId}
        players={players}
        purposeCard={room.purpose_card || ''}
        currentFinalTurn={room.final_phase_turn ?? 0}
        finalPhaseStep={room.final_phase_step || 'sharing'}
        deck={room.deck}
        discardPile={room.discard_pile}
      />
    );
  }

  if (room.status === 'completed' || room.status === 'complete') {
    return <GameComplete players={players} gifts={gifts} purposeCard={room.purpose_card || ''} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center">
      <div className="text-xl text-gray-600">不明な状態です</div>
    </div>
  );
}

export default App;
