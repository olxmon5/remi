/**
     * Game Kartu Remi "Minuman" - Hybrid (Online Multiplayer via Railway & Offline Bot)
     */
    $(document).ready(function () {

      const SUITS = [
        { id: 'hearts', name: 'Hati', symbol: '♥', color: 'suit-hearts', icon: 'bi-suit-heart-fill' },
        { id: 'diamonds', name: 'Wajik', symbol: '♦', color: 'suit-diamonds', icon: 'bi-suit-diamond-fill' },
        { id: 'clubs', name: 'Keriting', symbol: '♣', color: 'suit-clubs', icon: 'bi-suit-club-fill' },
        { id: 'spades', name: 'Sekop', symbol: '♠', color: 'suit-spades', icon: 'bi-suit-spade-fill' }
      ];

      const RANKS = [
        { code: '2', val: 2, label: '2' },
        { code: '3', val: 3, label: '3' },
        { code: '4', val: 4, label: '4' },
        { code: '5', val: 5, label: '5' },
        { code: '6', val: 6, label: '6' },
        { code: '7', val: 7, label: '7' },
        { code: '8', val: 8, label: '8' },
        { code: '9', val: 9, label: '9' },
        { code: '10', val: 10, label: '10' },
        { code: 'J', val: 11, label: 'J' },
        { code: 'Q', val: 12, label: 'Q' },
        { code: 'K', val: 13, label: 'K' },
        { code: 'A', val: 14, label: 'A' }
      ];

      // Mode: 'OFFLINE' | 'MULTIPLAYER'
      let mode = 'OFFLINE';
      let socket = null;
      let mpRoomId = null;
      let isHost = false;
      let lastOfflineWinnerId = null;

      // Local state for Offline & synced for MP
      let gameState = {
        players: [],
        rankings: [],
        deck: [],
        baseCard: null,
        activeSuit: null,
        trickPlays: [],
        roundPlays: [],
        roundActedPlayers: [],
        turnIndex: 0,
        roundLeader: 0,
        roundNumber: 1,
        phase: 'PLAYING',
        gameOver: false,
        botDelay: 700,
        myId: 0,
        isMyTurn: true
      };

      function getSuitObj(suitId) {
        return SUITS.find(s => s.id === suitId) || SUITS[0];
      }

      function hasMatchingSuit(cards, suitId) {
        if (!suitId || !cards) return true;
        return cards.some(c => c.suit === suitId);
      }

      function addLog(msg, type = 'info') {
        const $logs = $('#gameLogs');
        let colorClass = 'text-light';
        let icon = 'bi-chevron-right';

        if (type === 'drink') {
          colorClass = 'text-warning';
          icon = 'bi-cup-straw';
        } else if (type === 'play') {
          colorClass = 'text-info';
          icon = 'bi-play-fill';
        } else if (type === 'win') {
          colorClass = 'text-success fw-bold';
          icon = 'bi-trophy-fill';
        } else if (type === 'base') {
          colorClass = 'text-primary fw-bold';
          icon = 'bi-flag-fill';
        } else if (type === 'penalty') {
          colorClass = 'text-danger fw-bold';
          icon = 'bi-exclamation-triangle-fill';
        } else if (type === 'skip') {
          colorClass = 'text-white-50';
          icon = 'bi-skip-forward';
        } else if (type === 'rank') {
          colorClass = 'text-warning fw-bold';
          icon = 'bi-award-fill';
        }

        const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const logItem = `
      <div class="mb-1 ${colorClass}">
        <span class="text-white-50" style="font-size: 11px;">[${timeStr}]</span> 
        <i class="bi ${icon} me-1"></i>${msg}
      </div>
    `;
        $logs.append(logItem);
        $logs.scrollTop($logs[0].scrollHeight);
      }

      $('#btnClearLog').on('click', function () {
        $('#gameLogs').empty();
      });

      $('#botSpeedRange').on('input', function () {
        const val = parseInt($(this).val());
        gameState.botDelay = val;
        let label = 'Sedang';
        if (val <= 400) label = 'Cepat';
        else if (val >= 1200) label = 'Santai';
        $('#speedLabel').text(label);
      });

      function renderCardHtml(card, isPlayable = false, customClass = '', isCovered = false) {
        if (!card) return '';
        const coverHtml = isCovered
          ? `<div class="card-back-cover"><div class="card-back-pattern"><i class="bi bi-eye-slash-fill text-warning"></i></div></div>`
          : '';
        return `
      <div class="playing-card ${card.colorClass} ${isPlayable ? 'playable' : ''} ${customClass}" 
           data-card-id="${card.id}" 
           title="${card.rankLabel} of ${card.suitName}">
        ${coverHtml}
        <div class="card-top">
          <span>${card.rankLabel}</span>
          <span>${card.symbol}</span>
        </div>
        <div class="card-center-suit">${card.symbol}</div>
        <div class="card-bottom">
          <span>${card.rankLabel}</span>
          <span>${card.symbol}</span>
        </div>
      </div>
    `;
      }

      function getRankBadgeHtml(rank, isLoser = false) {
        if (isLoser) {
          return `<span class="badge rank-badge-last"><i class="bi bi-x-circle-fill me-1"></i>Kalah Terakhir</span>`;
        }
        if (rank === 1) {
          return `<span class="badge rank-badge-1"><i class="bi bi-trophy-fill me-1"></i>Juara 1</span>`;
        } else if (rank === 2) {
          return `<span class="badge rank-badge-2"><i class="bi bi-award-fill me-1"></i>Juara 2</span>`;
        } else if (rank === 3) {
          return `<span class="badge rank-badge-3"><i class="bi bi-award-fill me-1"></i>Juara 3</span>`;
        } else if (rank) {
          return `<span class="badge rank-badge-default">Peringkat #${rank}</span>`;
        }
        return '';
      }

      function renderOpponentCards(count) {
        if (count === 0) return '<span class="badge bg-success">Habis!</span>';
        const displayMax = Math.min(count, 8);
        let str = '<div class="d-flex justify-content-center" style="height: 24px;">';
        for (let i = 0; i < displayMax; i++) {
          str += `<div class="card-back" style="width: 14px; height: 22px; margin-right: -7px; border: 1px solid #fff; border-radius: 2px;"></div>`;
        }
        if (count > 8) {
          str += `<span class="badge bg-dark ms-2 align-self-center" style="font-size: 10px;">+${count - 8}</span>`;
        }
        str += '</div>';
        return str;
      }

      // ==========================================
      // RENDER INTERFACE (DIGUNAKAN OFFLINE & MP)
      // ==========================================
      function updateUI() {
        const isMp = mode === 'MULTIPLAYER';
        const myId = isMp ? gameState.myId : 0;
        const myPlayer = gameState.players.find(p => p.id === myId) || { name: 'Anda', hand: [], rank: null };
        const myHand = isMp ? (gameState.myHand || []) : (myPlayer.hand || []);
        const isMyTurn = isMp
          ? (gameState.isMyTurn && gameState.phase !== 'ROUND_SUMMARY' && !gameState.gameOver)
          : (gameState.turnIndex === 0 && myPlayer.rank === null && !gameState.gameOver && gameState.phase !== 'ROUND_SUMMARY' && !(gameState.roundActedPlayers && gameState.roundActedPlayers.includes(0)));

        const activePlayers = gameState.players.filter(p => p.rank === null);
        $('#activePlayersCountBadge').text(`Aktif: ${activePlayers.length}`);

        // Base card
        if (gameState.baseCard) {
          $('#baseCardContainer').html(renderCardHtml(gameState.baseCard));
          const suit = getSuitObj(gameState.activeSuit);
          $('#currentSuitBadgeContainer').html(`
        <div class="current-suit-badge">
          <span class="${suit.colorClass}">${suit.symbol}</span>
          <span>Wajib: ${suit.name}</span>
        </div>
      `);
          $('#targetSuitName').html(`<span class="${suit.colorClass}">${suit.symbol} ${suit.name}</span>`);
        } else {
          $('#baseCardContainer').html(`
        <div class="playing-card d-flex align-items-center justify-content-center text-white-50 border-secondary bg-dark" style="opacity: 0.6;">
          <small class="text-center">Menunggu Base Baru</small>
        </div>
      `);
          $('#currentSuitBadgeContainer').empty();
          $('#targetSuitName').text('Bebas (Pilih Base)');
        }

        // Deck pile
        const deckCount = isMp ? gameState.deckCount : gameState.deck.length;
        $('#deckCount').text(deckCount);
        if (deckCount === 0) {
          $('#topDeckCard').html('<div class="small text-white-50 text-center p-1">Minuman Habis!</div>').css('background', '#334155');
        } else {
          $('#topDeckCard').html(`
        <div class="card-back-pattern">
          <i class="bi bi-cup-straw fs-2 text-warning"></i>
        </div>
      `).css('background', '');
        }

        // Current Trick plays + Base Card (Digabung di satu meja)
        let trickHtml = '';
        if (gameState.baseCard) {
          const baseInTrick = gameState.trickPlays.some(tp => tp.card && tp.card.id === gameState.baseCard.id);
          if (!baseInTrick) {
            const leader = gameState.players.find(p => p.id === gameState.roundLeader);
            trickHtml += `
              <div class="played-slot is-base-slot">
                ${renderCardHtml(gameState.baseCard)}
                <div class="slot-name text-warning" title="Base: ${leader ? leader.name : 'Awal'}">
                  <i class="bi bi-flag-fill me-1"></i>Awalan
                </div>
              </div>
            `;
          }
        }

        if (gameState.trickPlays.length === 0 && !gameState.baseCard) {
          if (gameState.phase === 'CHOOSE_BASE') {
            const leader = gameState.players.find(p => p.id === gameState.roundLeader);
            trickHtml = `
              <div class="text-warning fst-italic">
                <i class="bi bi-star-fill me-1"></i> Menunggu ${leader ? leader.name : ''} menentukan Kartu baru...
              </div>
            `;
          } else {
            trickHtml = '<span class="text-white-50 fst-italic">Kartu di meja telah diambil atau kosong.</span>';
          }
        } else {
          for (let play of gameState.trickPlays) {
            const p = gameState.players.find(x => x.id === play.playerId);
            const isBaseCard = gameState.baseCard && play.card && play.card.id === gameState.baseCard.id;
            const isWinnerCard = gameState.phase === 'ROUND_SUMMARY' && gameState.roundWinnerInfo && gameState.roundWinnerInfo.winnerName === (p ? p.name : '');
            trickHtml += `
              <div class="played-slot ${isBaseCard ? 'is-base-slot' : ''} ${isWinnerCard ? 'is-winner-slot' : ''}">
                ${renderCardHtml(play.card)}
                <div class="slot-name ${isWinnerCard ? 'text-success fw-bold' : (isBaseCard ? 'text-warning' : '')}" title="${p ? p.name : ''}">
                  ${isWinnerCard ? '<i class="bi bi-trophy-fill me-1"></i>' : (isBaseCard ? '<i class="bi bi-flag-fill me-1"></i>' : '')}${p ? p.name : ''}${isBaseCard ? '' : ''}
                </div>
              </div>
            `;
          }
        }
        $('#currentTrickContainer').html(trickHtml);

        const actedCount = (gameState.roundActedPlayers && gameState.roundActedPlayers.length > 0)
          ? gameState.roundActedPlayers.length
          : gameState.trickPlays.length;
        $('#roundProgress').text(`${Math.min(actedCount, activePlayers.length)}/${activePlayers.length}`);

        // Highest card so far in this round
        const playsForHighest = (gameState.roundPlays && gameState.roundPlays.length > 0)
          ? gameState.roundPlays
          : gameState.trickPlays;
        if (playsForHighest.length > 0 && gameState.activeSuit) {
          let highestPlay = null;
          for (let tp of playsForHighest) {
            if (tp.card.suit === gameState.activeSuit) {
              if (!highestPlay || tp.card.rankVal > highestPlay.card.rankVal) {
                highestPlay = tp;
              }
            }
          }
          if (highestPlay) {
            const hp = gameState.players.find(x => x.id === highestPlay.playerId);
            $('#highestCardName').html(`<strong>${highestPlay.card.displayName}</strong> (${hp ? hp.name : ''})`);
          } else {
            $('#highestCardName').text('-');
          }
        } else {
          $('#highestCardName').text('-');
        }

        // Opponents Area
        let oppHtml = '';
        const opponents = gameState.players.filter(p => p.id !== myId);
        opponents.forEach(opp => {
          const isTurn = (gameState.turnIndex === opp.id) && !gameState.gameOver && (opp.rank === null) && gameState.phase !== 'ROUND_SUMMARY';
          const isLeader = (gameState.roundLeader === opp.id) && (opp.rank === null);
          const isFinished = opp.rank !== null;
          const isLastLoser = opp.isLoser;
          const cardCount = isMp ? opp.cardCount : opp.hand.length;

          let statusBadge = '';
          if (isFinished) {
            statusBadge = getRankBadgeHtml(opp.rank, isLastLoser);
          }

          oppHtml += `
        <div class="player-pod ${isTurn ? 'active-turn' : ''} ${isFinished ? (isLastLoser ? 'loser-pod' : 'finished-pod') : ''}" id="playerPod-${opp.id}">
          <div class="d-flex align-items-center gap-2">
            <span class="player-avatar-circle" title="${opp.name}">
              ${opp.avatar || (isMp ? '👤' : '🤖')}
            </span>
            <div>
              <div class="fw-bold d-flex align-items-center gap-1">
                ${opp.name}
                ${isLeader ? '<i class="bi bi-flag-fill text-warning" title="Pemimpin Ronde"></i>' : ''}
                ${isMp && opp.isHost ? '<i class="bi bi-star-fill text-warning ms-1" title="Host"></i>' : ''}
              </div>
              <small class="${isFinished ? 'text-light' : 'text-white-50'}">
                ${isFinished ? (isLastLoser ? 'Kalah Terakhir' : 'Lolos!') : cardCount + ' kartu'}
              </small>
            </div>
          </div>
          <div class="mt-2 text-center">
            ${statusBadge ? statusBadge : renderOpponentCards(cardCount)}
          </div>
        </div>
      `;
        });
        $('#opponentsArea').html(oppHtml);

        // My Hand & Player Pod
        const isHumanFinished = myPlayer.rank !== null;
        $('#humanAvatarDisplay').text(myPlayer.avatar || '🦊');
        $('#playerNameDisplay').html(`
      ${myPlayer.name} ${isMp && isHost ? '<i class="bi bi-star-fill text-warning ms-1" title="Host"></i>' : ''}
      ${isHumanFinished ? getRankBadgeHtml(myPlayer.rank, myPlayer.isLoser) : ''}
    `);

        if (isHumanFinished) {
          $('#playerPod-0').addClass(myPlayer.isLoser ? 'loser-pod' : 'finished-pod').removeClass('active-turn');
          $('#playerCardCount').text(myPlayer.isLoser ? 'Kalah Terakhir' : `Lolos (Juara #${myPlayer.rank})`);
          $('#playerTurnIndicator').addClass('d-none');
        } else {
          $('#playerPod-0').removeClass('finished-pod loser-pod');
          $('#playerCardCount').text(`${myHand.length} kartu`);
          if (isMyTurn) {
            $('#playerPod-0').addClass('active-turn');
            $('#playerTurnIndicator').removeClass('d-none').text(gameState.phase === 'CHOOSE_BASE' ? 'Pilih 1 Kartu Base Baru!' : 'Giliran Anda!');
          } else {
            $('#playerPod-0').removeClass('active-turn');
            $('#playerTurnIndicator').addClass('d-none');
          }
        }

        // Render kartu di tangan
        let humanCardsHtml = '';
        const hasSuit = hasMatchingSuit(myHand, gameState.activeSuit);

        if (isHumanFinished) {
          if (myPlayer.isLoser) {
            humanCardsHtml = `<div class="text-danger fw-bold py-3"><i class="bi bi-x-circle-fill me-1"></i> Anda kalah terakhir dengan sisa ${myHand.length} kartu.</div>`;
          } else {
            humanCardsHtml = `<div class="text-success fw-bold py-3"><i class="bi bi-check-circle-fill me-1"></i> Kartu Anda telah habis! Anda sudah lolos (${getRankBadgeHtml(myPlayer.rank)}). Menonton pemain lain...</div>`;
          }
        } else {
          myHand.forEach((card) => {
            let canPlay = false;
            if (isMyTurn) {
              if (gameState.phase === 'CHOOSE_BASE') {
                canPlay = true;
              } else if (gameState.phase === 'PLAYING') {
                if (card.suit === gameState.activeSuit) {
                  canPlay = true;
                }
              }
            }
            const disabledClass = (!isMyTurn || !canPlay) ? 'disabled-card' : '';
            humanCardsHtml += renderCardHtml(card, canPlay, disabledClass, true);
          });
        }
        $('#humanHandCards').html(humanCardsHtml);

        // Tombol Aksi
        $('#btnHumanDrink').addClass('d-none');
        $('#btnHumanTakePenalty').addClass('d-none');
        $('#btnHumanSkip').addClass('d-none');
        $('#drawPile').removeClass('can-drink');
        $('#deckPrompt').addClass('d-none');

        // Host Start Button in Lobby & Waiting Room View (Screenshot 2 Match)
        if (isMp && gameState.roomStatus === 'LOBBY') {
          $('#centerPlayArena').addClass('d-none');
          $('#mpLobbyArena').removeClass('d-none');
          $('#btnExitRoom').removeClass('d-none');

          // URL format share link
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('room', mpRoomId || '');
          const shareLink = currentUrl.toString();
          $('#waitingRoomLinkText').text(shareLink);

          $('#lobbyPlayerCountBadge').text(`${gameState.players.length} Pemain`);
          const dealOpt = gameState.dealOption || '4';
          const dealLabel = dealOpt === 'all' ? 'Bagi Rata' : `${dealOpt} Kartu`;
          if (isHost) {
            $('#lobbyDealCountSelect').removeClass('d-none').val(dealOpt);
            $('#lobbyDealDisplay').addClass('d-none');
          } else {
            $('#lobbyDealCountSelect').addClass('d-none');
            $('#lobbyDealDisplay').removeClass('d-none').text(dealLabel);
          }

          // Render players in lobby
          let lobbyPlayersHtml = '';
          gameState.players.forEach((p) => {
            const isMe = p.id === myId;
            lobbyPlayersHtml += `
              <div class="player-slot-row">
                <div class="d-flex align-items-center gap-2">
                  <span class="player-avatar-circle" style="width:38px; height:38px; font-size:1.3rem;">${p.avatar || '👤'}</span>
                  <div>
                    <div class="fw-bold text-light d-flex align-items-center gap-1">
                      ${p.name} ${isMe ? '<span class="text-warning small">(You)</span>' : ''}
                    </div>
                    <small class="text-white-50">Siap Bermain</small>
                  </div>
                </div>
                <div>
                  ${p.isHost ? '<span class="badge bg-warning text-dark fw-bold px-2 py-1"><i class="bi bi-star-fill me-1"></i>Host 👑</span>' : '<span class="badge bg-secondary px-2 py-1">Pemain</span>'}
                </div>
              </div>
            `;
          });
          lobbyPlayersHtml += `
            <div class="player-slot-empty">
              <i class="bi bi-plus-circle me-1"></i> Menunggu pemain lain bergabung (Tanpa Batasan)...
            </div>
          `;
          $('#lobbyPlayersList').html(lobbyPlayersHtml);

          if (isHost) {
            $('#lobbyHostControl').removeClass('d-none');
            $('#lobbyGuestControl').addClass('d-none');
            $('#btnHostStartGame').removeClass('d-none');
            $('#trickStatusMsg').html(`<span class="text-warning">Menunggu pemain lain bergabung. Klik "Start Game" jika sudah siap! (${gameState.players.length} Pemain)</span>`);
          } else {
            $('#lobbyHostControl').addClass('d-none');
            $('#lobbyGuestControl').removeClass('d-none');
            $('#btnHostStartGame').addClass('d-none');
            $('#trickStatusMsg').html(`<span class="text-info">Menunggu Host memulai permainan... (${gameState.players.length} Pemain di Ruangan)</span>`);
          }
        } else {
          $('#centerPlayArena').removeClass('d-none');
          $('#mpLobbyArena').addClass('d-none');
          if (isMp) {
            $('#btnExitRoom').removeClass('d-none');
          } else {
            $('#btnExitRoom').addClass('d-none');
          }
          $('#btnHostStartGame').addClass('d-none');
        }

        if (gameState.phase === 'ROUND_SUMMARY') {
          $('#roundSummaryControl').removeClass('d-none');
          const winInfo = gameState.roundWinnerInfo;
          if (winInfo) {
            $('#trickStatusMsg').html(`
              <span class="text-success fw-bold fs-6">
                <i class="bi bi-trophy-fill me-1"></i> Kartu Tertinggi: <strong>${winInfo.winnerName}</strong> (${winInfo.cardDisplayName})!
              </span>
              <br><small class="text-white-50 d-none">Klik tombol di bawah jika sudah siap melanjutkan ke ronde berikutnya.</small>
            `);
          } else {
            $('#trickStatusMsg').html(`<span class="text-info fw-bold">Putaran selesai. Klik tombol di bawah untuk melanjutkan ronde.</span>`);
          }
        } else {
          $('#roundSummaryControl').addClass('d-none');

          if (isMyTurn && gameState.phase === 'PLAYING') {
            if (!hasSuit) {
              if (deckCount > 0) {
                // $('#btnHumanDrink').removeClass('d-none');
                $('#drawPile').addClass('can-drink');
                // $('#deckPrompt').removeClass('d-none');
                $('#trickStatusMsg').text(`Anda tidak punya kartu ${getSuitObj(gameState.activeSuit).name}. Wajib MINUM!`);
              } else {
                if (gameState.trickPlays.length > 0) {
                  $('#btnHumanTakePenalty').removeClass('d-none');
                  $('#trickStatusMsg').html(`<span class="text-danger fw-bold">Minuman habis dan Anda tidak punya kartu ${getSuitObj(gameState.activeSuit).name}! Ambil (${gameState.trickPlays.length}) kartu di meja ini!</span>`);
                } else {
                  $('#btnHumanSkip').removeClass('d-none');
                  $('#trickStatusMsg').text(`Minuman habis, meja kosong, dan Anda tidak punya kartu yang cocok. Klik Lewat (Skip).`);
                }
              }
            } else {
              // $('#trickStatusMsg').text(`Pilih salah satu kartu ${getSuitObj(gameState.activeSuit).name} Anda untuk dikeluarkan.`);
            }
          } else if (isMyTurn && gameState.phase === 'CHOOSE_BASE') {
            $('#trickStatusMsg').text('Pilih 1 kartu dari tangan Anda untuk dijadikan Kartu baru.');
          } else if (!isMyTurn && gameState.phase === 'PLAYING' && !(isMp && gameState.roomStatus === 'LOBBY')) {
            const turnPlayer = gameState.players.find(p => p.id === gameState.turnIndex);
            $('#trickStatusMsg').text(`Giliran ${turnPlayer ? turnPlayer.name : 'pemain lain'}`);
          }
        }

        // Sidebar Info
        $('#roundCounter').text(`Ronde #${gameState.roundNumber}`);
        const leader = gameState.players.find(p => p.id === gameState.roundLeader);
        $('#leaderName').text(leader ? leader.name : '-');
        const turnOwner = gameState.players.find(p => p.id === gameState.turnIndex);
        $('#turnOwnerName').text(turnOwner ? turnOwner.name : '-');

        updateLeaderboardUI();
      }

      function updateLeaderboardUI() {
        let lbHtml = '<div class="list-group list-group-flush">';
        const myId = mode === 'MULTIPLAYER' ? gameState.myId : 0;

        gameState.rankings.forEach(pId => {
          const p = gameState.players.find(x => x.id === pId);
          if (p) {
            lbHtml += `
          <div class="list-group-item bg-transparent text-light border-secondary d-flex justify-content-between align-items-center py-1 px-2">
            <div>
              <span class="me-1">${p.avatar || '👤'}</span>
              <span class="fw-semibold">${p.name}</span>
              ${p.id === myId ? '<span class="badge bg-primary ms-1" style="font-size:10px;">Anda</span>' : ''}
            </div>
            <div>${getRankBadgeHtml(p.rank, p.isLoser)}</div>
          </div>
        `;
          }
        });

        const active = gameState.players.filter(p => p.rank === null);
        active.forEach(p => {
          const cCount = mode === 'MULTIPLAYER' ? (p.id === myId ? (gameState.myHand ? gameState.myHand.length : 0) : p.cardCount) : p.hand.length;
          lbHtml += `
        <div class="list-group-item bg-transparent text-white-50 border-secondary d-flex justify-content-between align-items-center py-1 px-2">
          <div>
            <span class="me-1">${p.avatar || '👤'}</span>
            <span>${p.name}</span>
            ${p.id === myId ? '<span class="badge bg-secondary ms-1" style="font-size:10px;">Anda</span>' : ''}
          </div>
          <span class="badge bg-dark border border-secondary text-warning">${cCount || 0} kartu</span>
        </div>
      `;
        });

        lbHtml += '</div>';
        $('#leaderboardList').html(lbHtml);
      }

      function showFinalGameOverModal(loser) {
        let listHtml = '';
        const myId = mode === 'MULTIPLAYER' ? gameState.myId : 0;

        gameState.rankings.forEach((pId, idx) => {
          const p = gameState.players.find(x => x.id === pId);
          if (!p) return;
          const isLoser = (loser && p.id === loser.id) || p.isLoser;
          const bgStyle = idx === 0
            ? 'background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.4);'
            : (isLoser
              ? 'background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4);'
              : 'background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);');

          listHtml += `
            <div class="p-2 px-3 mb-2 rounded-3 d-flex justify-content-between align-items-center" style="${bgStyle}">
              <div class="d-flex align-items-center gap-2">
                <span class="fs-4">${idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : (isLoser ? '💀' : '🎖️')))}</span>
                <span class="player-avatar-circle" style="width:34px; height:34px; font-size:1.2rem;">${p.avatar || '👤'}</span>
                <div>
                  <div class="fw-bold text-light">${p.name} ${p.id === myId ? '<span class="badge bg-warning text-dark ms-1">Anda</span>' : ''}</div>
                  ${isLoser ? `<small class="text-danger fw-semibold">Kalah Terakhir (Juru Kunci)</small>` : `<small class="text-white-50">Lolos ke Peringkat #${p.rank}</small>`}
                </div>
              </div>
              <div>
                ${getRankBadgeHtml(p.rank, isLoser)}
              </div>
            </div>
          `;
        });

        $('#finalRankingsList').html(listHtml);
        if (loser) {
          $('#finalLoserAlert').removeClass('d-none').html(`
        <i class="bi bi-emoji-dizzy-fill fs-3 text-danger d-block mb-1"></i>
        <strong>${loser.name}</strong> adalah yang Kalah Terakhir (Juru Kunci)!
      `);
        } else {
          $('#finalLoserAlert').addClass('d-none');
        }

        setTimeout(() => {
          $('#gameOverModal').modal('show');
        }, 800);
      }

      // ==========================================
      // LOGIKA OFFLINE BOT
      // ==========================================
      function createStandardDeck() {
        let deck = [];
        let idCounter = 1;
        for (let s of SUITS) {
          for (let r of RANKS) {
            deck.push({
              id: idCounter++,
              suit: s.id,
              suitName: s.name,
              symbol: s.symbol,
              colorClass: s.color,
              icon: s.icon,
              rankCode: r.code,
              rankVal: r.val,
              rankLabel: r.label,
              displayName: r.code + ' ' + s.symbol
            });
          }
        }
        return deck;
      }

      function shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
      }

      function sortHand(hand) {
        const suitOrder = { 'hearts': 1, 'diamonds': 2, 'clubs': 3, 'spades': 4 };
        hand.sort((a, b) => {
          if (suitOrder[a.suit] !== suitOrder[b.suit]) {
            return suitOrder[a.suit] - suitOrder[b.suit];
          }
          return a.rankVal - b.rankVal;
        });
      }

      function initGameOffline(numPlayers, dealOption, humanName, humanAvatar) {
        mode = 'OFFLINE';
        $('#badgeGameMode').removeClass('bg-primary').addClass('bg-danger').text('Offline (Bot)');
        $('#roomInfoBar').addClass('d-none');
        $('#speedControlBox').removeClass('d-none');

        let fullDeck = shuffleDeck(createStandardDeck());
        gameState.deck = [];
        gameState.players = [];
        gameState.rankings = [];
        gameState.trickPlays = [];
        gameState.baseCard = null;
        gameState.activeSuit = null;
        gameState.roundNumber = 1;
        gameState.phase = 'PLAYING';
        gameState.gameOver = false;
        gameState.myId = 0;
        gameState.isMyTurn = true;

        const botNames = ['Budi', 'Slamet', 'Joko', 'Agus', 'Bambang', 'Tri'];
        const botAvatars = ['🐱', '🐶', '🦁', '🐼', '🐯', '🐵', '🐨', '🐰'];

        gameState.players.push({
          id: 0,
          name: humanName || 'Saya',
          avatar: humanAvatar || $('#setupPlayerAvatar').val() || $('#inputMpPlayerAvatar').val() || '🦊',
          isHuman: true,
          hand: [],
          rank: null,
          isLoser: false
        });

        for (let i = 1; i < numPlayers; i++) {
          gameState.players.push({
            id: i,
            name: botNames[(i - 1) % botNames.length],
            avatar: botAvatars[(i - 1) % botAvatars.length],
            isHuman: false,
            hand: [],
            rank: null,
            isLoser: false
          });
        }

        let cardsPerPlayer = 4;
        if (dealOption === 'all') {
          cardsPerPlayer = Math.floor((fullDeck.length - 1) / numPlayers);
        } else {
          cardsPerPlayer = parseInt(dealOption, 10);
        }

        for (let p of gameState.players) {
          p.hand = fullDeck.splice(0, cardsPerPlayer);
          sortHand(p.hand);
        }

        gameState.baseCard = fullDeck.pop();
        gameState.activeSuit = gameState.baseCard.suit;
        gameState.deck = fullDeck;

        // Jika rematch/main lagi dan ada juara 1 game sebelumnya:
        // pemain juara 1 yang jalan pertama. Jika game pertama: random.
        let initialLeader = 0;
        let leaderNote = '';
        if (lastOfflineWinnerId !== null && gameState.players.some(p => p.id === lastOfflineWinnerId)) {
          initialLeader = lastOfflineWinnerId;
          leaderNote = '(Juara 1 Ronde Sebelumnya)';
        } else {
          initialLeader = Math.floor(Math.random() * gameState.players.length);
          leaderNote = '(Acak Ronde Pertama)';
        }

        gameState.roundLeader = initialLeader;
        gameState.turnIndex = initialLeader;
        gameState.trickPlays = [];
        gameState.roundPlays = [];
        gameState.roundActedPlayers = [];

        $('#gameLogs').empty();
        $('#gameOverModal').modal('hide');
        addLog(`Mode Offline vs Bot: ${numPlayers} pemain, ${cardsPerPlayer} kartu/orang.`, 'base');
        addLog(`Base awal: <strong>${gameState.baseCard.displayName}</strong> (${getSuitObj(gameState.baseCard.suit).name}). Giliran pertama: <strong>${gameState.players[initialLeader].name}</strong> ${leaderNote}.`, 'base');

        updateUI();
        runTurnCycleOffline();
      }

      function checkPlayerFinishingOffline(player) {
        if (player.hand.length === 0 && player.rank === null) {
          const nextRank = gameState.rankings.length + 1;
          player.rank = nextRank;
          gameState.rankings.push(player.id);
          if (nextRank === 1) {
            lastOfflineWinnerId = player.id;
          }
          addLog(`🎉 <strong>${player.name}</strong> berhasil menghabiskan kartu dan meraih <strong>Peringkat #${nextRank}</strong>!`, 'rank');
          checkGameOverOffline();
          return true;
        }
        return false;
      }

      function checkGameOverOffline() {
        const active = gameState.players.filter(p => p.rank === null);
        if (active.length === 1 && !gameState.gameOver) {
          const loser = active[0];
          loser.rank = gameState.players.length;
          loser.isLoser = true;
          gameState.rankings.push(loser.id);
          gameState.gameOver = true;
          gameState.phase = 'GAME_OVER';

          addLog(`💀 Permainan Berakhir! <strong>${loser.name}</strong> sisa ${loser.hand.length} kartu dan menjadi <strong>KALAH TERAKHIR</strong>!`, 'penalty');
          updateUI();
          showFinalGameOverModal(loser);
          return true;
        }
        return false;
      }

      function runTurnCycleOffline() {
        if (gameState.gameOver || mode !== 'OFFLINE') return;
        if (gameState.phase !== 'CHOOSE_BASE' && gameState.phase !== 'PLAYING') return;
        if (gameState.turnIndex < 0 || gameState.turnIndex >= gameState.players.length) return;

        let loops = 0;
        while (gameState.players[gameState.turnIndex].rank !== null && loops < gameState.players.length) {
          gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
          loops++;
        }

        const curPlayer = gameState.players[gameState.turnIndex];
        updateUI();

        if (curPlayer && !curPlayer.isHuman && curPlayer.rank === null) {
          setTimeout(() => {
            botTakeActionOffline(curPlayer);
          }, gameState.botDelay);
        }
      }

      function botTakeActionOffline(bot) {
        if (gameState.gameOver || bot.rank !== null || mode !== 'OFFLINE') return;
        if (gameState.phase !== 'CHOOSE_BASE' && gameState.phase !== 'PLAYING') return;
        if (gameState.roundActedPlayers && gameState.roundActedPlayers.includes(bot.id)) return;

        if (gameState.phase === 'CHOOSE_BASE') {
          let chosenCard = bot.hand[0];
          for (let c of bot.hand) {
            if (c.rankVal > chosenCard.rankVal) chosenCard = c;
          }
          playCardOffline(bot, chosenCard, true);
          return;
        }

        const matchingCards = bot.hand.filter(c => c.suit === gameState.activeSuit);
        if (matchingCards.length > 0) {
          let highestOnTable = 0;
          const playsToCheck = (gameState.roundPlays && gameState.roundPlays.length > 0) ? gameState.roundPlays : gameState.trickPlays;
          for (let tp of playsToCheck) {
            if (tp.card.suit === gameState.activeSuit && tp.card.rankVal > highestOnTable) {
              highestOnTable = tp.card.rankVal;
            }
          }
          let playableCard = null;
          matchingCards.sort((a, b) => a.rankVal - b.rankVal);
          for (let mc of matchingCards) {
            if (mc.rankVal > highestOnTable) {
              playableCard = mc;
              break;
            }
          }
          if (!playableCard) playableCard = matchingCards[0];
          playCardOffline(bot, playableCard);
        } else {
          handleDrinkOrPenaltyOffline(bot);
        }
      }

      function playCardOffline(player, card, isNewBase = false) {
        if (gameState.phase !== 'CHOOSE_BASE' && gameState.phase !== 'PLAYING') return;
        if (!isNewBase && gameState.roundActedPlayers && gameState.roundActedPlayers.includes(player.id)) return;

        const cardIdx = player.hand.findIndex(c => c.id === card.id);
        if (cardIdx !== -1) player.hand.splice(cardIdx, 1);

        if (isNewBase) {
          gameState.baseCard = card;
          gameState.activeSuit = card.suit;
          gameState.phase = 'PLAYING';
          gameState.trickPlays = [{ playerId: player.id, card: card }];
          gameState.roundPlays = [{ playerId: player.id, card: card }];
          gameState.roundActedPlayers = [player.id];
          addLog(`<strong>${player.name}</strong> menentukan Kartu baru: <strong>${card.displayName}</strong> (${getSuitObj(card.suit).name})`, 'base');
        } else {
          gameState.trickPlays.push({ playerId: player.id, card: card });
          if (!gameState.roundPlays) gameState.roundPlays = [];
          gameState.roundPlays.push({ playerId: player.id, card: card });
          if (!gameState.roundActedPlayers) gameState.roundActedPlayers = [];
          if (!gameState.roundActedPlayers.includes(player.id)) {
            gameState.roundActedPlayers.push(player.id);
          }
          addLog(`<strong>${player.name}</strong> mengeluarkan <strong>${card.displayName}</strong>`, 'play');
        }

        checkPlayerFinishingOffline(player);
        if (gameState.gameOver) return;

        advanceToNextPlayerOffline();
      }

      function advanceToNextPlayerOffline() {
        if (checkGameOverOffline()) return;

        const activePlayers = gameState.players.filter(p => p.rank === null);
        if (activePlayers.length <= 1) {
          checkGameOverOffline();
          return;
        }

        let nextIdx = (gameState.turnIndex + 1) % gameState.players.length;
        let loops = 0;
        while (gameState.players[nextIdx].rank !== null && loops < gameState.players.length) {
          nextIdx = (nextIdx + 1) % gameState.players.length;
          loops++;
        }

        const roundFinished = gameState.roundActedPlayers && (
          gameState.roundActedPlayers.includes(nextIdx) ||
          activePlayers.every(p => gameState.roundActedPlayers.includes(p.id))
        );

        if (roundFinished) {
          gameState.turnIndex = -1;
          gameState.phase = 'ROUND_SUMMARY';
          evaluateTrickWinnerOffline();
          return;
        }

        gameState.turnIndex = nextIdx;
        runTurnCycleOffline();
      }

      function evaluateTrickWinnerOffline() {
        gameState.turnIndex = -1;
        gameState.phase = 'ROUND_SUMMARY';
        updateUI();
        addLog(`Putaran kartu selesai. Menghitung kartu tertinggi...`, 'info');

        let playsToEvaluate = (gameState.roundPlays && gameState.roundPlays.length > 0)
          ? gameState.roundPlays
          : gameState.trickPlays;

        let validPlays = playsToEvaluate
          .filter(tp => tp.card.suit === gameState.activeSuit)
          .sort((a, b) => b.card.rankVal - a.card.rankVal);

        setTimeout(() => {
          if (validPlays.length === 0) {
            const active = gameState.players.filter(p => p.rank === null);
            let nextLeader = gameState.players.find(p => p.id === gameState.roundLeader);
            if (!nextLeader || nextLeader.rank !== null) nextLeader = active[0];

            gameState.trickPlays = [];
            gameState.roundPlays = [];
            gameState.roundActedPlayers = [];
            gameState.baseCard = null;
            gameState.activeSuit = null;
            gameState.phase = 'CHOOSE_BASE';
            if (nextLeader) {
              gameState.roundLeader = nextLeader.id;
              gameState.turnIndex = nextLeader.id;
            }
            runTurnCycleOffline();
            return;
          }

          const winningPlay = validPlays[0];
          const roundWinner = gameState.players.find(p => p.id === winningPlay.playerId);
          addLog(`★ <strong>${roundWinner.name}</strong> memenangkan ronde dengan <strong>${winningPlay.card.displayName}</strong>!`, 'win');

          let nextBaseLeader = null;
          if (roundWinner.rank === null) {
            nextBaseLeader = roundWinner;
          } else {
            for (let i = 1; i < validPlays.length; i++) {
              const cand = gameState.players.find(p => p.id === validPlays[i].playerId);
              if (cand && cand.rank === null) {
                nextBaseLeader = cand;
                addLog(`Karena <strong>${roundWinner.name}</strong> sudah habis kartunya, hak membuat Kartu baru beralih ke <strong>${cand.name}</strong>!`, 'info');
                break;
              }
            }
            if (!nextBaseLeader) {
              const active = gameState.players.filter(p => p.rank === null);
              if (active.length > 0) {
                nextBaseLeader = active[0];
                addLog(`Hak membuat Kartu baru diberikan kepada <strong>${nextBaseLeader.name}</strong>.`, 'info');
              }
            }
          }

          if (checkGameOverOffline()) return;

          // Jeda agar pemain bisa melihat kartu tertinggi: Masuk ke ROUND_SUMMARY
          gameState.phase = 'ROUND_SUMMARY';
          gameState.roundWinnerInfo = {
            winnerName: roundWinner.name,
            cardDisplayName: winningPlay.card.displayName,
            nextLeaderName: nextBaseLeader ? nextBaseLeader.name : roundWinner.name
          };
          gameState.offlineNextRoundLeader = nextBaseLeader ? nextBaseLeader.id : 0;

          updateUI();

          // Auto lanjut ke ronde berikutnya setelah 3 detik
          if (window._offlineRoundTimer) clearTimeout(window._offlineRoundTimer);
          if (window._offlineCountdownInterval) clearInterval(window._offlineCountdownInterval);

          let remainingSeconds = 3;
          $('#btnNextRound').html(`<i class="bi bi-arrow-right-circle-fill me-1"></i> Next Round (${remainingSeconds}s)`);

          window._offlineCountdownInterval = setInterval(() => {
            remainingSeconds--;
            if (remainingSeconds > 0) {
              $('#btnNextRound').html(`<i class="bi bi-arrow-right-circle-fill me-1"></i> Next Round (${remainingSeconds}s)`);
            } else {
              clearInterval(window._offlineCountdownInterval);
            }
          }, 1000);

          window._offlineRoundTimer = setTimeout(() => {
            if (gameState.phase === 'ROUND_SUMMARY') {
              triggerNextRoundOffline();
            }
          }, 3000);
        }, 1000);
      }

      function handleDrinkOrPenaltyOffline(player) {
        if (gameState.gameOver || player.rank !== null) return;
        if (gameState.phase !== 'PLAYING') return;
        if (gameState.roundActedPlayers && gameState.roundActedPlayers.includes(player.id)) return;

        if (gameState.deck.length > 0) {
          const drawnCard = gameState.deck.pop();
          player.hand.push(drawnCard);
          // Jangan otomatis urutkan (sortHand) saat minum, kartu baru diletakkan di paling kanan
          addLog(`<strong>${player.name}</strong> tidak punya ${getSuitObj(gameState.activeSuit).name} → <strong>MINUM</strong> 1 kartu.`, 'drink');

          if (player.id === 0) {
            // Human player: tarik 1 kartu per 1x klik, jangan auto minum berulang kali
            if (drawnCard.suit === gameState.activeSuit) {
              addLog(`<strong>${player.name}</strong> mendapatkan kartu cocok: <strong>${drawnCard.displayName}</strong>! Silakan klik untuk mengeluarkannya.`, 'play');
            } else {
              addLog(`Kartu belum cocok (${drawnCard.displayName}). Klik Minum lagi jika tumpukan kartu masih ada.`, 'info');
            }
            updateUI();
            return;
          }

          // Bot player: jika cocok auto-play, jika tidak cocok auto-minum lagi setelah jeda botDelay
          if (drawnCard.suit === gameState.activeSuit) {
            addLog(`<strong>${player.name}</strong> langsung mendapatkan kartu cocok: <strong>${drawnCard.displayName}</strong>!`, 'play');
            updateUI();
            setTimeout(() => {
              if (gameState.phase === 'PLAYING') {
                playCardOffline(player, drawnCard);
              }
            }, gameState.botDelay);
          } else {
            updateUI();
            if (gameState.deck.length > 0) {
              setTimeout(() => {
                if (gameState.phase === 'PLAYING') {
                  handleDrinkOrPenaltyOffline(player);
                }
              }, Math.max(300, gameState.botDelay / 2));
            } else {
              applyTrickCardsPenaltyOffline(player);
            }
          }
          return;
        }

        if (gameState.trickPlays.length > 0) {
          addLog(`Minuman habis! <strong>${player.name}</strong> tidak punya ${getSuitObj(gameState.activeSuit).name} dan wajib mengambil kartu di meja!`, 'penalty');
          applyTrickCardsPenaltyOffline(player);
          return;
        }

        if (!gameState.roundActedPlayers) gameState.roundActedPlayers = [];
        if (!gameState.roundActedPlayers.includes(player.id)) {
          gameState.roundActedPlayers.push(player.id);
        }
        addLog(`<strong>${player.name}</strong> Lewat (Skip) karena meja kosong dan minuman habis.`, 'skip');
        advanceToNextPlayerOffline();
      }

      function applyTrickCardsPenaltyOffline(player) {
        if (gameState.phase !== 'PLAYING') return;
        if (!gameState.roundActedPlayers) gameState.roundActedPlayers = [];
        if (!gameState.roundActedPlayers.includes(player.id)) {
          gameState.roundActedPlayers.push(player.id);
        }

        if (gameState.trickPlays.length > 0) {
          addLog(`🚨 <strong>${player.name}</strong> mengambil (${gameState.trickPlays.length}) kartu di meja sebagai minuman!`, 'penalty');
          for (let tp of gameState.trickPlays) {
            player.hand.push(tp.card);
          }
          // Jangan otomatis urutkan (sortHand), kartu penalti diletakkan di paling kanan
          gameState.trickPlays = [];
          gameState.baseCard = null;
          updateUI();
        }
        advanceToNextPlayerOffline();
      }

      // ==========================================
      // MULTIPLAYER SOCKET.IO INTEGRATION
      // ==========================================
      function connectSocket(serverUrl, onConnectSuccess, onConnectError) {
        if (socket) {
          socket.disconnect();
        }

        $('#mpConnectionStatus').html('<span class="text-warning"><i class="bi bi-hourglass-split"></i> Menghubungkan ke server Railway...</span>');

        socket = io(serverUrl, {
          transports: ['websocket', 'polling'],
          timeout: 10000
        });

        socket.on('connect', () => {
          $('#mpConnectionStatus').html('<span class="text-success"><i class="bi bi-check-circle-fill"></i> Terhubung ke server Socket.IO!</span>');
          if (onConnectSuccess) onConnectSuccess();
        });

        socket.on('connect_error', (err) => {
          $('#mpConnectionStatus').html(`<span class="text-danger"><i class="bi bi-x-circle-fill"></i> Gagal terhubung ke: ${serverUrl}. Pastikan server Railway/Localhost menyala.</span>`);
          if (onConnectError) onConnectError(err);
        });

        // Event Server Update State
        socket.on('gameStateUpdate', (data) => {
          gameState.roomStatus = data.roomStatus;
          gameState.players = data.players;
          gameState.myHand = data.myHand;
          gameState.myId = data.myId;
          gameState.isMyTurn = data.isMyTurn;
          gameState.deckCount = data.deckCount;
          gameState.baseCard = data.baseCard;
          gameState.activeSuit = data.activeSuit;
          gameState.trickPlays = data.trickPlays;
          gameState.turnIndex = data.turnIndex;
          gameState.roundLeader = data.roundLeader;
          gameState.roundNumber = data.roundNumber;
          gameState.phase = data.phase;
          gameState.rankings = data.rankings;
          gameState.gameOver = data.gameOver;
          gameState.roundWinnerInfo = data.roundWinnerInfo || null;
          gameState.roundPlays = data.roundPlays || [];
          gameState.roundActedPlayers = data.roundActedPlayers || [];

          const myObj = data.players.find(p => p.id === data.myId);
          isHost = myObj ? myObj.isHost : false;

          updateUI();

          // Jika game selesai di mode multiplayer, tampilkan Modal Hasil Akhir otomatis
          if (data.gameOver && data.rankings && data.rankings.length > 0) {
            const loserId = data.rankings[data.rankings.length - 1];
            const loserObj = data.players.find(p => p.id === loserId);
            showFinalGameOverModal(loserObj);
          } else if (data.roomStatus === 'LOBBY') {
            $('#gameOverModal').modal('hide');
          }
        });

        // Event Log dari Server
        socket.on('gameLog', ({ type, msg }) => {
          addLog(msg, type);
        });
      }

      // Avatar Picker Interaction (Multiplayer & Offline)
      $(document).on('click', '.avatar-option-btn', function () {
        const selectedAvatar = $(this).data('avatar');
        const container = $(this).closest('.avatar-picker-grid');
        container.find('.avatar-option-btn').removeClass('selected');
        $(this).addClass('selected');

        if (container.attr('id') === 'mpAvatarPicker') {
          $('#inputMpPlayerAvatar').val(selectedAvatar);
          $('#mpAvatarPreview').text(selectedAvatar);
          // Sync ke offline juga
          $('#setupPlayerAvatar').val(selectedAvatar);
          $('#offlineAvatarPreview').text(selectedAvatar);
          $('#offlineAvatarPicker .avatar-option-btn').removeClass('selected').filter(`[data-avatar="${selectedAvatar}"]`).addClass('selected');
        } else {
          $('#setupPlayerAvatar').val(selectedAvatar);
          $('#offlineAvatarPreview').text(selectedAvatar);
          // Sync ke multiplayer juga
          $('#inputMpPlayerAvatar').val(selectedAvatar);
          $('#mpAvatarPreview').text(selectedAvatar);
          $('#mpAvatarPicker .avatar-option-btn').removeClass('selected').filter(`[data-avatar="${selectedAvatar}"]`).addClass('selected');
        }
      });

      // Buat Room MP
      $('#btnMpCreateRoom').on('click', function () {
        const serverUrl = $('#inputServerUrl').val().trim();
        const playerName = $('#inputMpPlayerName').val().trim() || 'Saya';
        const playerAvatar = $('#inputMpPlayerAvatar').val() || '🦊';
        const dealOption = $('#inputMpDealCount').val();

        if (!serverUrl) {
          alert('Masukkan URL server Railway terlebih dahulu!');
          return;
        }

        connectSocket(serverUrl, () => {
          socket.emit('createRoom', { playerName, playerAvatar, dealOption }, (res) => {
            if (res && res.success) {
              mode = 'MULTIPLAYER';
              mpRoomId = res.roomId;
              isHost = true;

              $('#badgeGameMode').removeClass('bg-danger').addClass('bg-primary').text('Online Multiplayer');
              $('#roomInfoBar').removeClass('d-none');
              $('#currentRoomCodeDisplay').text(res.roomId);
              $('#speedControlBox').addClass('d-none');
              $('#gameLogs').empty();

              $('#multiplayerModal').modal('hide');
              addLog(`🎮 Berhasil membuat Room: <strong>${res.roomId}</strong>. Bagikan kode ini ke teman Anda!`, 'base');
              showToast(`Room <strong>${res.roomId}</strong> berhasil dibuat!`, 'bi-shield-check text-warning');
            } else {
              alert('Gagal membuat room: ' + (res ? res.message : 'Error'));
            }
          });
        });
      });

      // Gabung Room MP
      $('#btnMpJoinRoom').on('click', function () {
        const serverUrl = $('#inputServerUrl').val().trim();
        const playerName = $('#inputMpPlayerName').val().trim() || 'Pemain';
        const playerAvatar = $('#inputMpPlayerAvatar').val() || '🐱';
        const roomCode = $('#inputMpRoomCode').val().trim().toUpperCase();

        if (!serverUrl) {
          alert('Masukkan URL server Railway terlebih dahulu!');
          return;
        }
        if (!roomCode || roomCode.length < 3) {
          alert('Masukkan kode room dengan benar!');
          return;
        }

        connectSocket(serverUrl, () => {
          socket.emit('joinRoom', { roomId: roomCode, playerName, playerAvatar }, (res) => {
            if (res && res.success) {
              mode = 'MULTIPLAYER';
              mpRoomId = res.roomId;
              isHost = false;

              $('#badgeGameMode').removeClass('bg-danger').addClass('bg-primary').text('Online Multiplayer');
              $('#roomInfoBar').removeClass('d-none');
              $('#currentRoomCodeDisplay').text(res.roomId);
              $('#speedControlBox').addClass('d-none');
              $('#gameLogs').empty();

              $('#multiplayerModal').modal('hide');
              addLog(`👋 Berhasil bergabung ke Room <strong>${res.roomId}</strong>! Menunggu host memulai game...`, 'info');
              showToast(`Selamat datang <strong>${playerName}</strong>! Joined room <strong>${res.roomId}</strong>`, 'bi-door-open-fill text-warning');
            } else {
              alert('Gagal bergabung: ' + (res ? res.message : 'Room tidak ditemukan'));
            }
          });
        });
      });

      // Host Klik Mulai Game di Multiplayer
      $('#btnHostStartGame').on('click', function () {
        if (socket && mode === 'MULTIPLAYER') {
          socket.emit('startGame', (res) => {
            if (res && !res.success) {
              alert(res.message);
            }
          });
        }
      });

      // Beralih kembali ke mode offline
      $('#btnSwitchOffline').on('click', function () {
        if (socket) socket.disconnect();
        $('#multiplayerModal').modal('hide');
        const humanAvatar = $('#setupPlayerAvatar').val() || $('#inputMpPlayerAvatar').val() || '🦊';
        initGameOffline(4, '4', $('#setupPlayerName').val() || 'Saya', humanAvatar);
      });

      // ==========================================
      // EVENT LISTENER USER AKSI KARTU & BUTTONS
      // ==========================================
      $(document).on('click', '#humanHandCards .playing-card', function () {
        if (gameState.gameOver) return;
        const cardId = parseInt($(this).data('card-id'));

        if (mode === 'MULTIPLAYER') {
          if (!gameState.isMyTurn) return;
          if (gameState.phase !== 'PLAYING' && gameState.phase !== 'CHOOSE_BASE') return;
          if (gameState.phase === 'PLAYING' && gameState.roundActedPlayers && gameState.roundActedPlayers.includes(gameState.myId)) return;
          socket.emit('playCard', { cardId });
        } else {
          // Jangan izinkan memainkan kartu jika sedang fase evaluasi/ROUND_SUMMARY atau bukan giliran pemain 0
          if (gameState.phase === 'ROUND_SUMMARY') return;
          if (gameState.turnIndex !== 0) return;
          const human = gameState.players[0];
          if (human.rank !== null) return;
          if (gameState.roundActedPlayers && gameState.roundActedPlayers.includes(human.id)) return;

          const card = human.hand.find(c => c.id === cardId);
          if (!card) return;

          if (gameState.phase === 'CHOOSE_BASE') {
            playCardOffline(human, card, true);
            return;
          }
          if (gameState.phase === 'PLAYING') {
            if (card.suit === gameState.activeSuit) {
              playCardOffline(human, card, false);
            } else {
              alert(`Anda wajib mengeluarkan kartu ${getSuitObj(gameState.activeSuit).name} (${getSuitObj(gameState.activeSuit).symbol})!`);
            }
          }
        }
      });

      // Klik Minum Kartu
      $('#btnHumanDrink, #drawPile').on('click', function () {
        if (gameState.gameOver) return;

        if (mode === 'MULTIPLAYER') {
          if (!gameState.isMyTurn) return;
          if (gameState.phase !== 'PLAYING') return;
          if (gameState.roundActedPlayers && gameState.roundActedPlayers.includes(gameState.myId)) return;
          socket.emit('drinkCard');
        } else {
          // Hanya izinkan minum saat fase PLAYING, giliran pemain 0, dan belum bertindak di ronde ini
          if (gameState.phase !== 'PLAYING') return;
          if (gameState.turnIndex !== 0) return;
          const human = gameState.players[0];
          if (human.rank !== null) return;
          if (gameState.roundActedPlayers && gameState.roundActedPlayers.includes(human.id)) return;

          if (hasMatchingSuit(human.hand, gameState.activeSuit)) {
            // alert(`Anda masih memiliki kartu ${getSuitObj(gameState.activeSuit).name}! Dilarang minum jika masih punya.`);
            return;
          }

          if (gameState.deck.length > 0) {
            handleDrinkOrPenaltyOffline(human);
          } else {
            if (gameState.trickPlays.length > 0) {
              applyTrickCardsPenaltyOffline(human);
            } else {
              if (!gameState.roundActedPlayers) gameState.roundActedPlayers = [];
              if (!gameState.roundActedPlayers.includes(human.id)) {
                gameState.roundActedPlayers.push(human.id);
              }
              addLog(`<strong>${human.name}</strong> Lewat (Skip) karena minuman habis dan meja kosong.`, 'skip');
              advanceToNextPlayerOffline();
            }
          }
        }
      });

      // Klik Ambil Penalti Kartu Meja
      $('#btnHumanTakePenalty').on('click', function () {
        if (gameState.gameOver) return;

        if (mode === 'MULTIPLAYER') {
          if (!gameState.isMyTurn) return;
          if (gameState.phase !== 'PLAYING') return;
          if (gameState.roundActedPlayers && gameState.roundActedPlayers.includes(gameState.myId)) return;
          socket.emit('takePenaltyCards');
        } else {
          if (gameState.phase !== 'PLAYING') return;
          if (gameState.turnIndex !== 0) return;
          const human = gameState.players[0];
          if (human.rank !== null) return;
          if (gameState.roundActedPlayers && gameState.roundActedPlayers.includes(human.id)) return;

          if (hasMatchingSuit(human.hand, gameState.activeSuit)) {
            alert(`Anda masih punya kartu yang cocok! Dilarang ambil penalti.`);
            return;
          }
          if (gameState.trickPlays.length > 0) {
            applyTrickCardsPenaltyOffline(human);
          }
        }
      });

      // Klik kartu meja langsung untuk ambil penalti
      $(document).on('click', '#currentTrickContainer .playing-card', function () {
        if (gameState.gameOver) return;
        if (gameState.phase !== 'PLAYING') return;
        const isMp = mode === 'MULTIPLAYER';
        const myHand = isMp ? gameState.myHand : gameState.players[0].hand;
        const deckCount = isMp ? gameState.deckCount : gameState.deck.length;

        if (!hasMatchingSuit(myHand, gameState.activeSuit) && deckCount === 0 && gameState.trickPlays.length > 0) {
          if (isMp) {
            if (gameState.isMyTurn && (!gameState.roundActedPlayers || !gameState.roundActedPlayers.includes(gameState.myId))) {
              socket.emit('takePenaltyCards');
            }
          } else {
            if (gameState.turnIndex === 0) {
              const human = gameState.players[0];
              if (!gameState.roundActedPlayers || !gameState.roundActedPlayers.includes(human.id)) {
                applyTrickCardsPenaltyOffline(human);
              }
            }
          }
        }
      });

      // Klik Lewat (Skip)
      $('#btnHumanSkip').on('click', function () {
        if (gameState.gameOver) return;

        if (mode === 'MULTIPLAYER') {
          if (!gameState.isMyTurn) return;
          if (gameState.phase !== 'PLAYING') return;
          if (gameState.roundActedPlayers && gameState.roundActedPlayers.includes(gameState.myId)) return;
          socket.emit('skipTurn');
        } else {
          if (gameState.phase !== 'PLAYING') return;
          if (gameState.turnIndex !== 0) return;
          const human = gameState.players[0];
          if (human.rank !== null) return;
          if (gameState.roundActedPlayers && gameState.roundActedPlayers.includes(human.id)) return;

          if (hasMatchingSuit(human.hand, gameState.activeSuit)) {
            alert(`Anda masih punya kartu yang cocok! Tidak boleh skip.`);
            return;
          }
          if (gameState.deck.length > 0) {
            alert(`Masih ada tumpukan minuman! Anda wajib minum terlebih dahulu.`);
            return;
          }
          if (gameState.trickPlays.length > 0) {
            alert(`Ada kartu di meja! Anda wajib mengambilnya karena minuman habis.`);
            return;
          }

          if (!gameState.roundActedPlayers) gameState.roundActedPlayers = [];
          if (!gameState.roundActedPlayers.includes(human.id)) {
            gameState.roundActedPlayers.push(human.id);
          }

          addLog(`<strong>${human.name}</strong> Lewat (Skip) karena meja kosong dan minuman habis.`, 'skip');
          advanceToNextPlayerOffline();
        }
      });

      // Tombol Modal Setup Offline
      $('#btnOpenSetupModal').on('click', function () {
        if (mode === 'MULTIPLAYER') {
          $('#multiplayerModal').modal('show');
        } else {
          $('#setupModal').modal('show');
        }
      });

      $('#btnStartNewGameOffline').on('click', function () {
        const playerCount = parseInt($('#setupPlayerCount').val());
        const dealOption = $('#setupDealCount').val();
        const playerName = $('#setupPlayerName').val().trim() || 'Saya';
        const playerAvatar = $('#setupPlayerAvatar').val() || '🦊';

        $('#setupModal').modal('hide');
        initGameOffline(playerCount, dealOption, playerName, playerAvatar);
      });

      function triggerNextRoundOffline() {
        if (window._offlineRoundTimer) clearTimeout(window._offlineRoundTimer);
        if (window._offlineCountdownInterval) clearInterval(window._offlineCountdownInterval);

        if (gameState.phase === 'ROUND_SUMMARY') {
          let nextLeaderId = gameState.offlineNextRoundLeader !== undefined ? gameState.offlineNextRoundLeader : 0;
          if (gameState.players[nextLeaderId] && gameState.players[nextLeaderId].rank !== null) {
            const active = gameState.players.filter(p => p.rank === null);
            if (active.length > 0) nextLeaderId = active[0].id;
          }

          gameState.roundLeader = nextLeaderId;
          gameState.turnIndex = nextLeaderId;
          gameState.baseCard = null;
          gameState.activeSuit = null;
          gameState.trickPlays = [];
          gameState.roundPlays = [];
          gameState.roundActedPlayers = [];
          gameState.roundNumber++;
          gameState.phase = 'CHOOSE_BASE';
          gameState.roundWinnerInfo = null;

          addLog(`▶️ Ronde #${gameState.roundNumber} dimulai! Giliran <strong>${gameState.players[gameState.roundLeader].name}</strong> menentukan Kartu baru.`, 'base');
          updateUI();
          runTurnCycleOffline();
        }
      }

      // Tombol Lanjut Ronde Berikutnya (User klik untuk next round setelah jeda kartu tertinggi)
      $('#btnNextRound').on('click', function () {
        if (mode === 'MULTIPLAYER') {
          if (socket && socket.connected) {
            socket.emit('nextRound');
          }
        } else {
          // Mode Offline
          triggerNextRoundOffline();
        }
      });

      // Tombol Rapikan Kartu di Tangan (Sort Hand manually)
      $('#btnReorderHand').on('click', function () {
        if (mode === 'MULTIPLAYER') {
          if (gameState.myHand && gameState.myHand.length > 0) {
            sortHand(gameState.myHand);
            if (socket && socket.connected) {
              socket.emit('reorderHand');
            }
            updateUI();
            showToast('Kartu di tangan telah dirapikan!', 'bi-sort-down text-warning');
          }
        } else {
          if (gameState.players && gameState.players[0] && gameState.players[0].hand) {
            sortHand(gameState.players[0].hand);
            updateUI();
            showToast('Kartu di tangan telah dirapikan!', 'bi-sort-down text-warning');
          }
        }
      });

      // Generator Nama Acak (Random Name)
      const randomNamesList = [
        'Sultan', 'Gacor', 'Kece', 'Ngebut', 'Galak',
        'Santuy', 'Ambyar', 'Sangar', 'Ninja',
        'Macho', 'Badas', 'Savage', 'Legenda', 'Misterius',
        'Panik', 'Anjay', 'Sabi', 'Gokil', 'Wibu'
      ];

      function getRandomPlayerName() {
        return randomNamesList[Math.floor(Math.random() * randomNamesList.length)];
      }

      $('#btnRandomMpName').on('click', function () {
        const randomName = getRandomPlayerName();
        $('#inputMpPlayerName').val(randomName);
        showToast(`Nama diacak: <strong>${randomName}</strong>`, 'bi-dice-5-fill text-warning');
      });

      $('#btnRandomOfflineName').on('click', function () {
        const randomName = getRandomPlayerName();
        $('#setupPlayerName').val(randomName);
        showToast(`Nama diacak: <strong>${randomName}</strong>`, 'bi-dice-5-fill text-warning');
      });

      // Toast notification helper
      function showToast(msg, icon = 'bi-bell-fill text-warning') {
        const $toast = $('#appToast');
        $toast.html(`<i class="bi ${icon} fs-5"></i><span>${msg}</span>`);
        $toast.addClass('show');
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => {
          $toast.removeClass('show');
        }, 3200);
      }

      // Fitur Salin Link Room (Langsung masuk via ?room=XXXXX)
      $('#btnCopyRoomCode, #btnCopyLobbyLink').on('click', function () {
        const roomCode = $('#currentRoomCodeDisplay').text().trim();
        if (!roomCode || roomCode === '-----') return;

        // Buat format URL langsung masuk ?room=XXXXX
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('room', roomCode);
        const shareLink = currentUrl.toString();

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareLink).then(() => {
            showCopySuccess();
          }).catch(() => {
            fallbackCopy(shareLink);
          });
        } else {
          fallbackCopy(shareLink);
        }
      });

      function showCopySuccess() {
        const $btn = $('#btnCopyRoomCode, #btnCopyLobbyLink');
        $btn.html('<i class="bi bi-check-lg me-1 text-success"></i> Copied!');
        showToast('Link room tersalin ke clipboard!', 'bi-clipboard-check-fill text-warning');
        setTimeout(() => {
          $btn.html('<i class="bi bi-copy me-1"></i> Copy');
        }, 2200);
      }

      function fallbackCopy(text) {
        const $temp = $('<input>');
        $('body').append($temp);
        $temp.val(text).select();
        document.execCommand('copy');
        $temp.remove();
        showCopySuccess();
      }

      // Lobby Start Game button (mirrors host start game)
      $('#btnLobbyStartGame').on('click', function () {
        $('#btnHostStartGame').trigger('click');
      });

      // Host mengubah jumlah kartu di waiting room
      $('#lobbyDealCountSelect').on('change', function () {
        const newDeal = $(this).val();
        if (mode === 'MULTIPLAYER' && socket && socket.connected && isHost) {
          socket.emit('changeDealOption', { dealOption: newDeal }, (res) => {
            if (res && res.message) {
              alert(res.message);
            }
          });
        }
      });

      // Exit Room / Lobby Handler (Screenshot 2 Match)
      $('#btnExitRoom').on('click', function () {
        if (confirm('Apakah Anda yakin ingin keluar dari room ini?')) {
          if (socket) socket.disconnect();
          $('#btnExitRoom').addClass('d-none');
          $('#roomInfoBar').addClass('d-none');
          $('#badgeGameMode').removeClass('bg-primary').addClass('bg-danger').text('Offline (Bot)');
          showToast('Anda telah keluar dari room', 'bi-box-arrow-left text-warning');
          initGameOffline(4, '4', $('#inputMpPlayerName').val() || 'Saya');
        }
      });

      // Tombol Main Lagi / Retry (Baik di GameOver modal maupun manual)
      $('#btnRestartAfterOver').on('click', function () {
        if (mode === 'MULTIPLAYER') {
          if (socket && socket.connected) {
            // Minta server untuk reset room state (retry tanpa buat room baru)
            socket.emit('restartGame', (res) => {
              $('#gameOverModal').modal('hide');
            });
          } else {
            $('#multiplayerModal').modal('show');
          }
        } else {
          $('#setupModal').modal('show');
        }
      });

      // Cek apakah ada query param ?room=xxxx di URL
      const urlParams = new URLSearchParams(window.location.search);
      const urlRoomCode = (urlParams.get('room') || '').trim().toUpperCase();

      // Inisialisasi awal
      initGameOffline(4, '4', 'Saya');

      if (urlRoomCode) {
        // Otomatis arahkan ke Tab Join Room dan isi kodenya
        $('#inputMpRoomCode').val(urlRoomCode);
        $('#pills-join-tab').tab('show');
        setTimeout(() => {
          $('#multiplayerModal').modal('show');
          addLog(`🔗 Terdeteksi undangan Room: <strong>${urlRoomCode}</strong>. Masukkan nama lalu klik Join Game Room!`, 'info');
        }, 350);
      } else {
        // Buka popup Buat / Gabung Room Online secara langsung saat pertama kali web dibuka
        setTimeout(() => {
          $('#multiplayerModal').modal('show');
        }, 350);
      }

    });
