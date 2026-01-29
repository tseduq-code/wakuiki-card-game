import { useState } from 'react';
import { Gift as GiftIcon, Send } from 'lucide-react';
import { supabase, Player, Gift } from '../lib/supabase';

interface GiftExchangeProps {
  roomId: string;
  currentPlayerId: string;
  players: Player[];
  gifts: Gift[];
  purposeCard: string;
}

export function GiftExchange({ roomId, currentPlayerId, players, gifts, purposeCard }: GiftExchangeProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [giftMessage, setGiftMessage] = useState('');
  const [sending, setSending] = useState(false);

  const otherPlayers = players.filter(p => p.id !== currentPlayerId);
  const myGifts = gifts.filter(g => g.from_player_id === currentPlayerId);
  const receivedGifts = gifts.filter(g => g.to_player_id === currentPlayerId);

  const canSendMore = myGifts.length < otherPlayers.length;

  async function sendGift() {
    if (!selectedPlayer || !giftMessage.trim() || !canSendMore) return;

    setSending(true);

    try {
      await supabase
        .from('gifts')
        .insert({
          room_id: roomId,
          from_player_id: currentPlayerId,
          to_player_id: selectedPlayer,
          message: giftMessage.trim()
        });

      setSelectedPlayer(null);
      setGiftMessage('');
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  async function finishGame() {
    await supabase
      .from('game_rooms')
      .update({ status: 'completed' })
      .eq('id', roomId);
  }

  const allGiftsSent = gifts.length === players.length * (players.length - 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200">
          <div className="text-center mb-8">
            <GiftIcon className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-800 mb-2">
              ギフト交換
            </h2>
            <p className="text-gray-600 mb-4">
              他のプレイヤーに、目的達成を助ける「新たな価値観」や「具体的なモノや行動」を、理由と共にメッセージとして贈りましょう
            </p>
            <div className="bg-blue-50 px-6 py-3 rounded-lg inline-block">
              <p className="font-bold text-gray-800">テーマ: {purposeCard}</p>
            </div>
          </div>

          {canSendMore && (
            <div className="mb-8 bg-green-50 p-6 rounded-xl border-2 border-green-200">
              <h3 className="font-bold text-lg text-gray-800 mb-4">ギフトを贈る</h3>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  贈る相手を選択
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {otherPlayers
                    .filter(p => !myGifts.some(g => g.to_player_id === p.id))
                    .map((player) => (
                      <button
                        key={player.id}
                        onClick={() => setSelectedPlayer(player.id)}
                        className={`p-3 rounded-lg border-2 font-medium transition ${
                          selectedPlayer === player.id
                            ? 'bg-blue-500 text-white border-blue-600'
                            : 'bg-white text-gray-800 border-gray-300 hover:border-blue-300'
                        }`}
                      >
                        {player.name}
                      </button>
                    ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ギフトメッセージ（価値観、具体的なモノ、行動など）
                </label>
                <textarea
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition resize-none"
                  rows={4}
                  placeholder="例: 「自分を受け入れること」を贈ります。あなたのペースでゆっくり進むことが、心地よい朝につながると思います。"
                  maxLength={500}
                />
                <p className="text-sm text-gray-500 mt-1">{giftMessage.length}/500</p>
              </div>

              <button
                onClick={sendGift}
                disabled={!selectedPlayer || !giftMessage.trim() || sending}
                className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400 transition shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5" />
                ギフトを贈る
              </button>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-bold text-lg text-gray-800 mb-4">贈ったギフト</h3>
              {myGifts.length === 0 ? (
                <p className="text-gray-500 text-center py-4">まだギフトを贈っていません</p>
              ) : (
                <div className="space-y-3">
                  {myGifts.map((gift) => {
                    const toPlayer = players.find(p => p.id === gift.to_player_id);
                    return (
                      <div key={gift.id} className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <p className="font-medium text-gray-800 mb-2">→ {toPlayer?.name}</p>
                        <p className="text-gray-700 text-sm">{gift.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-bold text-lg text-gray-800 mb-4">受け取ったギフト</h3>
              {receivedGifts.length === 0 ? (
                <p className="text-gray-500 text-center py-4">まだギフトを受け取っていません</p>
              ) : (
                <div className="space-y-3">
                  {receivedGifts.map((gift) => {
                    const fromPlayer = players.find(p => p.id === gift.from_player_id);
                    return (
                      <div key={gift.id} className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <p className="font-medium text-gray-800 mb-2">← {fromPlayer?.name}</p>
                        <p className="text-gray-700 text-sm">{gift.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {allGiftsSent && (
            <div className="mt-8 text-center">
              <div className="bg-green-50 p-6 rounded-lg border-2 border-green-300 mb-4">
                <p className="text-lg font-medium text-gray-800">
                  全員がギフトを贈り合いました
                </p>
              </div>
              <button
                onClick={finishGame}
                className="bg-blue-600 text-white py-4 px-12 rounded-lg font-bold text-lg hover:bg-blue-700 transition shadow-md hover:shadow-lg"
              >
                ゲームを終了する
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
