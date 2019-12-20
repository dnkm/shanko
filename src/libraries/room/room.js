const config = require("../../utils/config");
const Users = require("./../user");
const Player = require("./components/player");
const Card = require("./components/card");
const Logger = require("../logger");

const FACES = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K"
];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];
const SUITS = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];
const PHASES = [
  { phase: "waiting", anims: ["ready"] },
  { phase: "betting", anims: ["bet"] },
  { phase: "deal", anims: ["deal"] },
  { phase: "auto-shan", anims: ["autoshan"] },
  { phase: "player phase", anims: ["draw", "pass"] },
  { phase: "three card", anims: ["three card"] },
  { phase: "banker phase", anims: ["draw", "pass"] },
  { phase: "results", anims: ["results"] }
];
const HIDDEN = { img: "hidden" };

function newDeck() {
  return new Array(52)
    .fill(0)
    .map((c, i) => new Card(SUITS[i % 4], FACES[i % 13]));
}

class Room {
  constructor(room, index, rank, io) {
    // lobby
    this.roomnumber = room;
    this.players = new Array(config.MAXPLAYERS).fill(undefined);
    this.phaseIndex = 0;
    this.minimumbank =
      index >= config[rank].ROOMS_1 ? config[rank].BANK_2 : config[rank].BANK_1;

    // room
    this.bank = 0;
    this.bankerIndex = -1;
    this.warning = -1;

    // internal
    this.revealed = [];
    this.gamesPlayed = 0;
    this.deck = newDeck();
    this.houseProfit = 0.0;
    this.bankerQueue = [];
    this.actions = [];
    this.nextPhase = this.initializeBank;
  }

  enter(user, socket, io) {
    if (!this.checkPlayer(user.id)) {
      let seat = this.findSeat();
      this.players[seat] = new Player(socket.id, this.findSeat());
      if (this.bankerIndex === -1) this.bankerIndex = user.sid;
      this.bankerQueue.push(user.sid);
      if (this.players.length === 1) {
        this.players[0].banker = true;
      }
      socket.join(this.roomnumber);
    }
    Logger.respLog(
      "resp_room_enter",
      {
        retcode: 0,
        roomnumber: this.roomnumber
      },
      "success"
    );
    socket.emit("resp_room_enter", {
      retcode: 0,
      roomnumber: this.roomnumber
    });

    this.piggyback(io);
    io.to(this.roomnumber).emit("rqst_ingame_imready", {
      ts: new Date().getTime()
    });
  }

