import { useState } from 'react';
import { Users, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { shuffleDeck } from '../lib/gameUtils';

interface LobbyProps {
  onJoinRoom: (roomId: string, playerId: string) => void;
}

export function Lobby({ onJoinRoom }: LobbyProps) {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);

  async function createRoom() {
    if (!playerName.trim()) {
      setError('プレイヤー名を入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const deck = shuffleDeck();

      const { data: room, error: roomError } = await supabase
        .from('game_rooms')
        .insert({
          status: 'waiting',
          deck,
          discard_pile: []
        })
        .select()
        .single();

      if (roomError) throw roomError;

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          player_number: 0,
          name: playerName.trim(),
          hand: []
        })
        .select()
        .single();

      if (playerError) throw playerError;

      onJoinRoom(room.id, player.id);
    } catch (err) {
      console.error(err);
      setError('ルームの作成に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    if (!playerName.trim()) {
      setError('プレイヤー名を入力してください');
      return;
    }

    if (!roomCode.trim()) {
      setError('ルームコードを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: room, error: roomError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('id', roomCode.trim())
        .maybeSingle();

      if (roomError || !room) {
        setError('ルームが見つかりません');
        setLoading(false);
        return;
      }

      const { data: existingPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .eq('role', 'player')
        .order('player_number');

      const isSpectator = joinAsSpectator || (existingPlayers && existingPlayers.length >= 4);

      if (!isSpectator && room.status !== 'waiting') {
        setError('このルームは既にゲーム中です');
        setLoading(false);
        return;
      }

      if (!isSpectator && existingPlayers && existingPlayers.length >= 4) {
        setError('ルームが満員です。観戦者として参加できます。');
        setLoading(false);
        return;
      }

      const playerNumber = isSpectator ? 999 : (existingPlayers?.length || 0);

      console.log('Joining as', isSpectator ? 'spectator' : 'player', 'number:', playerNumber);

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          player_number: playerNumber,
          name: playerName.trim(),
          hand: [],
          role: isSpectator ? 'spectator' : 'player'
        })
        .select()
        .single();

      if (playerError) {
        console.error('Failed to insert player:', playerError);
        throw playerError;
      }

      console.log('Player inserted successfully:', player);

      // Wait a moment to ensure the insert is fully committed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Transition to waiting room
      onJoinRoom(room.id, player.id);
    } catch (err) {
      console.error('Join room error:', err);
      setError('ルームへの参加に失敗しました');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Users className="w-12 h-12 text-green-600" />
            <h1 className="text-5xl font-bold text-gray-800">わくいき</h1>
          </div>
          <p className="text-xl text-gray-600">
            みんなで話して、テーマに合う価値観を集めよう🌱
          </p>
          <p className="mt-2 text-sm text-gray-500">カードゲーム</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              今日呼ばれたい名前（ニックネーム）
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition"
              placeholder="今日呼ばれたい名前を入力"
              maxLength={20}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-stretch">
            <div className="flex flex-col space-y-4 rounded-xl border-2 border-green-100 bg-gradient-to-br from-green-50 to-white p-6">
              <div className="space-y-2">
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                  <Play className="w-5 h-5 text-green-600" />
                  あたらしいルームをつくる
                </h3>
                <p className="text-sm text-gray-600">
                  みんなでゆったり話せる場をひらきます。テーマに合う価値観カードを集めながら、対話を楽しみましょう。
                </p>
              </div>
              <button
                onClick={createRoom}
                disabled={loading}
                className="mt-auto w-full bg-green-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400 transition shadow-md hover:shadow-lg"
              >
                あたらしいルームをつくる
              </button>
            </div>

            <div className="flex flex-col space-y-4 rounded-xl border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6">
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  既存のルームに参加
                </h3>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition"
                  placeholder="ルームコードを入力"
                />
                <div className="mt-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-3">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        オブザーバーとして参加（見るだけ）
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        カードは引かず、場のようすをそっと見守るモードです。見るだけで参加したいときにオンにしてください。
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={joinAsSpectator}
                      onChange={(e) => setJoinAsSpectator(e.target.checked)}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>
              <button
                onClick={joinRoom}
                disabled={loading}
                className="mt-auto w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400 transition shadow-md hover:shadow-lg"
              >
                ルームに入る
              </button>
            </div>
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-700">
              <strong>4人専用の協力型対話ゲーム</strong><br />
              プレイヤー同士で対話しながら、テーマに合う価値観カードを集めます。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
