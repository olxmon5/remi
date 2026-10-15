/**
 * Server Socket.io Game Remi Minuman (Jateng / Solo Raya)
 * Cocok untuk dideploy di Railway
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Server Game Remi Minuman (Socket.IO) Berjalan!');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const SUITS = [
  { id: 'hearts', name: 'Love / Hati', symbol: '♥', color: 'suit-hearts', icon: 'bi-suit-heart-fill' },
  { id: 'diamonds', name: 'Wajik / Diamond', symbol: '♦', color: 'suit-diamonds', icon: 'bi-suit-diamond-fill' },
  { id: 'clubs', name: 'Keriting / Club', symbol: '♣', color: 'suit-clubs', icon: 'bi-suit-club-fill' },
  { id: 'spades', name: 'Sekop / Spade', symbol: '♠', color: 'suit-spades', icon: 'bi-suit-spade-fill' }
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

function hasMatchingSuit(player, suitId) {
  if (!suitId) return true;
  return player.hand.some(c => c.suit === suitId);
}

// In-memory Room State
const rooms = {};

function getActivePlayers(room) {
  return room.players.filter(p => p.rank === null);
}

function broadcastRoom(roomId, event, data) {
  io.to(roomId).emit(event, data);
}

function sendSanitizedRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const activePlayers = getActivePlayers(room);

  // Kirim data ke setiap client di dalam room dengan hanya kartu tangan miliknya
  room.players.forEach(p => {
    const sanitizedPlayers = room.players.map(other => ({
      id: other.id,
      socketId: other.socketId,
      name: other.name,
      avatar: other.avatar || '🦊',
      cardCount: other.hand.length,
      rank: other.rank,
      isLoser: other.isLoser || false,
      isHost: other.socketId === room.hostSocketId
    }));

    io.to(p.socketId).emit('gameStateUpdate', {
      roomId: room.id,
      roomStatus: room.status,
      dealOption: room.dealOption,
      players: sanitizedPlayers,
      myHand: p.hand,
      myId: p.id,
      isMyTurn: room.status === 'PLAYING' &&
        (room.phase === 'PLAYING' || room.phase === 'CHOOSE_BASE') &&
        room.players[room.turnIndex] &&
        room.players[room.turnIndex].socketId === p.socketId &&
        !(room.roundActedPlayers && room.roundActedPlayers.includes(p.id)),
      deckCount: room.deck.length,
      baseCard: room.baseCard,
      activeSuit: room.activeSuit,
      trickPlays: room.trickPlays,
      turnIndex: room.turnIndex,
      roundLeader: room.roundLeader,
      roundNumber: room.roundNumber,
      phase: room.phase,
      rankings: room.rankings,
      gameOver: room.gameOver,
      activeCount: activePlayers.length,
      roundWinnerInfo: room.roundWinnerInfo || null,
      roundPlays: room.roundPlays || [],
      roundActedPlayers: room.roundActedPlayers || []
    });
  });
}

function checkGameOver(room) {
  const activePlayers = getActivePlayers(room);

  if (activePlayers.length === 1 && !room.gameOver) {
    const loser = activePlayers[0];
    loser.rank = room.players.length;
    loser.isLoser = true;
    room.rankings.push(loser.id);

    room.gameOver = true;
    room.phase = 'GAME_OVER';
    room.status = 'FINISHED';

    broadcastRoom(room.id, 'gameLog', {
      type: 'penalty',
      msg: `💀 Permainan Selesai! <strong>${loser.name}</strong> sisa ${loser.hand.length} kartu dan menjadi <strong>KALAH TERAKHIR</strong>!`
    });

    sendSanitizedRoomState(room.id);
    return true;
  }
  return false;
}

function advanceToNextPlayer(room) {
  if (checkGameOver(room)) return;

  const activePlayers = getActivePlayers(room);
  if (activePlayers.length <= 1) {
    checkGameOver(room);
    return;
  }

  let nextIdx = (room.turnIndex + 1) % room.players.length;
  let loops = 0;
  while (room.players[nextIdx].rank !== null && loops < room.players.length) {
    nextIdx = (nextIdx + 1) % room.players.length;
    loops++;
  }

  const roundFinished = room.roundActedPlayers && (
    room.roundActedPlayers.includes(nextIdx) ||
    activePlayers.every(p => room.roundActedPlayers.includes(p.id))
  );

  if (roundFinished) {
    room.turnIndex = -1;
    room.phase = 'ROUND_SUMMARY';
    evaluateTrickWinner(room);
    return;
  }

  room.turnIndex = nextIdx;
  sendSanitizedRoomState(room.id);
}

function evaluateTrickWinner(room) {
  room.turnIndex = -1;
  room.phase = 'ROUND_SUMMARY';
  sendSanitizedRoomState(room.id);
  broadcastRoom(room.id, 'gameLog', {
    type: 'info',
    msg: `Putaran kartu selesai. Menghitung kartu tertinggi...`
  });

  let playsToEvaluate = (room.roundPlays && room.roundPlays.length > 0)
    ? room.roundPlays
    : room.trickPlays;

  let validPlays = playsToEvaluate
    .filter(tp => tp.card.suit === room.activeSuit)
    .sort((a, b) => b.card.rankVal - a.card.rankVal);

  setTimeout(() => {
    if (!rooms[room.id]) return;

    if (validPlays.length === 0) {
      const active = getActivePlayers(room);
      let nextLeader = room.players.find(p => p.id === room.roundLeader);
      if (!nextLeader || nextLeader.rank !== null) nextLeader = active[0];

      room.trickPlays = [];
      room.roundPlays = [];
      room.roundActedPlayers = [];
      room.baseCard = null;
      room.activeSuit = null;
      room.phase = 'CHOOSE_BASE';
      if (nextLeader) {
        room.roundLeader = nextLeader.id;
        room.turnIndex = nextLeader.id;
      }
      sendSanitizedRoomState(room.id);
      return;
    }

    const winningPlay = validPlays[0];
    const roundWinner = room.players.find(p => p.id === winningPlay.playerId);

    broadcastRoom(room.id, 'gameLog', {
      type: 'win',
      msg: `★ <strong>${roundWinner.name}</strong> memenangkan ronde dengan <strong>${winningPlay.card.displayName}</strong>!`
    });

    let nextBaseLeader = null;

    if (roundWinner.rank === null) {
      nextBaseLeader = roundWinner;
    } else {
      for (let i = 1; i < validPlays.length; i++) {
        const cand = room.players.find(p => p.id === validPlays[i].playerId);
        if (cand && cand.rank === null) {
          nextBaseLeader = cand;
          broadcastRoom(room.id, 'gameLog', {
            type: 'info',
            msg: `Karena <strong>${roundWinner.name}</strong> sudah habis kartunya, hak membuat Base baru beralih ke <strong>${cand.name}</strong>!`
          });
          break;
        }
      }

      if (!nextBaseLeader) {
        const active = getActivePlayers(room);
        if (active.length > 0) {
          nextBaseLeader = active[0];
          broadcastRoom(room.id, 'gameLog', {
            type: 'info',
            msg: `Hak membuat Base baru diberikan kepada <strong>${nextBaseLeader.name}</strong>.`
          });
        }
      }
    }

    if (checkGameOver(room)) return;

    // Masuk ke fase ROUND_SUMMARY dengan jeda agar pemain bisa melihat kartu tertinggi
    room.phase = 'ROUND_SUMMARY';
    room.roundWinnerInfo = {
      winnerName: roundWinner.name,
      cardDisplayName: winningPlay.card.displayName,
      nextLeaderName: nextBaseLeader ? nextBaseLeader.name : roundWinner.name
    };
    room.nextRoundState = {
      nextBaseLeader: nextBaseLeader
    };

    sendSanitizedRoomState(room.id);

    // Auto lanjut ronde baru setelah 3 detik
    if (room.autoNextRoundTimer) clearTimeout(room.autoNextRoundTimer);
    room.autoNextRoundTimer = setTimeout(() => {
      startNextRound(room);
    }, 3000);
  }, 1000);
}

function startNextRound(room) {
  if (!room || room.status !== 'PLAYING' || room.gameOver || room.phase !== 'ROUND_SUMMARY') return;
  if (room.autoNextRoundTimer) {
    clearTimeout(room.autoNextRoundTimer);
    room.autoNextRoundTimer = null;
  }

  const active = getActivePlayers(room);
  let nextLeader = room.nextRoundState ? room.nextRoundState.nextBaseLeader : null;
  if (!nextLeader || (nextLeader && nextLeader.rank !== null)) {
    nextLeader = active.length > 0 ? active[0] : null;
  }

  if (nextLeader) {
    room.roundLeader = nextLeader.id;
    room.turnIndex = nextLeader.id;
  }
  room.baseCard = null;
  room.activeSuit = null;
  room.trickPlays = [];
  room.roundPlays = [];
  room.roundActedPlayers = [];
  room.roundNumber++;
  room.phase = 'CHOOSE_BASE';
  room.roundWinnerInfo = null;
  room.nextRoundState = null;

    broadcastRoom(room.id, 'gameLog', {
      type: 'base',
      msg: `▶️ Ronde #${room.roundNumber} dimulai! Giliran <strong>${room.players[room.roundLeader].name}</strong> menentukan Base baru.`
    });

    sendSanitizedRoomState(room.id);
  }

function applyTrickCardsPenalty(room, player) {
  if (!room.roundActedPlayers) room.roundActedPlayers = [];
  if (!room.roundActedPlayers.includes(player.id)) {
    room.roundActedPlayers.push(player.id);
  }

  if (room.trickPlays.length > 0) {
    broadcastRoom(room.id, 'gameLog', {
      type: 'penalty',
      msg: `🚨 <strong>${player.name}</strong> mengambil (${room.trickPlays.length}) kartu di meja sebagai minuman!`
    });

    for (let tp of room.trickPlays) {
      player.hand.push(tp.card);
    }
    room.trickPlays = [];
    room.baseCard = null;
    sendSanitizedRoomState(room.id);
  }
  advanceToNextPlayer(room);
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Buat Room
  socket.on('createRoom', ({ playerName, playerAvatar, dealOption }, callback) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      hostSocketId: socket.id,
      status: 'LOBBY',
      dealOption: dealOption || '4',
      players: [
        {
          id: 0,
          socketId: socket.id,
          name: playerName || 'Player 1',
          avatar: playerAvatar || '🦊',
          hand: [],
          rank: null,
          isLoser: false
        }
      ],
      deck: [],
      rankings: [],
      trickPlays: [],
      roundPlays: [],
      roundActedPlayers: [],
      baseCard: null,
      activeSuit: null,
      roundLeader: 0,
      turnIndex: 0,
      roundNumber: 1,
      phase: 'PLAYING',
      gameOver: false,
      lastWinnerId: null
    };

    socket.join(roomId);
    socket.roomId = roomId;
    if (callback) callback({ success: true, roomId });
    sendSanitizedRoomState(roomId);
  });

  // Host Mengubah Opsi Pembagian Kartu di Waiting Room
  socket.on('changeDealOption', ({ dealOption }, callback) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'LOBBY') return;
    if (socket.id !== room.hostSocketId) {
      return callback && callback({ success: false, message: 'Hanya host yang bisa mengubah pengaturan kartu!' });
    }

    room.dealOption = dealOption || '4';
    broadcastRoom(roomId, 'gameLog', {
      type: 'info',
      msg: `⚙️ Host mengubah pembagian kartu menjadi: <strong>${room.dealOption === 'all' ? 'Habiskan Deck' : room.dealOption + ' Kartu'}</strong>.`
    });
    sendSanitizedRoomState(roomId);
    if (callback) callback({ success: true });
  });

  // Gabung Room
  socket.on('joinRoom', ({ roomId, playerName, playerAvatar }, callback) => {
    const upperRoomId = (roomId || '').trim().toUpperCase();
    const room = rooms[upperRoomId];

    if (!room) {
      return callback && callback({ success: false, message: 'Room tidak ditemukan!' });
    }

    if (room.status !== 'LOBBY') {
      return callback && callback({ success: false, message: 'Game sudah berlangsung!' });
    }

    const newPlayer = {
      id: room.players.length,
      socketId: socket.id,
      name: playerName || `Player ${room.players.length + 1}`,
      avatar: playerAvatar || '🐱',
      hand: [],
      rank: null,
      isLoser: false
    };

    room.players.push(newPlayer);
    socket.join(upperRoomId);
    socket.roomId = upperRoomId;

    if (callback) callback({ success: true, roomId: upperRoomId });

    broadcastRoom(upperRoomId, 'gameLog', {
      type: 'info',
      msg: `👋 ${newPlayer.avatar || '👤'} <strong>${newPlayer.name}</strong> bergabung ke ruangan!`
    });

    sendSanitizedRoomState(upperRoomId);
  });

  // Mulai Game (Host only)
  socket.on('startGame', (callback) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    if (socket.id !== room.hostSocketId) {
      return callback && callback({ success: false, message: 'Hanya Host yang bisa memulai permainan!' });
    }

    if (room.players.length < 2) {
      return callback && callback({ success: false, message: 'Minimal butuh 2 pemain untuk mulai!' });
    }

    let fullDeck = shuffleDeck(createStandardDeck());
    let cardsPerPlayer = 4;
    if (room.dealOption === 'all') {
      cardsPerPlayer = Math.floor((fullDeck.length - 1) / room.players.length);
    } else {
      cardsPerPlayer = parseInt(room.dealOption, 10);
    }

    room.players.forEach(p => {
      p.hand = fullDeck.splice(0, cardsPerPlayer);
      p.rank = null;
      p.isLoser = false;
      sortHand(p.hand);
    });

    room.baseCard = fullDeck.pop();
    room.activeSuit = room.baseCard.suit;
    room.deck = fullDeck;
    room.rankings = [];
    room.trickPlays = [];
    room.roundPlays = [];
    room.roundActedPlayers = [];

    // Jika rematch/main lagi dan ada juara 1 game sebelumnya:
    // pemain juara 1 yang jalan pertama. Jika game pertama: random.
    let startLeader = 0;
    let leaderReason = '';
    if (room.lastWinnerId !== null && room.players.some(p => p.id === room.lastWinnerId)) {
      startLeader = room.lastWinnerId;
      leaderReason = `(Juara 1 Ronde Sebelumnya)`;
    } else {
      startLeader = Math.floor(Math.random() * room.players.length);
      leaderReason = `(Acak Ronde Pertama)`;
    }

    room.roundLeader = startLeader;
    room.turnIndex = startLeader;
    room.roundNumber = 1;
    room.phase = 'PLAYING';
    room.gameOver = false;
    room.status = 'PLAYING';

    const leaderPlayer = room.players.find(p => p.id === startLeader) || room.players[0];
    broadcastRoom(roomId, 'gameLog', {
      type: 'base',
      msg: `🎮 Game dimulai! Dibagikan ${cardsPerPlayer} kartu/orang. Base awal: <strong>${room.baseCard.displayName}</strong> (${room.baseCard.suitName}). Giliran pertama: <strong>${leaderPlayer.name}</strong> ${leaderReason}.`
    });

    sendSanitizedRoomState(roomId);
    if (callback) callback({ success: true });
  });

  // Ulangi / Retry Permainan dalam Room yang Sama (Reset room state)
  socket.on('restartGame', (callback) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    // Reset status room kembali ke LOBBY
    room.status = 'LOBBY';
    room.phase = 'PLAYING';
    room.gameOver = false;
    room.deck = [];
    room.rankings = [];
    room.trickPlays = [];
    room.roundPlays = [];
    room.roundActedPlayers = [];
    room.baseCard = null;
    room.activeSuit = null;
    room.roundLeader = 0;
    room.turnIndex = 0;
    room.roundNumber = 1;

    room.players.forEach(p => {
      p.hand = [];
      p.rank = null;
      p.isLoser = false;
    });

    broadcastRoom(roomId, 'gameLog', {
      type: 'info',
      msg: `🔄 Permainan telah direset ke Lobby! Host dapat menekan <strong>Mulai Game Sekarang</strong> untuk ronde baru.`
    });

    sendSanitizedRoomState(roomId);
    if (callback) callback({ success: true });
  });

  // Pemain / Host Klik Lanjut Ronde Baru (ROUND_SUMMARY -> Next Round)
  socket.on('nextRound', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'PLAYING' || room.gameOver) return;
    if (room.phase !== 'ROUND_SUMMARY') return;
    startNextRound(room);
  });

  // Pemain Mengurutkan Ulang Kartu di Tangan (Reorder Hand)
  socket.on('reorderHand', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.rank !== null) return;
    sortHand(player.hand);
    sendSanitizedRoomState(roomId);
  });

  // Pemain Mengeluarkan Kartu
  socket.on('playCard', ({ cardId }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'PLAYING' || room.gameOver) return;
    if (room.phase !== 'PLAYING' && room.phase !== 'CHOOSE_BASE') return;

    const curPlayer = room.players[room.turnIndex];
    if (!curPlayer || curPlayer.socketId !== socket.id || curPlayer.rank !== null) return;
    if (room.phase === 'PLAYING' && room.roundActedPlayers && room.roundActedPlayers.includes(curPlayer.id)) return;

    const cardIdx = curPlayer.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return;
    const card = curPlayer.hand[cardIdx];

    if (room.phase === 'CHOOSE_BASE') {
      curPlayer.hand.splice(cardIdx, 1);
      room.baseCard = card;
      room.activeSuit = card.suit;
      room.phase = 'PLAYING';
      room.trickPlays = [{ playerId: curPlayer.id, card: card }];
      room.roundPlays = [{ playerId: curPlayer.id, card: card }];
      room.roundActedPlayers = [curPlayer.id];

      broadcastRoom(roomId, 'gameLog', {
        type: 'base',
        msg: `<strong>${curPlayer.name}</strong> menentukan Base baru: <strong>${card.displayName}</strong> (${card.suitName})`
      });
    } else {
      if (card.suit !== room.activeSuit) return;

      curPlayer.hand.splice(cardIdx, 1);
      room.trickPlays.push({ playerId: curPlayer.id, card: card });
      if (!room.roundPlays) room.roundPlays = [];
      room.roundPlays.push({ playerId: curPlayer.id, card: card });
      if (!room.roundActedPlayers) room.roundActedPlayers = [];
      if (!room.roundActedPlayers.includes(curPlayer.id)) {
        room.roundActedPlayers.push(curPlayer.id);
      }

      broadcastRoom(roomId, 'gameLog', {
        type: 'play',
        msg: `<strong>${curPlayer.name}</strong> mengeluarkan <strong>${card.displayName}</strong>`
      });
    }

    // Cek lolos
    if (curPlayer.hand.length === 0 && curPlayer.rank === null) {
      const rank = room.rankings.length + 1;
      curPlayer.rank = rank;
      room.rankings.push(curPlayer.id);
      if (rank === 1) {
        room.lastWinnerId = curPlayer.id;
      }

      broadcastRoom(roomId, 'gameLog', {
        type: 'rank',
        msg: `🎉 <strong>${curPlayer.name}</strong> menghabiskan kartu dan meraih <strong>Peringkat #${rank}</strong>!`
      });
    }

    if (checkGameOver(room)) return;
    advanceToNextPlayer(room);
  });

  // Pemain Minum Kartu
  socket.on('drinkCard', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'PLAYING' || room.gameOver) return;
    if (room.phase !== 'PLAYING') return;

    const curPlayer = room.players[room.turnIndex];
    if (!curPlayer || curPlayer.socketId !== socket.id || curPlayer.rank !== null) return;
    if (room.roundActedPlayers && room.roundActedPlayers.includes(curPlayer.id)) return;

    if (hasMatchingSuit(curPlayer, room.activeSuit)) return;

    if (room.deck.length > 0) {
      const drawnCard = room.deck.pop();
      curPlayer.hand.push(drawnCard);

      broadcastRoom(roomId, 'gameLog', {
        type: 'drink',
        msg: `<strong>${curPlayer.name}</strong> tidak punya kartu cocok → <strong>MINUM</strong> 1 kartu.`
      });

      sendSanitizedRoomState(roomId);
    } else {
      // Deck habis
      if (room.trickPlays.length > 0) {
        applyTrickCardsPenalty(room, curPlayer);
      } else {
        if (!room.roundActedPlayers) room.roundActedPlayers = [];
        if (!room.roundActedPlayers.includes(curPlayer.id)) {
          room.roundActedPlayers.push(curPlayer.id);
        }
        broadcastRoom(roomId, 'gameLog', {
          type: 'skip',
          msg: `<strong>${curPlayer.name}</strong> Lewat (Skip) karena meja kosong dan minuman habis.`
        });
        advanceToNextPlayer(room);
      }
    }
  });

  // Pemain Ambil Penalti Meja
  socket.on('takePenaltyCards', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'PLAYING' || room.gameOver) return;
    if (room.phase !== 'PLAYING') return;

    const curPlayer = room.players[room.turnIndex];
    if (!curPlayer || curPlayer.socketId !== socket.id || curPlayer.rank !== null) return;
    if (room.roundActedPlayers && room.roundActedPlayers.includes(curPlayer.id)) return;

    if (!hasMatchingSuit(curPlayer, room.activeSuit) && room.deck.length === 0 && room.trickPlays.length > 0) {
      applyTrickCardsPenalty(room, curPlayer);
    }
  });

  // Pemain Lewat (Skip)
  socket.on('skipTurn', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'PLAYING' || room.gameOver) return;
    if (room.phase !== 'PLAYING') return;

    const curPlayer = room.players[room.turnIndex];
    if (!curPlayer || curPlayer.socketId !== socket.id || curPlayer.rank !== null) return;
    if (room.roundActedPlayers && room.roundActedPlayers.includes(curPlayer.id)) return;

    if (hasMatchingSuit(curPlayer, room.activeSuit)) return;
    if (room.deck.length > 0 || room.trickPlays.length > 0) return;

    if (!room.roundActedPlayers) room.roundActedPlayers = [];
    if (!room.roundActedPlayers.includes(curPlayer.id)) {
      room.roundActedPlayers.push(curPlayer.id);
    }

    broadcastRoom(roomId, 'gameLog', {
      type: 'skip',
      msg: `<strong>${curPlayer.name}</strong> Lewat (Skip) karena meja kosong dan minuman habis.`
    });

    advanceToNextPlayer(room);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      const pIdx = room.players.findIndex(p => p.socketId === socket.id);
      if (pIdx !== -1) {
        const leftName = room.players[pIdx].name;
        broadcastRoom(roomId, 'gameLog', {
          type: 'penalty',
          msg: `⚠️ <strong>${leftName}</strong> terputus dari permainan.`
        });

        // Jika di lobby, hapus pemain
        if (room.status === 'LOBBY') {
          room.players.splice(pIdx, 1);
          if (room.players.length === 0) {
            delete rooms[roomId];
          } else {
            if (socket.id === room.hostSocketId) {
              room.hostSocketId = room.players[0].socketId;
            }
            sendSanitizedRoomState(roomId);
          }
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server Remi Minuman berjalan pada port ${PORT}`);
});
