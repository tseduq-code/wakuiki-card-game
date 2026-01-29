import { UserCircle, Heart, CheckCircle, MessageCircle } from 'lucide-react';
import { supabase, Player } from '../lib/supabase';
import { purposeCards } from '../data/cards';

interface CheckInProps {
  roomId: string;
  playerId: string;
  players: Player[];
}

export function CheckIn({ roomId, playerId, players }: CheckInProps) {
  const activePlayers = players.filter(p => p.role !== 'spectator');
  const spectators = players.filter(p => p.role === 'spectator');
  const checkedInPlayers = activePlayers.filter(p => p.has_checked_in);
  const allCheckedIn = checkedInPlayers.length === activePlayers.length;
  const currentPlayer = activePlayers.find(p => p.id === playerId);
  const isSpectator = !currentPlayer;

  async function handleCheckIn(playerIdToCheck: string) {
    await supabase
      .from('players')
      .update({
        has_checked_in: true
      })
      .eq('id', playerIdToCheck);
  }

  async function startVoting() {
    const selectedCards = [...purposeCards];

    await supabase
      .from('game_rooms')
      .update({
        status: 'voting',
        card_options: selectedCards
      })
      .eq('id', roomId);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200">
          <div className="text-center mb-8">
            <MessageCircle className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-800 mb-2">
              チェックイン
            </h2>
            <p className="text-gray-600 mb-4">
              ゲームを始める前に、順番に話しましょう
            </p>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 max-w-2xl mx-auto">
              <div className="space-y-3 text-left">
                <div className="flex items-start gap-3">
                  <UserCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-800 text-lg">ボードゲーム中に呼ばれたい名前</p>
                    <p className="text-sm text-gray-600 mt-1">他のプレイヤーにどう呼んでほしいか教えてください</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Heart className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-800 text-lg">今の気持ち</p>
                    <p className="text-sm text-gray-600 mt-1">現在のあなたの気持ちを自由に話してください</p>
                  </div>
                </div>
              </div>
              <p className="text-center text-gray-700 font-medium mt-4">
                を話しましょう
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="font-bold text-xl text-gray-800 mb-4 text-center">
              プレイヤー
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              {activePlayers.map((player) => {
                const isCurrentPlayer = player.id === playerId;
                const hasCheckedIn = player.has_checked_in;

                return (
                  <div
                    key={player.id}
                    className={`p-6 rounded-lg border-2 transition ${
                      hasCheckedIn
                        ? 'bg-green-50 border-green-300'
                        : 'bg-white border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-lg text-gray-800">{player.name}</span>
                      {hasCheckedIn && (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      )}
                    </div>

                    {!hasCheckedIn && isCurrentPlayer && !isSpectator && (
                      <button
                        onClick={() => handleCheckIn(player.id)}
                        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 transition shadow-md hover:shadow-lg"
                      >
                        話し終わったらチェック
                      </button>
                    )}

                    {!hasCheckedIn && !isCurrentPlayer && (
                      <div className="text-center py-3 text-gray-400 text-sm">
                        話し中...
                      </div>
                    )}

                    {hasCheckedIn && (
                      <div className="text-center py-3 text-green-600 font-semibold">
                        チェックイン完了
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {spectators.length > 0 && (
            <div className="mb-8">
              <h3 className="font-bold text-xl text-gray-800 mb-4 text-center">
                観戦者
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {spectators.map((spectator) => (
                  <div
                    key={spectator.id}
                    className="p-6 rounded-lg border-2 bg-blue-50 border-blue-300"
                  >
                    <div className="flex items-center justify-center">
                      <span className="font-bold text-lg text-gray-800">{spectator.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {allCheckedIn && (
            <div className="text-center mb-6">
              <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6 mb-4">
                <div className="flex items-center justify-center gap-2 text-green-700 mb-2">
                  <CheckCircle className="w-6 h-6" />
                  <span className="font-bold text-lg">全員のチェックインが完了しました！</span>
                </div>
              </div>
              <button
                onClick={startVoting}
                className="bg-green-600 text-white py-4 px-8 rounded-lg font-bold text-lg hover:bg-green-700 transition shadow-md hover:shadow-lg"
              >
                目的カードの選択へ進む
              </button>
            </div>
          )}

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-700 text-center">
              チェックイン完了: {checkedInPlayers.length} / {activePlayers.length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
