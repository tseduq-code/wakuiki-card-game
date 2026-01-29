import { useState, useEffect } from 'react';
import { Heart, Gift as GiftIcon, MessageSquare } from 'lucide-react';
import { supabase, Player } from '../lib/supabase';
import { deduplicateHandStrings } from '../lib/gameUtils';
import { Card } from './Card';

interface FinalPhaseProps {
  roomId: string;
  currentPlayerId: string;
  players: Player[];
  purposeCard: string;
  currentFinalTurn: number;
  finalPhaseStep: 'sharing' | 'gifting' | 'reflection';
  deck?: string[];
  discardPile?: string[];
}

export function FinalPhase({
  roomId,
  currentPlayerId,
  players,
  purposeCard,
  currentFinalTurn,
  finalPhaseStep,
  deck = [],
  discardPile = []
}: FinalPhaseProps) {
  const [percentage, setPercentage] = useState(50);
  const [giftMessage, setGiftMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const activePlayers = players.filter(p => p.role === 'player').sort((a, b) => a.player_number - b.player_number);
  const currentPlayer = players.find(p => p.id === currentPlayerId);
  const turnPlayer = activePlayers.find(p => p.player_number === currentFinalTurn);
  const isMyTurn = currentPlayer?.player_number === currentFinalTurn;

  useEffect(() => {
    setPercentage(50);
    setGiftMessage('');
  }, [finalPhaseStep, currentFinalTurn]);

  async function handleShareResonance() {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.rpc('share_final_resonance', {
        p_room_id: roomId,
        p_player_id: currentPlayerId,
        p_resonance_text: '',
        p_percentage: percentage
      });

      if (error) throw error;
      if (!data?.success) {
        alert(data?.message || 'エラーが発生しました');
      }
    } catch (error) {
      console.error('Error sharing resonance:', error);
      alert('テーマとのマッチ度の共有に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleGiveGift() {
    if (!giftMessage.trim() || isProcessing) return;
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.rpc('give_final_message_gift', {
        p_room_id: roomId,
        p_from_player_id: currentPlayerId,
        p_to_player_id: turnPlayer?.id,
        p_message: giftMessage.trim()
      });

      if (error) throw error;
      if (!data?.success) {
        alert(data?.message || 'エラーが発生しました');
      } else {
        setGiftMessage('');
      }
    } catch (error) {
      console.error('Error giving gift:', error);
      alert('ギフトの贈与に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleEndTurn() {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.rpc('share_final_reflection', {
        p_room_id: roomId,
        p_player_id: currentPlayerId,
        p_reflection_text: '口頭で感想を共有しました'
      });

      if (error) throw error;
      if (!data?.success) {
        alert(data?.message || 'エラーが発生しました');
      }
    } catch (error) {
      console.error('Error ending turn:', error);
      alert('ターン終了に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  }

  const getStepDisplay = () => {
    switch (finalPhaseStep) {
      case 'sharing':
        return { icon: Heart, text: 'テーマとのマッチ度の共有', color: 'green' };
      case 'gifting':
        return { icon: GiftIcon, text: 'ギフトを贈る', color: 'blue' };
      case 'reflection':
        return { icon: MessageSquare, text: '感想を共有', color: 'purple' };
    }
  };

  const stepDisplay = getStepDisplay();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-white p-4">
      <div className="sticky top-0 z-10 bg-gradient-to-br from-green-50 via-blue-50 to-white pb-4 mb-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-4 border-2 border-blue-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Heart className="w-6 h-6 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">今回のテーマ</p>
                  <p className="text-lg font-bold text-gray-800">{purposeCard}</p>
                </div>
              </div>
              <div className="text-center flex-1">
                <p className="text-sm text-gray-600">現在のステップ</p>
                <div className="flex items-center justify-center gap-2">
                  <stepDisplay.icon className={`w-5 h-5 text-${stepDisplay.color}-600`} />
                  <p className="text-lg font-bold text-gray-800">{stepDisplay.text}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">現在のターン</p>
                <p className="text-lg font-bold text-gray-800">
                  {turnPlayer?.preferred_name || turnPlayer?.name}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-gray-200 mb-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  最終フェーズ - {stepDisplay.text}
                </h2>
                <p className="text-gray-600">
                  1ターン = マッチ度共有 → ギフトプレゼント → 感想共有
                </p>
              </div>

              {finalPhaseStep === 'sharing' && (
                isMyTurn ? (
                  <div className="bg-green-50 p-6 rounded-xl border-2 border-green-200">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">
                      <Heart className="w-5 h-5 inline mr-2" />
                      あなたのターン：テーマとのマッチ度を共有してください
                    </h3>

                    <div className="mb-6">
                      <h4 className="font-medium text-sm text-gray-700 mb-3 text-center">
                        {turnPlayer?.preferred_name || turnPlayer?.name}さんの手札
                      </h4>
                      <div className="flex gap-3 justify-center flex-wrap">
                        {(turnPlayer?.hand?.length
                          ? deduplicateHandStrings(turnPlayer.hand).map((card, index) => (
                              <Card key={`${turnPlayer.id}-${card}-${index}`} text={card} disabled />
                            ))
                          : null) ?? <p className="text-gray-500">手札を読み込み中...</p>}
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-lg border-2 border-gray-200 mb-6">
                      <label className="block text-center mb-4">
                        <span className="text-lg font-bold text-gray-800 block mb-2">
                          テーマとのマッチ度
                        </span>
                        <span className="text-6xl font-bold text-blue-600">{percentage}%</span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={percentage}
                        onChange={(e) => setPercentage(Number(e.target.value))}
                        className="w-full h-4 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-sm text-gray-600 mt-2">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    <button
                      onClick={handleShareResonance}
                      disabled={isProcessing}
                      className="w-full bg-green-600 text-white py-4 px-6 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400 transition shadow-md hover:shadow-lg text-lg"
                    >
                      {isProcessing ? '送信中...' : 'テーマとのマッチ度を共有する'}
                    </button>

                    <p className="text-sm text-gray-600 text-center mt-4">
                      共有後、口頭でマッチした理由について詳しく説明してください
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 p-6 rounded-xl border-2 border-gray-200">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">
                      <Heart className="w-5 h-5 inline mr-2" />
                      {turnPlayer?.preferred_name || turnPlayer?.name}さんがテーマとのマッチ度を共有中
                    </h3>

                    <div className="mb-6">
                      <h4 className="font-medium text-sm text-gray-700 mb-3 text-center">
                        {turnPlayer?.preferred_name || turnPlayer?.name}さんの手札
                      </h4>
                      <div className="flex gap-3 justify-center flex-wrap">
                        {(turnPlayer?.hand?.length
                          ? deduplicateHandStrings(turnPlayer.hand).map((card, index) => (
                              <Card key={`${turnPlayer.id}-${card}-${index}`} text={card} disabled />
                            ))
                          : null) ?? <p className="text-gray-500">手札を読み込み中...</p>}
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-sm text-gray-600">
                        共有が完了するまでお待ちください
                      </p>
                    </div>
                  </div>
                )
              )}

              {finalPhaseStep === 'gifting' && (
                isMyTurn ? (
                  <div className="text-center py-12">
                    <div className="bg-blue-50 p-6 rounded-xl border-2 border-blue-200 max-w-lg mx-auto">
                      <GiftIcon className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                      <p className="text-lg font-medium text-gray-800 mb-2">
                        みんなからのメッセージを待っています...
                      </p>
                      <p className="text-sm text-gray-600 mb-4">
                        他のメンバーがあなたにメッセージを送っています
                      </p>
                      {turnPlayer?.final_gifts_received && turnPlayer.final_gifts_received.length > 0 && (
                        <div className="mt-4">
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-sm font-medium text-gray-700">
                              受け取ったメッセージ: {turnPlayer.final_gifts_received.length}/3
                            </p>
                            <div className="flex justify-center gap-2 mt-2">
                              {[0, 1, 2].map((i) => (
                                <div
                                  key={i}
                                  className={`w-3 h-3 rounded-full ${
                                    i < turnPlayer.final_gifts_received.length
                                      ? 'bg-green-500'
                                      : 'bg-gray-300'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-6 pt-6 border-t border-blue-200">
                        <h4 className="font-medium text-sm text-gray-700 mb-3">あなたの手札</h4>
                        <div className="flex gap-3 justify-center flex-wrap">
                          {(currentPlayer?.hand?.length
                            ? deduplicateHandStrings(currentPlayer.hand).map((card, index) => (
                                <Card key={`my-hand-gift-${currentPlayer.id}-${card}-${index}`} text={card} disabled />
                              ))
                            : null) ?? <p className="text-gray-500">手札を読み込み中...</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  currentPlayer?.has_given_final_gift ? (
                    <div className="text-center py-12">
                      <div className="bg-green-50 p-6 rounded-xl border-2 border-green-200 inline-block">
                        <p className="text-lg font-medium text-gray-800 mb-2">
                          メッセージを贈りました！
                        </p>
                        <p className="text-sm text-gray-600">
                          他のメンバーがメッセージを贈るまでお待ちください
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50 p-6 rounded-xl border-2 border-blue-200">
                      <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">
                        <GiftIcon className="w-5 h-5 inline mr-2" />
                        {turnPlayer?.preferred_name || turnPlayer?.name}さんにメッセージを贈る
                      </h3>

                      <div className="mb-6">
                        <h4 className="font-medium text-sm text-gray-700 mb-3 text-center">
                          {turnPlayer?.preferred_name || turnPlayer?.name}さんの手札
                        </h4>
                        <div className="flex gap-3 justify-center flex-wrap">
                          {(turnPlayer?.hand?.length
                            ? deduplicateHandStrings(turnPlayer.hand).map((card, index) => (
                                <Card key={`${turnPlayer.id}-gift-${card}-${index}`} text={card} disabled />
                              ))
                            : null) ?? <p className="text-gray-500">手札を読み込み中...</p>}
                        </div>
                      </div>

                      <div className="mb-6 bg-white p-4 rounded-lg border-2 border-gray-200 text-center">
                        <p className="text-sm text-gray-600 mb-3 font-medium">
                          {turnPlayer?.preferred_name || turnPlayer?.name}さんのテーマとのマッチ度
                        </p>
                        <div className="bg-blue-50 p-4 rounded-lg inline-block">
                          <span className="text-5xl font-bold text-blue-600">
                            {turnPlayer?.final_resonance_percentage ?? 50}%
                          </span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ギフトメッセージ
                        </label>
                        <textarea
                          value={giftMessage}
                          onChange={(e) => setGiftMessage(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition resize-none"
                          rows={5}
                          placeholder={`${turnPlayer?.preferred_name || turnPlayer?.name}さんのテーマとのマッチ度について、あなたの想いや応援メッセージを自由に書いてください。`}
                          maxLength={500}
                        />
                        <p className="text-sm text-gray-500 mt-1">{giftMessage.length}/500</p>
                      </div>

                      <details className="mb-4 bg-gray-50 rounded-lg border-2 border-gray-200 overflow-hidden">
                        <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer list-none flex items-center gap-2 hover:bg-gray-100 transition">
                          <span className="flex-1">クリックしてヒントを表示（価値観の言葉一覧）</span>
                        </summary>
                        <div className="px-4 pb-4 pt-1 border-t border-gray-200">
                          <p className="text-sm text-gray-600 mb-4">
                            これらの言葉も参考にして、相手へのギフトを考えてみましょう
                          </p>

                          <div className="mb-4">
                            <h4 className="text-xs font-bold text-gray-700 mb-2">これまでの場のカード（ヒント）</h4>
                            {discardPile.length === 0 ? (
                              <p className="text-xs text-gray-500">場のカードはありません</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {discardPile.map((card, index) => (
                                  <Card key={`discard-${index}`} text={card} variant="tiny" disabled />
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <h4 className="text-xs font-bold text-gray-700 mb-2">まだ見ぬ山札のカード（ヒント）</h4>
                            {deck.length === 0 ? (
                              <p className="text-xs text-gray-500">山札のカードはありません</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {deck.map((card, index) => (
                                  <Card key={`deck-${index}`} text={card} variant="tiny" disabled />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </details>

                      <button
                        onClick={handleGiveGift}
                        disabled={!giftMessage.trim() || isProcessing}
                        className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400 transition shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <GiftIcon className="w-5 h-5" />
                        {isProcessing ? '送信中...' : 'メッセージを贈る'}
                      </button>
                    </div>
                  )
                )
              )}

              {finalPhaseStep === 'reflection' && (
                isMyTurn ? (
                  <div className="bg-purple-50 p-6 rounded-xl border-2 border-purple-200">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">
                      <MessageSquare className="w-5 h-5 inline mr-2" />
                      届いたメッセージを確認して、感想を口頭で伝えてください
                    </h3>

                    <div className="mb-6">
                      <h4 className="font-medium text-sm text-gray-700 mb-3 text-center">
                        {turnPlayer?.preferred_name || turnPlayer?.name}さんの手札（価値観）
                      </h4>
                      <div className="flex gap-3 justify-center flex-wrap mb-4">
                        {(turnPlayer?.hand?.length
                          ? deduplicateHandStrings(turnPlayer.hand).map((card, index) => (
                              <Card key={`${turnPlayer.id}-refl-${card}-${index}`} text={card} disabled />
                            ))
                          : null) ?? <p className="text-gray-500">手札を読み込み中...</p>}
                      </div>
                    </div>

                    <div className="mb-6">
                      <h4 className="font-medium text-sm text-gray-700 mb-3">みんなから届いたメッセージ</h4>
                      <div className="space-y-3">
                        {currentPlayer?.final_gifts_received?.map((gift: any, index: number) => (
                          <div key={index} className="bg-white p-4 rounded-lg border-2 border-blue-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                              <GiftIcon className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-medium text-gray-700">
                                {gift.from_player_name}さんから
                              </span>
                            </div>
                            <p className="text-gray-800 whitespace-pre-wrap pl-6">
                              {gift.message}
                            </p>
                          </div>
                        )) || <p className="text-gray-500">メッセージを読み込み中...</p>}
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border-2 border-gray-200 mb-4">
                      <p className="text-sm text-gray-600 text-center mb-2">
                        メッセージを読んで、口頭で感想を伝えたら
                      </p>
                      <p className="text-lg font-medium text-gray-800 text-center">
                        下のボタンを押してターンを終了してください
                      </p>
                    </div>

                    <button
                      onClick={handleEndTurn}
                      disabled={isProcessing}
                      className="w-full bg-purple-600 text-white py-4 px-6 rounded-lg font-bold hover:bg-purple-700 disabled:bg-gray-400 transition shadow-md hover:shadow-lg text-lg"
                    >
                      {isProcessing ? '処理中...' : '自分のターンを終了する'}
                    </button>

                    <p className="text-sm text-gray-600 text-center mt-3">
                      口頭で感想を共有してから、ボタンを押してください
                    </p>
                  </div>
                ) : (
                  <div className="bg-purple-50 p-6 rounded-xl border-2 border-purple-200">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">
                      <MessageSquare className="w-5 h-5 inline mr-2" />
                      {turnPlayer?.preferred_name || turnPlayer?.name}さんに届いたメッセージ（みんなで共有中）
                    </h3>

                    <div className="mb-6">
                      <h4 className="font-medium text-sm text-gray-700 mb-3 text-center">
                        {turnPlayer?.preferred_name || turnPlayer?.name}さんの手札（価値観）
                      </h4>
                      <div className="flex gap-3 justify-center flex-wrap mb-4">
                        {(turnPlayer?.hand?.length
                          ? deduplicateHandStrings(turnPlayer.hand).map((card, index) => (
                              <Card key={`${turnPlayer.id}-refl-obs-${card}-${index}`} text={card} disabled />
                            ))
                          : null) ?? <p className="text-gray-500">手札を読み込み中...</p>}
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="space-y-3">
                        {turnPlayer?.final_gifts_received?.length ? (
                          turnPlayer.final_gifts_received.map((gift: any, index: number) => (
                            <div key={index} className="bg-white p-4 rounded-lg border-2 border-blue-200 shadow-sm">
                              <div className="flex items-center gap-2 mb-2">
                                <GiftIcon className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-medium text-gray-700">
                                  {gift.from_player_name}さんから
                                </span>
                              </div>
                              <p className="text-gray-800 whitespace-pre-wrap pl-6">
                                {gift.message}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500 text-center py-4">まだメッセージが届いていません</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border-2 border-gray-200 text-center">
                      <p className="text-sm text-gray-600">
                        {turnPlayer?.preferred_name || turnPlayer?.name}さんの発表を聞いています...
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-4 border-2 border-gray-200 sticky top-32">
              <h3 className="font-bold text-lg text-gray-800 mb-4 text-center">
                全プレイヤーの進捗
              </h3>
              <div className="space-y-3">
                {activePlayers.map((player) => {
                  const displayName = player.preferred_name || player.name;
                  const isCurrentTurn = player.player_number === currentFinalTurn;
                  const hasCompleted = player.has_shared_final_resonance && player.final_reflection_text && player.player_number < currentFinalTurn;

                  return (
                    <div
                      key={player.id}
                      className={`p-4 rounded-lg border-2 transition ${
                        isCurrentTurn
                          ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200'
                          : hasCompleted
                          ? 'bg-green-50 border-green-300'
                          : 'bg-gray-50 border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-800">{displayName}</span>
                        {hasCompleted && (
                          <span className="text-green-600 text-sm font-bold">完了 ✓</span>
                        )}
                        {isCurrentTurn && (
                          <span className="text-blue-600 text-sm font-bold">進行中</span>
                        )}
                      </div>

                      {player.has_shared_final_resonance && (
                        <div className="text-xs text-gray-600 mb-1">
                          ✓ マッチ度共有済み
                        </div>
                      )}
                      {player.final_reflection_text && (
                        <div className="text-xs text-gray-600">
                          ✓ 感想共有済み
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-gray-700 text-center">
                  各プレイヤーが順番にターンを進めます
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
