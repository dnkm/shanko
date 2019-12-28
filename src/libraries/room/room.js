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
  { phase: "player phase", anims: ["player action"] },
  { phase: "three card", anims: ["three card"] },
  { phase: "banker phase", anims: ["banker action"] },
  { phase: "results", anims: ["results"] }
];
const HIDDEN = { img: "hidden" };

function newDeck() {
  return new Array(52)
    .fill(0)
    .map((c, i) => new Card(SUITS[i % 4], FACES[i % 13]));
}

class Room {
  constructor(room, index, rank) {
    // lobby
    this.roomnumber = room;
    this.players = new Array(config.MAXPLAYERS).fill(undefined);
    this.spectators = [];
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
    this.deposit = true;
    this.actions = [];
    this.nextPhase = this.start;
  }

  enter(user, socket, io) {
    if (!this.spectators.includes(user.sid) || this.findPlayer(user.sid) !== -1)
      this.spectators.push(user.sid);
    Logger.respLog(
      "resp_room_enter",
      { retcode: 0, ...this.filterRoomState() },
      "success"
    );
    socket.emit("resp_room_enter", { retcode: 0, ...this.filterRoomState() });
  }

  ready(user, socket, io) {
    if (!this.spectators.includes(user.sid)) return;
    Logger.respLog("resp_ingame_imready", { retcode: 0 }, "success");
    socket.emit("resp_ingame_imready", {
      retcode: 0,
      ...this.filterRoomState()
    });
    socket.join(this.roomnumber);
  }

  getSeated(data, user, socket, io) {
    if (this.findPlayer(user.sid) !== -1) {
      socket.emit("resp_ingame_sit", { retcode: 2 });
      return;
    }
    if (this.players[data.seatIndex] !== undefined) {
      socket.emit("resp_ingame_sit", { retcode: 1 });
      return;
    }
    this.spectators = this.spectators.filter(s => s !== user.sid);
    this.players[data.seatIndex] = new Player(socket.id, data.seatIndex);
    if (this.bankerIndex === -1) {
      this.bankerIndex = user.sid;
      this.players[data.seatIndex].banker = true;
    } else this.bankerQueue.push(user.sid);
    io.to(this.roomnumber).emit("srqst_ingame_newuser", {
      ...this.players[data.seatIndex]
    });
    socket.emit("resp_ingame_sit", {
      retcode: 0,
      ...this.filterRoomState(user)
    });
    if (this.playerCnt() === 3) this.nextPhase(io);
  }

  leave(user, socket, io) {
    if (this.spectators.includes(user.sid)) {
      this.spectators = this.spectators.filter(s => s !== user.sid);
      socket.emit("resp_room_leave", { retcode: 0 });
      return;
    }
    let p = this.findPlayer(user.sid);
    if (p !== -1) {
      if (user.sid === this.bankerIndex) this.nextBanker();
      user.room = undefined;
      this.bankerQueue = this.bankerQueue.filter(b => b !== user.sid);
      this.players[p] = undefined;
      socket.leave(this.roomnumber);
      Logger.respLog("resp_room_leave", { retcode: 0 }, "success");
      socket.emit("resp_room_leave", { retcode: 0 });
    }
  }

  start(io) {
    this.nextPhase = this.betting;
    let p = this.findPlayer(this.bankerIndex);
    this.players[p].balance -= this.minimumbank;
    this.bank += this.minimumbank;
    this.players.forEach(p => {
      if (p) p.isActive = true;
    });
    Users.changeCash(Users.getUser(this.bankerIndex), -this.minimumbank);
    this.nextPhase(io);
  }

  readyCheck() {
    for (let i = 0; i < this.players.length; i++)
      if (this.players[i] && !this.players[i].isReady) return false;
    return true;
  }

  betting(io) {
    this.phaseIndex = 1;
    this.nextPhase = this.deal;
    this.deposit = false;
    this.piggyback(
      "srqst_ingame_gamestart",
      { bankerDeposit: this.deposit },
      io
    );
  }

