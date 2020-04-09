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
    "K",
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
    { phase: "results", anims: ["results"] },
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
            index >= config[rank].ROOMS_1
                ? config[rank].BANK_2
                : config[rank].BANK_1;

        // room
        this.bank = 0;
        this.bankerIndex = -1;
        this.warning = -1;
        this.coins = {};
        this.winners = [];
        this.losers = [];

        // internal
        this.revealed = [];
        this.gamesPlayed = 0;
        this.deck = newDeck();
        this.houseProfit = 0.0;
        this.bankerQueue = [];
        this.deposit = true;
        this.actions = [];
        this.deals = {};
        this.draws = 0;
        this.sorted = [];
        this.betTotal = 0;
        this.reserved = 0;
        this.nextPhase = this.start;
        this.timer = undefined;
        this.time = 100000;
        this.leavers = [];
        this.standers = [];
    }

    enter(user, socket, io) {
        if (
            !this.spectators.includes(user.sid) &&
            this.findPlayer(user.sid) === -1
        )
            this.spectators.push(user.sid);
        user.room = this.roomnumber;
        user.inroom = true;
        Logger.respLog(
            "resp_room_enter",
            { retcode: 0, ...this.filterRoomState(user) },
            "success"
        );
        socket.emit("resp_room_enter", {
            retcode: 0,
            ...this.filterRoomState(user),
        });
    }

    ready(user, socket, io) {
        if (
            !this.spectators.includes(user.sid) &&
            this.findPlayer(user.sid) === -1
        )
            return;
        Logger.respLog("resp_ingame_imready", { retcode: 0 }, "success");
        socket.emit("resp_ingame_imready", {
            retcode: 0,
            ...this.filterRoomState(user),
        });
        if (this.findPlayer(user.sid) === -1) socket.join(this.roomnumber);
    }

    getSeated(data, user, socket, io) {
        if (typeof this.players[data.seatIndex] !== "undefined") {
            socket.emit("resp_ingame_sit", { retcode: 1 });
            return;
        }
        let p = this.findPlayer(user.sid);
        if (p === -1) {
            this.spectators = this.spectators.filter((s) => s !== user.sid);
            socket.leave(this.roomnumber);
            this.players[data.seatIndex] = new Player(
                socket.id,
                data.seatIndex
            );
            if (this.bankerIndex === -1) {
                this.bankerIndex = user.sid;
                this.players[data.seatIndex].banker = true;
            }
            this.bankerQueue.push(user.sid);
            socket.emit("resp_ingame_sit", {
                retcode: 0,
                ...this.filterRoomState(user),
            });
            this.piggyback(
                "srqst_ingame_newuser",
                {
                    ...this.players[data.seatIndex],
                },
                io
            );
        } else {
            if (this.phaseIndex !== 0 || this.phaseIndex !== 6) {
                socket.emit("resp_ingame_sit", { retcode: 1 });
                return;
            }
            this.players[data.seatIndex] = this.players[p];
            this.players[p] = undefined;
            socket.emit("resp_ingame_sit", {
                retcode: 0,
                ...this.filterRoomState(user),
            });
            this.piggyback(
                "srqst_ingame_newuser",
                {
                    ...this.players[data.seatIndex],
                },
                io
            );
        }
        if (this.playerCnt() === 3) this.nextPhase(io);
    }

    standUp(user, socket, io) {
        let si = this.findPlayer(user.sid);
        if (si === -1 || this.spectators.includes(user.sid)) {
            socket.emit("resp_ingame_standup", { retcode: 1 });
            return;
        }

        if (si !== -1) {
            if (!this.players[si].isActive) {
                this.players[si] = undefined;
                this.spectators.push(user.sid);
                if (this.bankerIndex === user.sid) this.nextBanker();
                this.bankerQueue = this.bankerQueue.filter(
                    (sid) => sid !== user.sid
                );
                socket.join(this.roomnumber);
                socket.emit("resp_ingame_standup", { retcode: 0 });
                this.piggyback("srqst_ingame_standup", { seatIndex: si }, io);
                user.playing = false;
                return;
            }
            if (
                (user.sid === this.bankerIndex && this.bank !== 0) ||
                (this.phaseIndex !== 0 && this.phaseIndex !== 6)
            ) {
                if (this.playerCnt() === 1) {
                    let b = this.findPlayer(user.sid);
                    this.spectators.push(user.sid);
                    this.players[b] = undefined;
                    socket.emit("resp_ingame_standup", { retcode: 0 });
                    this.piggyback(
                        "srqst_ingame_standup",
                        { seatIndex: si },
                        io
                    );
                    user.playing = false;
                    return;
                }
                socket.emit("resp_ingame_standup", {
                    retcode: 1,
                });
                return;
            }
            if (this.phaseIndex === 0 || this.phaseIndex === 6) {
                this.players[si] = undefined;
                this.spectators.push(user.sid);
                if (this.bankerIndex === user.sid) this.nextBanker();
                this.bankerQueue = this.bankerQueue.filter(
                    (sid) => sid !== user.sid
                );
                socket.join(this.roomnumber);
                socket.emit("resp_ingame_standup", { retcode: 0 });
                this.piggyback("srqst_ingame_standup", { seatIndex: si }, io);
                user.playing = false;
            } else {
                this.standers.push({ sid: user.sid, socket });
            }
        }
    }

    standUpCancel(user, socket, io) {
        if (this.standers.includes(user.sid)) {
            this.standers = this.standers.filter((sid) => sid !== user.sid);
            socket.emit("resp_ingame_standupcancel", { retcode: 0 });
        }
    }

    leave(user, socket, io) {
        console.log(1);
        // spectator leave
        if (this.spectators.includes(user.sid)) {
            this.spectators = this.spectators.filter((s) => s !== user.sid);
            socket.leave(this.roomnumber);
            socket.emit("resp_room_leave", {
                retcode: 0,
            });
            socket.emit("srqst_room_leave", {
                sid: user.sid,
                roomnumber: this.roomnumber,
            });
            Logger.respLog("resp_room_leave", {}, "success");
            Logger.respLog(
                "srqst_room_leave",
                {
                    sid: user.sid,
                    roomnumber: this.roomnumber,
                },
                "success"
            );
            user.room = undefined;
            user.inroom = false;
            user.playing = false;
            return;
        }
        console.log(2);
        // player leave
        let p = this.findPlayer(user.sid);
        if (p !== -1) {
            // not active player leave
            if (!this.players[p].isActive) {
                if (this.bankerIndex === user.sid) this.nextBanker();
                this.bankerQueue = this.bankerQueue.filter(
                    (b) => b !== user.sid
                );
                socket.leave(this.roomnumber);
                socket.emit("resp_room_leave", {
                    retcode: 0,
                });
                this.piggyback(
                    "srqst_room_leave",
                    {
                        sid: user.sid,
                        roomnumber: this.roomnumber,
                    },
                    io
                );
                this.players[p] = undefined;
                user.room = undefined;
                user.playing = false;
                user.inroom = false;
                return;
            }
            console.log(3);
            // attempting to leave if banker and bank is not empty
            // or if playing phase is active
            if (user.sid === this.bankerIndex && this.bank !== 0) {
                if (this.playerCnt() === 1) {
                    let b = this.findPlayer(this.bankerIndex);
                    socket.emit("resp_room_leave", { retcode: 0 });
                    this.piggyback(
                        "srqst_room_leave",
                        {
                            sid: user.sid,
                            roomnumber: this.roomnumber,
                        },
                        io
                    );
                    this.players[b] = 0;
                    user.room = undefined;
                    user.playing = false;
                    user.inroom = false;
                    return;
                }
                socket.emit("resp_room_leave", { retcode: 1 });
                return;
            }
            console.log(4);
            socket.emit("resp_room_leave", {
                retcode: 0,
            });
            // leaving during phase 0 or phase 6
            if (this.phaseIndex === 0 || this.phaseIndex === 6) {
                if (this.bankerIndex === user.sid) this.nextBanker();
                this.bankerQueue = this.bankerQueue.filter(
                    (b) => b !== user.sid
                );
                socket.leave(this.roomnumber);
                this.piggyback(
                    "srqst_room_leave",
                    {
                        sid: user.sid,
                        roomnumber: this.roomnumber,
                    },
                    io
                );

                this.players[p] = undefined;
                user.room = undefined;
                user.playing = false;
                user.inroom = false;
                Logger.respLog("resp_room_leave", { retcode: 0 }, "success");
            } else this.leavers.push({ sid: user.sid, socket });
            console.log(this.leavers);
        }
    }

    leaveCancel(user, socket, io) {
        if (this.leavers.includes(user.sid)) {
            this.leavers = this.leavers.filter((sid) => sid !== user.sid);
            socket.emit("resp_ingame_leavecancel", { retcode: 0 });
        }
    }

    start(io) {
        console.log(this.leavers);
        this.leavers.forEach((leaver) => {
            let sid = leaver.sid;
            let socket = leaver.socket;
            let p = this.findPlayer(sid);
            let user = Users.getUser(sid);
            if (this.bankerIndex === sid) this.nextBanker();
            this.bankerQueue = this.bankerQueue.filter((b) => b !== user.sid);
            socket.leave(this.roomnumber);
            this.piggyback(
                "srqst_room_leave",
                {
                    sid: user.sid,
                    roomnumber: this.roomnumber,
                },
                io
            );
            user.room = undefined;
            user.inroom = false;
            unser.playing = false;
            this.players[p] = undefined;
        });
        this.leavers = [];
        this.standers.forEach((stander) => {
            let sid = stander.sid;
            let si = this.findPlayer(sid);
            let socket = stander.socket;
            this.players[si] = undefined;
            this.spectators.push(sid);
            if (this.bankerIndex === sid) this.nextBanker();
            this.bankerQueue = this.bankerQueue.filter((b) => b !== sid);
            socket.join(this.roomnumber);
            this.piggyback("srqst_ingame_standup", { seatIndex: si }, io);
        });
        this.standers = [];

        this.phaseIndex = 0;
        console.log("---start---");
        this.nextPhase = this.betting;
        this.betTotal = 0;
        this.winners = [];
        this.losers = [];
        this.revealed = [];
        this.coins = {};
        this.totalDraws = 0;
        this.deals = {};
        this.deck = newDeck();
        this.players.forEach((p) => {
            if (typeof p !== "undefined") {
                p.isActive = true;
                p.cards = [];
                this.deals[p.sid] = 0;
                p.bet = 0;
                let user = Users.getUser(p.sid);
                user.playing = true;
            }
        });
        if (this.deposit) {
            let p = this.findPlayer(this.bankerIndex);
            this.warning = -1;
            this.players[p].balance -= this.minimumbank;
            this.bank += this.minimumbank;
            this.coins[this.minimumbank / 10] = 10;
            Users.changeCash(
                Users.getUser(this.bankerIndex),
                -this.minimumbank
            );
        }
        this.nextPhase(io);
    }

    betting(io) {
        this.phaseIndex = 1;
        console.log("---bet---");
        this.piggyback(
            "srqst_ingame_gamestart",
            { bankerDeposit: this.deposit },
            io
        );
        if (this.deposit) this.deposit = false;
    }

    bet(data, user, socket, io) {
        let p = this.findPlayer(user.sid);
        if (
            this.phaseIndex !== 1 ||
            p === -1 ||
            !this.players[p].isActive ||
            this.bankerIndex === user.sid ||
            this.checkAction(this.players[p])
        )
            return;
        let bet = data.betAmount;
        this.players[p].bet = bet;
        this.players[p].balance -= bet;
        this.betTotal += data.betAmount;
        this.actions.push({
            sid: user.sid,
            betAmount: bet,
            coins: data.coins,
        });
        if (typeof data.coins !== "undefined")
            Object.keys(data.coins).forEach((c) => {
                if (this.coins[c]) this.coins[c] += data.coins[c];
                else this.coins[c] = data.coins[c];
            });
        this.piggyback(
            "srqst_ingame_place_bet",
            {
                sid: user.sid,
                betAmount: bet,
                actions: this.actions,
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
        console.log("---deal---");
        this.nextPhase = this.playerActions;
        this.shuffle();
        let bWin = false;

        // 1002 testing room for banker auto-win
        if (this.roomnumber === 1002) {
            this.players.forEach((p) => {
                if (p && p.isActive) {
                    if (this.bankerIndex === p.sid) {
                        let c1 = { img: "HEARTS", num: "5" };
                        let c2 = { img: "HEARTS", num: "4" };
                        p.cards.push(c1);
                        p.cards.push(c2);
                        bWin = true;
                    } else {
                        let c1 = { img: "SPADES", num: "1" };
                        let c2 = { img: "SPADES", num: "2" };
                        p.cards.push(c1);
                        p.cards.push(c2);
                    }
                }
            });
        } else {
            this.players.forEach((p) => {
                if (typeof p !== "undefined" && p.isActive) {
                    p.cards.push(this.deck.pop());
                    p.cards.push(this.deck.pop());
                    if (this.cardsValue(p.cards).total >= 8)
                        if (this.bankerIndex === p.sid) bWin = true;
                        else this.revealed.push(p.sid);
                }
            });
        }

        if (bWin) this.nextPhase = this.results;
        else {
            this.revealed.forEach((sid) => this.winners.push(sid));
            if (this.revealed.length === this.playerCnt() - 1)
                this.nextPhase = this.results;
        }
        this.piggyback("srqst_ingame_deal", {}, io);
    }

    playerActions(io) {
        this.phaseIndex = 3;
        console.log("---playeraction---");
        this.nextPhase = this.threeCard;
        this.piggyback("srqst_ingame_player_action", {}, io);
    }

    playerAction(data, user, socket, io) {
        let p = this.findPlayer(user.sid);
        if (
            this.phaseIndex !== 3 ||
            p === -1 ||
            !this.players[p].isActive ||
            user.sid === this.bankerIndex ||
            this.revealed.includes(user.sid) ||
            this.checkAction(user.sid)
        )
            return;
        if (data.action === "draw") {
            this.players[p].cards.push(this.deck.pop());
            this.totalDraws++;
        }
        this.actions.push({ sid: user.sid, action: data.action });

        if (this.checkActions()) {
            this.piggyback(
                "srqst_ingame_player_action_update",
                {
                    actions: this.actions,
                },
                io
            );
            this.actions = [];
            if (this.totalDraws == 0) this.nextPhase(io);
        }
    }

    threeCard(io) {
        this.phaseIndex = 4;
        console.log("---threecard---");
        this.nextPhase = this.bankerActions;
        this.piggyback("srqst_ingame_three_card", {}, io);
    }

    bankerActions(io) {
        this.phaseIndex = 5;
        console.log("---bankeraction---");
        this.nextPhase = this.results;
        this.piggyback("srqst_ingame_banker_action", {}, io);
    }

    bankerAction(data, user, socket, io) {
        if (user.sid !== this.bankerIndex) return;
        if (this.phaseIndex === 4) {
            if (data === "threecard") {
                this.players.forEach((p) => {
                    if (
                        typeof p !== "undefined" &&
                        p.sid !== this.bankerIndex &&
                        p.cards.length === 3 &&
                        p.isActive
                    ) {
                        this.revealed.push(p.sid);
                        let result = this.result(p.cards);
                        if (result === -1) this.losers.push(p.sid);
                        else this.winners.push(p.sid);
                    }
                });
                if (
                    this.playerCnt() - 1 ===
                    this.losers.length + this.winners.length
                )
                    this.nextPhase = this.results;
            }
            this.piggyback("srqst_ingame_three_cards", {}, io);
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
                        action: "draw",
                    },
                    io
                );
            } else {
                this.piggyback(
                    "srqst_ingame_banker_action_update",
                    {
                        sid: this.bankerIndex,
                        action: "pass",
                    },
                    io
                );
                this.nextPhase(io);
            }
        }
    }

    results(io) {
        this.phaseIndex = 6;
        console.log("---results---");
        this.nextPhase = this.start;
        this.bank += this.betTotal;
        let resultplayers = [];
        let reserved = 0;
        let sorted = [];
        this.players.forEach((p) => {
            if (
                typeof p !== "undefined" &&
                this.bankerIndex !== p.sid &&
                p.isActive
            ) {
                let user = Users.getUser(p.sid);
                user.playing = false;
                delete p.lastConfirmedAnimation;
                let result = this.result(p.cards);
                if (result === -1 && !this.winners.includes(p.sid)) {
                    if (!this.losers.includes(p.sid)) this.losers.push(p.sid);
                    resultplayers.push({
                        sid: p.sid,
                        result: 0,
                        balanceBefore: p.balance + p.bet,
                        balanceAfter: p.balance,
                        winAmt: 0,
                    });
                } else {
                    reserved += p.bet;
                    if (!this.winners.includes(p.sid)) this.winners.push(p.sid);
                    sorted.push(p);
                }
            }
        });
        sorted = sorted.sort((a, b) => b.bet - a.bet);
        sorted.forEach((p) => {
            let result = this.cardsValue(p.cards).multiplier;
            if (result === -1) result = 1;
            let winAmt = p.bet * result + p.bet;

            reserved -= p.bet;
            if (winAmt > this.bank - reserved) winAmt = this.bank - reserved;
            resultplayers.push({
                sid: p.sid,
                result,
                balanceBefore: p.balance,
                balanceAfter: p.balance + winAmt,
                winAmt: winAmt,
            });
            this.bank -= winAmt;
            p.balance += winAmt;
        });

        if (this.warning === 3) {
            let b = this.findPlayer(this.bankerIndex);
            let u = Users.getUser(this.bankerIndex);
            Users.changeCash(u, this.bank);
            this.players[b].balance += this.bank;
            resultplayers.push({
                sid: u.sid,
                balanceBefore: this.players[b].balance - this.bank,
                balanceAfter: this.players[b].balance,
                winAmt: this.bank,
            });
            this.bank = 0;
        }
        this.piggyback("srqst_ingame_result", { resultplayers }, io);
        if (this.bank >= this.minimumbank * 3 && this.warning === -1)
            this.warning = 1;
        else if (this.warning !== -1 && this.warning < 3 && this.bank > 0)
            this.warning++;
        if (this.bank <= 0) this.nextBanker();
    }

    nextBanker() {
        let current = this.findPlayer(this.bankerIndex);
        delete this.players[current].banker;
        let removed = this.bankerQueue.splice(0, 1);
        this.bankerQueue.push(removed[0]);
        if (
            this.bankerQueue.length > 0 &&
            this.bankerQueue[0] !== this.bankerIndex
        ) {
            let next = this.findPlayer(this.bankerQueue[0]);
            this.players[next].banker = true;
            this.bankerIndex = this.players[next].sid;
        } else this.bankerIndex = -1;

        this.deposit = true;
    }

    // confirming animations and checking actions

    checkActions() {
        for (let i = 0; i < this.players.length; i++) {
            let p = this.players[i];
            if (
                typeof p === "undefined" ||
                p.sid === this.bankerIndex ||
                this.revealed.includes(p.sid) ||
                !p.isActive
            )
                continue;
            if (!this.checkAction(p)) return false;
        }
        return true;
    }

    checkAction(player) {
        for (let i = 0; i < this.actions.length; i++) {
            let a = this.actions[i];
            if (a.sid === player.sid) return true;
        }
        return false;
    }

    confirmDeal(user, io) {
        let p = this.findPlayer(user.sid);
        if (p === -1) return;

        console.log();
        console.log(user.sid);
        if (this.phaseIndex === 2 && this.deals[user.sid] < 1)
            this.deals[user.sid]++;
        else if (this.phaseIndex === 3 && this.deals[user.sid] < 2)
            this.deals[user.sid]++;
        else if (
            this.phaseIndex === 5 &&
            user.sid === this.bankerIndex &&
            this.deals[user.sid] < 2
        ) {
            this.nextPhase(io);
            return;
        }
        console.log(this.deals);
        console.log(this.totalDraws);

        if (this.syncDeals()) this.nextPhase(io);
    }

    syncDeals() {
        let cnt = 0;
        Object.keys(this.deals).forEach((sid) => {
            if (this.phaseIndex === 2 && this.deals[sid] === 1) cnt++;
            if (this.phaseIndex === 3 && this.deals[sid] === 2) cnt++;
        });

        if (this.phaseIndex === 2 && cnt === this.playerCnt()) return true;
        if (this.phaseIndex === 3 && cnt === this.totalDraws) return true;
        return false;
    }

    confirm(data, user, io) {
        if (!PHASES[this.phaseIndex].anims.includes(data)) return;
        let p = this.findPlayer(user.sid);
        if (p !== -1) this.players[p].lastConfirmedAnimation = data;
        if (this.phaseIndex === 3 && this.totalDraws > 0) return;
        if (this.sync()) this.nextPhase(io);
    }

    sync() {
        for (let i = 0; i < this.players.length; i++) {
            let p = this.players[i];
            if (
                typeof p !== "undefined" &&
                p.isActive &&
                !PHASES[this.phaseIndex].anims.includes(
                    p.lastConfirmedAnimation
                )
            )
                return false;
        }
        return true;
    }

    // game

    shuffle() {
        for (let i = 0; i < 1000; i++) {
            let s1 = Math.floor(Math.random() * 52);
            let s2 = Math.floor(Math.random() * 52);
            let temp = this.deck[s1];
            this.deck[s1] = this.deck[s2];
            this.deck[s2] = temp;
        }
    }

    // card results

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
            if (card.high > highCard) highCard = card.high;
        });
        if (suits.length === 1) multiplier = 2;
        if (suits.length === 1 && cards.length === 3) multiplier = 3;
        if (values.length === 1 && cards.length === 3) multiplier = 5;
        return { highCard, total, multiplier };
    }

    cardValue(card) {
        let suit = SUITS.indexOf(card.img);
        let value = VALUES[FACES.indexOf(card.num)];
        let high = FACES.indexOf(card.num) + 1 + suit / 10;
        return { suit, value, high };
    }

    result(cards) {
        let pCards = this.cardsValue(cards);
        let b = this.findPlayer(this.bankerIndex);
        let bCards = this.cardsValue(this.players[b].cards);
        if (pCards.total > bCards.total) return pCards.multiplier;
        else if (pCards.total < bCards.total) return -1;
        else {
            if (cards.length < this.players[b].cards.length)
                return pCards.multiplier;
            else if (cards.length > this.players[b].cards.length) return -1;
            else return pCards.high > bCards.high ? pCards.multiplier : -1;
        }
    }

    // piggybacks

    piggyback(protocol, content, io) {
        Logger.respLog(
            protocol,
            { ...content, ...this.filterRoomState() },
            "phase - " + PHASES[this.phaseIndex].phase
        );
        this.players.forEach((p) => {
            if (typeof p !== "undefined") {
                let user = Users.getUser(p.sid);
                io.to(user.socket).emit(protocol, {
                    ...content,
                    ...this.filterRoomState(user),
                });
            }
        });
        io.to(this.roomnumber).emit(protocol, {
            ...content,
            ...this.filterRoomState(),
        });
    }

    // filter

    filterLobby() {
        let cnt = this.playerCnt();
        let status =
            this.phaseIndex !== 0 && this.phaseIndex !== 6
                ? "running"
                : cnt === 0
                ? "open"
                : cnt === 8
                ? "full"
                : "waiting";
        return {
            roomnumber: this.roomnumber,
            players: cnt,
            spectators: this.spectators.length,
            bank: this.minimumbank,
            status,
        };
    }

    hiddenCards(length) {
        return new Array(length).fill(0).map((c) => {
            return { ...HIDDEN };
        });
    }

    filterRoomState(user) {
        return {
            ts: new Date().getTime(),
            roomnumber: this.roomnumber,
            players: this.players.map((p) => {
                if (typeof p !== "undefined") {
                    let player = { ...p };
                    delete player["lastConfirmedAnimation"];
                    if (this.phaseIndex === 6) return player;
                    if (
                        this.revealed.includes(p.sid) ||
                        this.winners.includes(p.sid) ||
                        this.losers.includes(p.sid)
                    )
                        return player;
                    if (typeof user !== "undefined" && user.sid === p.sid)
                        return player;
                    player.cards = this.hiddenCards(player.cards.length);
                    return player;
                }
                return p;
            }),
            bankerIndex: this.bankerIndex,
            phaseIndex: this.phaseIndex,
            minimumbank: this.minimumbank,
            bank: this.bank,
            coins: this.coins,
            status: this.status,
            warning: this.warning,
            deck: this.deck.length,
            winners: this.winners,
            losers: this.losers,
            spectator: user && this.findPlayer(user.sid) === -1 ? true : false,
        };
    }

    // misc.

    playerCnt() {
        let cnt = 0;
        this.players.forEach((p) => (p !== undefined ? cnt++ : (cnt += 0)));
        return cnt;
    }

    getUserList(socket) {
        let sids = [];
        this.players.forEach((p) => (p ? sids.push(p.sid) : undefined));
        Logger.respLog("resp_ingame_userlist", sids, "success");
        socket.emit("resp_ingame_userlist", sids);
    }

    findPlayer(sid) {
        for (let i = 0; i < this.players.length; i++)
            if (this.players[i] && sid === this.players[i].sid) return i;
        return -1;
    }

    shuffle() {
        for (let i = 0; i < 1000; i++) {
            let s1 = Math.floor(Math.random() * 52);
            let s2 = Math.floor(Math.random() * 52);
            let temp = this.deck[s1];
            this.deck[s1] = this.deck[s2];
            this.deck[s2] = temp;
        }
    }
}

module.exports = Room;