  findSeat() {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i] === undefined) return i;
    }
    return -1;
  }

  leave(user, socket, io) {
    if (this.checkPlayer(user.sid)) {
      user.room = undefined;
      this.bankerQueue.filter(b => b !== user.sid);
      this.players = this.players.map(p =>
        p ? (p.sid === user.sid ? undefined : p) : undefined
      );
      socket.leave(this.roomnumber);
      Logger.respLog(
        "resp_room_leave",
        {
          retcode: 0,
          roomnumber: this.roomnumber,
          sid: user.sid
        },
        "success"
      );
      socket.emit("resp_room_leave", {
        retcode: 0,
        roomnumber: this.roomnumber,
        sid: user.sid
      });
      this.piggyback(io);
    }
  }

  start(user, socket, io) {
    if (
      this.phaseIndex !== 0 ||
      !this.checkPlayer(user.sid) ||
      this.bankerIndex !== user.sid
    )
      return;
    this.nextPhase = this.betting;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i] && this.players[i].sid === this.bankerIndex) {
        this.bank += this.minimumbank;
        this.players[i].balance -= this.minimumbank;
      }
    }
    Logger.respLog(
      "resp_ingame_imready",
      {
        sid: user.sid,
        deposit: this.minimumbank,
        ts: new Date().getTime()
      },
      this.roomnumber + " - start"
    );
    io.to(this.roomnumber).emit("resp_ingame_imready", {
      sid: user.sid,
      deposit: this.minimumbank,
      ts: new Date().getTime()
    });
  }

  ready(user, socket, io) {
    if (this.phaseIndex !== 0 || !this.checkPlayer(user.sid)) return;
    this.players.forEach(p => {
      if (p && p.sid === user.sid) p.isReady = true;
    });

    if (this.readyCheck()) {
      this.piggyback(io);
      this.nextPhase(io);
    }
  }

  readyCheck() {
    for (let i = 0; i < this.players.length; i++)
      if (this.players[i] && !this.players[i].isReady) return false;
    return true;
  }

  betting(io) {
    this.phaseIndex = 1;
    this.nextPhase = this.deal;
    io.to(this.roomnumber).emit("srqst_ingame_betstart", {
      ts: new Date().getTime()
    });
  }

  bet(data, user, socket, io) {
    if (this.phaseIndex !== 1 || !this.checkPlayer(user.sid)) return;
    for (let i = 0; i < this.players.length; i++)
      if (this.players[i] && this.players[i].sid === user.sid) {
        this.players[i].bet = data.betAmount;
        this.bank += data.betAmount;
        Users.changeCash(user, -data.betAmount);
        this.actions.push(user.sid);
        io.to(this.roomnumber).emit("srqst_ingame_place_bet", {
          sid: user.sid,
          betAmount: data.betAmount,
          ts: new Date().getTime(),
          bets: this.piggybackBets()
        });
      }
    if (this.actionCheck()) {
      io.to(this.roomnumber).emit("srqst_ingame_awaiting_animation", {
        animation: "bet",
        ts: new Date().getTime()
      });
    }
  }

  deal(io) {
    this.piggyback(io);
    this.phaseIndex = 2;
    this.nextPhase = this.autoShan;
    this.shuffle();
    this.players.forEach(p => {
      if (p) {
        p.cards.push(this.deck.pop());
        p.cards.push(this.deck.pop());
        let socket = Users.getUser(p.sid).socket;
        io.to(socket).emit("srqst_ingame_deal", {
          cards: p.cards
        });
      }
    });
  }

  autoShan(io) {
    this.piggyback(io);
    this.phaseIndex = 3;
    this.nextPhase = this.playerActions;
    let autoshans = [];
    let banker = undefined;
    this.players.forEach(p => {
      if (p) {
        let cards = this.cardsValue(p.cards);
        if (cards.total >= 8) {
          if (p.sid !== this.bankerIndex)
            autoshans.push({
              sid: p.sid,
              cards,
              result: true
            });
          else banker = cards;
        }
      }
    });
    if (banker) {
      this.nextPhase = this.results;
    }
    if (autoshans.length > 0)
      io.to(this.roomnumber).emit("srqst_ingame_autoshan", {
        results: autoshans.map(a => {
          return {
            sid: a.sid,
            result: a.result
          };
        })
      });

    this.nextPhase(io);
  }

  playerActions(io) {
    this.phaseIndex = 4;
    this.nextPhase = this.threeCard;
    io.to(this.roomnumber).emit("srqst_ingame_player_action", {
      ts: new Date().getTime()
    });
  }

  playerAction(data, user, socket, io) {
    if (this.phaseIndex !== 4 || this.checkPlayer(user.sid)) return;
    this.actions.push({ sid: user.sid, action: data.action });
  }

  actionCheck() {
    for (let i = 0; i < this.players.length; i++)
      if (this.players[i] && !this.actions.includes(this.players[i].sid))
        return false;
    this.actions = [];
    return true;
  }

  confirm(data, user, io) {
    if (!PHASES[this.phaseIndex].anims.includes(data.animation)) return;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i] && user.sid === this.players[i].sid)
        this.players[i].lastConfirmedAnimation = data.animation;
    }
    if (this.sync(data)) this.nextPhase(io);
  }

  sync(data) {
    for (let i = 0; i < this.players.length; i++) {
      if (
        this.players[i] &&
        this.players[i].lastConfirmedAnimation !== data.animation
      )
        return false;
    }
    return true;
  }

  // piggybacks
  piggyback(io) {
    // Logger.respLog(
    //   "resp_ingame_state",
    //   this.filterRoom(),
    //   "piggback - " + PHASES[this.phaseIndex].phase
    // );
    io.to(this.roomnumber).emit("resp_ingame_state", this.filterRoom());
  }

  piggybackBets() {
    return this.players.filter(p => p).map(p => this.filterBet(p));
  }

  piggybackPlayers() {
    return this.players.filter(p => p).map(p => this.filterPlayer(p));
  }

  checkPlayer(sid) {
    for (let i = 0; i < this.players.length; i++)
      if (this.players[i] && sid === this.players[i].sid) return true;
    return false;
  }

  // game

  shuffle(io) {
    for (let i = 0; i < 1000; i++) {
      let s1 = Math.floor(Math.random() * 52);
      let s2 = Math.floor(Math.random() * 52);
      let temp = this.deck[s1];
      this.deck[s1] = this.deck[s2];
      this.deck[s2] = temp;
    }
  }

  cardsValue(cards) {
    let highCard = 0;
    let total = 0;
    let suits = [];
    let values = [];
    let multiplier = 1;
    cards.forEach((c, i) => {
      let card = this.cardValue(c);
      total = (total + card.value) % 10;
      if (!values.includes(card.value)) values.push(card.value);
      if (!suits.includes(card.suit)) suits.push(card.suit);
      if (card.high > this.cardValue(cards[highCard]).high) {
        highCard = i;
      }
    });
    if (suits.length === 1) multiplier = 2;
    if (suits.length === 1 && cards.length === 3) multiplier = 3;
    if (values.length === 1 && cards.length === 3) multiplier = 5;
    return { highCard, total, multiplier };
  }

  cardValue(card) {
    let suit = SUITS.indexOf(card.img);
    let value = VALUES.indexOf(card.num);
    let high = FACES.indexOf(card.num) + suit / 10;
    return { suit, value, high };
  }

  compare(bCards, pCards) {
    if (pCards.total > bCards.total) return true;
    if (pCards.total === bCards.total && pCards.highCard > bCards.highCard)
      return true;
    return false;
  }

  results(cards) {
    let bCards;
    let pCards = this.cardsValue(cards);
    this.players.forEach(p => {
      if (p && p.sid === this.bankerIndex) bCards = this.cardsValue(p.card);
    });
    return {
      result: this.compare(bCards, pCards),
      multiplier: pCards.multiplier
    };
  }

  // filter

  filterLobby() {
    return {
      roomnumber: this.roomnumber,
      players: this.playerCnt(),
      bank: this.minimumbank,
      status:
        this.playerCnt() === this.players.length
          ? "full"
          : PHASES[this.phaseIndex].phase
    };
  }

  filterRoom() {
    return {
      roomnumber: this.roomnumber,
      players: this.players
        .filter(p => p)
        .map(p => {
          let player = {
            ...p,
            cards: this.hiddenCards(p)
          };
          delete player["lastConfirmedAnimation"];
          return player;
        }),
      bankerIndex: this.bankerIndex,
      turnIndex: this.turnIndex,
      phaseIndex: this.phaseIndex,
      minimumbank: this.minimumbank,
      bank: this.bank,
      status: this.status,
      warning: this.warning,
      deck: this.deck.length
    };
  }

  filterBet(player) {
    return {
      sid: player.sid,
      betAmount: player.bet
    };
  }
  
  filterPlayer(player) {
    return {
      sid: player.sid,
      cards: this.hiddenCards(player)
    };
  }

  hiddenCards(player) {
    return this.revealed.includes(player.sid)
      ? player.cards
      : new Array(player.cards.length).fill(0).map(c => {
          return { ...HIDDEN };
        });
  }

  // misc.

  playerCnt() {
    let cnt = 0;
    this.players.forEach(p => (p !== undefined ? cnt++ : (cnt += 0)));
    return cnt;
  }

  getUserList(socket) {
    let sids = [];
    this.players.forEach(p => (p ? sids.push(p.sid) : undefined));
    Logger.respLog("resp_ingame_userlist", sids, "success");
    socket.emit("resp_ingame_userlist", sids);
  }
}

module.exports = Room;