  bet(data, user, socket, io) {
    let p = this.findPlayer(user.sid);
    if (this.phaseIndex !== 1 || p === -1 || this.bankerIndex === user.sid)
      return;
    this.players[p].bet = data.betAmount;
    this.bank += data.betAmount;
    this.actions.push({ sid: user.sid, betAmount: data.betAmount });
    this.piggyback(
      "srqst_ingame_place_bet",
      {
        sid: user.sid,
        betAmount: data.betAmount,
        actions: this.actions
      },
      io
    );
    if (this.checkActions()) {
      this.actions = [];
      this.deal(io);
    }
  }

  deal(io) {
    this.phaseIndex = 2;
    this.nextPhase = this.playerActions;
    this.shuffle();
    this.players.forEach(p => {
      if (p) {
        p.cards.push(this.deck.pop());
        p.cards.push(this.deck.pop());
        if (this.cardsValue(p.cards).total >= 8) this.revealed.push(p.sid);
      }
    });
    this.piggyback("srqst_ingame_deal", {}, io);
  }

  playerActions(io) {
    this.phaseIndex = 3;
    this.nextPhase = this.threeCard;
    this.piggyback("srqst_ingame_player_action", {}, io);
  }

  playerAction(data, user, socket, io) {
    let p = this.findPlayer(user.sid);
    if (
      this.phaseIndex !== 3 ||
      p === -1 ||
      user.sid !== this.bankerIndex ||
      this.revealed.includes(user.sid)
    )
      return;
    if (data.action === "draw") this.players[p].cards.push(this.deck.pop());
    this.actions.push({ sid: user.sid, action: data.action });
    if (this.checkActions()) {
      this.piggyback(
        "srqst_ingame_player_action_update",
        {
          actions: this.actions
        },
        io
      );
      this.actions = [];
    }
  }

  threeCard(io) {
    this.phaseIndex = 4;
    this.nextPhase = this.bankerActions;
    let socket = Users.getUser(this.bankerIndex).socket;
    io.to(socket).emit("srqst_ingame_three_card");
  }

  bankerActions(io) {
    this.phaseIndex = 5;
    this.nextPhase = this.results;
    let socket = Users.getUser(this.bankerIndex).socket;
    io.to(socket).emit("srqst_ingame_banker_action");
  }

  bankerAction(data, user, socket, io) {
    if (this.phaseIndex === 4) {
      if (data === "threecard") {
        this.players.forEach(p => {
          if (p && p.cards.length === 3) this.revealed.push(p.sid);
        });
        this.piggyback("srqst_ingame_three_cards", {}, io);
      }
      this.nextPhase(io);
      return;
    }
    if (this.phaseIndex === 5) {
      if (data === "draw") {
        let p = this.findPlayer(this.bankerIndex);
        this.players[p].cards.push(this.deck.pop());
        this.piggyback(
          "srqst_ingame_banker_action_update",
          {
            sid: this.bankerIndex,
            action: "draw"
          },
          io
        );
      } else {
        this.piggyback(
          "srqst_ingame_banker_action_update",
          {
            sid: this.bankerIndex,
            action: "pass"
          },
          io
        );
      }
      this.nextPhase(io);
    }
  }

  results(io) {
    this.phaseIndex = 6;
    this.nextPhase = this.betting;
    let players = [];
    if (this.warning === 4) {
      let p = this.findPlayer(this.bankerIndex);
      this.players[p].balance += this.bank;
      this.bank = 0;
      this.warning = -1;
      this.players.forEach(p => {
        if (p && p.sid !== this.bankerIndex) {
          players.push({
            sid: p.sid,
            result: 0,
            balanceBefore: p.balance,
            balanceAfter: p.balance - p.bet,
            winAmount: -p.bet
          });
          p.balance -= p.bet;
          let user = Users.getUser(p.sid);
          Users.changeCash(user, -p.bet);
        }
      });
    } else {
      let sorted = this.players.sort((a, b) => b.bet - a.bet);
      let total = 0;
      sorted.forEach(p => {
        if (p && p.sid !== this.bankerIndex)
          if (this.result(p.cards) > -1) total += p.bet;
      });
      sorted.forEach(p => {
        if (p && p.sid !== this.bankerIndex) {
          let result = this.result(p.cards);
          let winAmount = p.bet * result;
          if (result !== -1) {
            winAmount = p.bet * result;
            if (winAmount > this.bank - total) winAmount = this.bank - total;
            this.bank -= winAmount;
          }
          players.push({
            sid: p.sid,
            result: result === -1 ? 0 : result,
            balanceBefore: p.balance,
            balanceAfter: p.balance + winAmount,
            winAmount
          });
          p.balance += winAmount;
          let user = Users.getUser(p.sid);
          Users.changeCash(user, winAmount);
        }
      });
    }
    if (this.bank === 0) this.warning = -1;
    else if (this.warning === -1 && this.bank >= this.minimumbank * 3)
      this.warning = 1;
    else this.warning++;

    this.piggyback("srqst_ingame_result", players, io);
  }

  nextBanker() {
    this.bankerQueue.splice(0, 1);
    if (this.bankerQueue.length > 0) this.bankerIndex = this.bankerQueue[0];
    else this.bankerIndex = -1;
  }

  checkActions() {
    for (let i = 0; i < this.players.length; i++) {
      if (
        this.players[i] &&
        (this.players[i].sid === this.bankerIndex ||
          this.revealed.includes(this.players[i]))
      )
        continue;
      if (this.players[i] && !this.checkAction(this.players[i])) return false;
    }
    return true;
  }

  checkAction(player) {
    for (let i = 0; i < this.actions.length; i++)
      if (this.actions[i].sid === player.sid) return true;
    return false;
  }

  confirm(data, user, io) {
    if (!PHASES[this.phaseIndex].anims.includes(data)) return;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i] && user.sid === this.players[i].sid)
        this.players[i].lastConfirmedAnimation = data;
    }
    if (this.sync()) this.nextPhase(io);
  }

  sync() {
    for (let i = 0; i < this.players.length; i++) {
      if (
        this.players[i] &&
        !PHASES[this.phaseIndex].anims.includes(
          this.players[i].lastConfirmedAnimation
        )
      )
        return false;
    }
    return true;
  }

  findPlayer(sid) {
    for (let i = 0; i < this.players.length; i++)
      if (this.players[i] && sid === this.players[i].sid) return i;
    return -1;
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

  result(cards) {
    let pCards = this.cardsValue(cards);
    let b = this.findPlayer(this.bankerIndex);
    let bCards = this.cardsValue(this.players[b].card);
    return this.compare(bCards, pCards) ? pCards.multiplier : -1;
  }

  // piggybacks

  piggyback(protocol, content, io) {
    Logger.respLog(
      protocol,
      { ...content, players: this.filterRoom(undefined) },
      "phase - " + PHASES[this.phaseIndex].phase
    );
    this.players.forEach(p => {
      if (p) {
        let user = Users.getUser(p.sid);
        io.to(user.socket).emit(protocol, {
          ...content,
          ...this.filterRoomState(user)
        });
      }
    });
  }

  // filter

  filterLobby() {
    return {
      roomnumber: this.roomnumber,
      players: this.playerCnt(),
      spectators: this.spectators.length,
      bank: this.minimumbank,
      status: this.phaseIndex === 0 ? "waiting" : "playing"
    };
  }

  filterRoom(player) {
    return {
      ts: new Date().getTime(),
      phaseIndex: this.phaseIndex,
      warning: this.warning,
      players: this.players
        .filter(p => p)
        .map(p => this.filterPlayer(player, p))
    };
  }

  filterPlayer(player, other) {
    return {
      sid: other.sid,
      cards:
        player && player.sid === other.sid
          ? player.cards
          : this.hiddenCards(other),
      betAmount: other.bet
    };
  }

  hiddenCards(player) {
    return this.revealed.includes(player.sid)
      ? player.cards
      : new Array(player.cards.length).fill(0).map(c => {
          return { ...HIDDEN };
        });
  }

  filterRoomState(user) {
    return {
      ts: new Date().getTime(),
      roomnumber: this.roomnumber,
      players: this.players.map(p => {
        if (p) {
          let player = { ...p };
          if (user && user.sid !== p.sid)
            player.cards = this.hiddenCards(player);
          delete player["lastConfirmedAnimation"];
          return player;
        }
        return p;
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
